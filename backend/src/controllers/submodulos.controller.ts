import type { Request, Response } from 'express';
import { query, queryOne } from '../config/db.js';
import { audit } from '../services/audit.service.js';
import { fueraDeSuSede } from '../services/jerarquia.service.js';
import type { SubModulo } from '../types/db.js';

/** Nombre del índice de `database/submodulo_codigo_unico.sql`. */
const INDICE_CODIGO_SEDE = 'uq_sub_modulos_codigo_sede';

/**
 * Distingue el choque con el código de cliente de cualquier otro duplicado.
 *
 * Sin esto, el error caía en el manejador global y el usuario recibía el 409
 * genérico "Ya existe un elemento con esos datos", que no dice ni qué campo
 * repitió ni por qué el mismo código sí vale en otra sede.
 */
function esCodigoRepetido(error: unknown): boolean {
  const e = error as { code?: string; errno?: number; sqlMessage?: string };
  const esDuplicado = e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;
  return esDuplicado && (e.sqlMessage ?? '').includes(INDICE_CODIGO_SEDE);
}

function respuestaCodigoRepetido(codigo: string, sede: string | null | undefined) {
  const donde = sede ? `en la sede ${sede}` : 'en esta sede';
  return {
    error: `Ya existe un cliente con el código ${codigo} ${donde}. Use otro código o edite el cliente existente.`,
    code: 'CODIGO_CLIENTE_REPETIDO',
  };
}

export async function listSubModulos(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ message: 'Rol no autorizado' });
    return;
  }

  const { rol, id, sede } = user;
  let sql = '';
  const params: unknown[] = [];

  if (rol === 'LIDER' || rol === 'ADMIN') {
    sql = 'SELECT * FROM sub_modulos WHERE sede_submodulos = ?';
    params.push(sede);
  } else if (rol === 'TECNICA' || rol === 'CALIDAD') {
    // Los clientes visibles derivan de las cajas asignadas al usuario
    // (asignacion_caja_* -> modulos_caja -> moduloscliente -> sub_modulos).
    const tablaAsignacion = rol === 'CALIDAD' ? 'asignacion_caja_calidad' : 'asignacion_caja_tecnica';
    sql = `SELECT sm.* FROM sub_modulos sm
      WHERE sm.sede_submodulos = ? AND EXISTS (
        SELECT 1 FROM moduloscliente m
        JOIN modulos_caja mc ON mc.id_modulo_caja = m.id
        JOIN ${tablaAsignacion} a ON a.modulo_id = mc.id
        WHERE m.id_submodulo = sm.id AND a.usuario_id = ?
      )`;
    params.push(sede, id);
  } else {
    res.status(403).json({ message: 'Rol no autorizado' });
    return;
  }

  const results = await query<SubModulo>(sql, params);
  res.json(results);
}

export async function createSubModulo(req: Request, res: Response): Promise<void> {
  const { codigo, entidad_remitente } = req.body as { codigo: string; entidad_remitente: string };
  const sede_submodulos = req.session.user?.sede;

  if (!codigo || !entidad_remitente) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  try {
    await query('INSERT INTO sub_modulos (codigo, entidad_remitente, sede_submodulos) VALUES (?, ?, ?)', [
      codigo,
      entidad_remitente,
      sede_submodulos,
    ]);
  } catch (error) {
    if (esCodigoRepetido(error)) {
      res.status(409).json(respuestaCodigoRepetido(codigo, sede_submodulos));
      return;
    }
    throw error;
  }
  res.status(201).send('Sub-módulo creado correctamente');
}

export async function updateSubModulo(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { codigo, entidad_remitente } = req.body as { codigo: string; entidad_remitente: string };
  const user = req.session.user;

  if (!codigo || !entidad_remitente) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  const cliente = await queryOne<SubModulo>('SELECT * FROM sub_modulos WHERE id = ?', [id]);
  if (!cliente) {
    res.status(404).json({ error: 'El cliente no existe' });
    return;
  }
  // Un líder solo edita los clientes de su sede. La sede del cliente no cambia
  // al editar: antes se sobrescribía con la de quien editaba, lo que permitía
  // "traerse" un cliente de otra sede.
  if (fueraDeSuSede(user, cliente.sede_submodulos)) {
    res.status(403).json({ error: 'Solo puede editar clientes de su sede' });
    return;
  }

  try {
    await query('UPDATE sub_modulos SET codigo = ?, entidad_remitente = ? WHERE id = ?', [codigo, entidad_remitente, id]);
  } catch (error) {
    if (esCodigoRepetido(error)) {
      res.status(409).json(respuestaCodigoRepetido(codigo, cliente.sede_submodulos));
      return;
    }
    throw error;
  }
  res.send('Cliente actualizado correctamente');
}

export async function deleteSubModulo(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.session.user;

  const cliente = await queryOne<SubModulo>('SELECT * FROM sub_modulos WHERE id = ?', [id]);
  if (!cliente) {
    res.status(404).json({ error: 'El cliente no existe o ya fue eliminado' });
    return;
  }
  // Un líder solo administra los clientes de su sede; el administrador, todos.
  if (user?.rol === 'LIDER' && cliente.sede_submodulos !== user.sede) {
    res.status(403).json({ error: 'Solo puede eliminar clientes de su sede' });
    return;
  }

  // No se puede eliminar un sub-módulo con módulos cliente asociados: la FK
  // fk_submodulo (moduloscliente.id_submodulo) lo impediría con un 500 genérico.
  const dependientes = await query<{ total: number }>(
    'SELECT COUNT(*) AS total FROM moduloscliente WHERE id_submodulo = ?',
    [id],
  );
  if ((dependientes[0]?.total ?? 0) > 0) {
    res.status(409).json({
      error: `No se puede eliminar: el cliente tiene ${dependientes[0].total} acta(s) registrada(s)`,
    });
    return;
  }

  await query('DELETE FROM sub_modulos WHERE id = ?', [id]);
  void audit({
    entidad: 'sub_modulos',
    entidadId: id,
    accion: 'ELIMINAR',
    detalle: `Cliente ${cliente.codigo} — ${cliente.entidad_remitente}`,
    usuario: user,
  });
  res.send('Cliente eliminado correctamente');
}
