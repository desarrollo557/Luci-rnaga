import type { Request, Response } from 'express';
import { query, queryOne } from '../config/db.js';
import { audit } from '../services/audit.service.js';
import { fueraDeSuSede, sedeDeActa, sedeDeCliente } from '../services/jerarquia.service.js';
import type { ModuloCliente } from '../types/db.js';

export async function listModulosCliente(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ message: 'Acceso no permitido' });
    return;
  }

  const subModuloId = String(req.query.subModuloId ?? '');

  if (user.rol === 'TECNICA' || user.rol === 'CALIDAD') {
    // Técnica y calidad ven las actas en las que tienen al menos una caja
    // asignada: la asignación por caja es la única fuente de acceso.
    const tablaAsignacion = user.rol === 'CALIDAD' ? 'asignacion_caja_calidad' : 'asignacion_caja_tecnica';
    const filtroSubModulo = subModuloId ? ' AND m.id_submodulo = ?' : '';
    const params: unknown[] = subModuloId ? [user.id, subModuloId] : [user.id];
    const results = await query<ModuloCliente>(
      `SELECT m.*, (SELECT COUNT(*) FROM modulos_caja mc WHERE mc.id_modulo_caja = m.id) AS total_cajas
       FROM moduloscliente m
       WHERE EXISTS (
         SELECT 1 FROM modulos_caja mc
         JOIN ${tablaAsignacion} a ON a.modulo_id = mc.id
         WHERE mc.id_modulo_caja = m.id AND a.usuario_id = ?
       )${filtroSubModulo}`,
      params,
    );
    res.json(results);
  } else if (user.rol === 'LIDER' || user.rol === 'ADMIN') {
    const results = subModuloId
      ? await query<ModuloCliente>(
          `SELECT m.*, (SELECT COUNT(*) FROM modulos_caja mc WHERE mc.id_modulo_caja = m.id) AS total_cajas
           FROM moduloscliente m
           WHERE m.id_submodulo = ?`,
          [subModuloId],
        )
      : await query<ModuloCliente>(
          `SELECT m.*, (SELECT COUNT(*) FROM modulos_caja mc WHERE mc.id_modulo_caja = m.id) AS total_cajas
           FROM moduloscliente m`,
        );
    res.json(results);
  } else {
    res.status(403).json({ message: 'Acceso no permitido' });
  }
}

export async function getModuloClienteById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const results = await query<ModuloCliente>('SELECT * FROM moduloscliente WHERE id = ?', [id]);

  if (results.length === 0) {
    res.status(404).json({ message: 'Módulo cliente no encontrado' });
    return;
  }

  res.json(results[0]);
}

export async function createModuloCliente(req: Request, res: Response): Promise<void> {
  const { codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo } =
    req.body as Partial<ModuloCliente>;

  if (!codigo || !entidad_remitente || !acta_transferencia_modulo || !id_submodulo) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  // El acta cuelga de un cliente existente y, para un líder, de su propia sede.
  const cliente = await sedeDeCliente(id_submodulo);
  if (!cliente.existe) {
    res.status(404).json({ error: 'El cliente indicado no existe' });
    return;
  }
  if (fueraDeSuSede(req.session.user, cliente.sede)) {
    res.status(403).json({ error: 'Solo puede crear actas para clientes de su sede' });
    return;
  }

  await query(
    'INSERT INTO moduloscliente (codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo) VALUES (?, ?, ?, ?, ?)',
    [codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo],
  );
  res.status(201).send('Módulo cliente creado');
}

export async function updateModuloCliente(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo } =
    req.body as Partial<ModuloCliente>;

  if (!codigo || !entidad_remitente || !acta_transferencia_modulo || !fecha_trans_modulo || !id_submodulo) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  const acta = await sedeDeActa(id);
  if (!acta.existe) {
    res.status(404).json({ error: 'El acta no existe' });
    return;
  }
  if (fueraDeSuSede(req.session.user, acta.sede)) {
    res.status(403).json({ error: 'Solo puede editar actas de clientes de su sede' });
    return;
  }
  // Si se mueve el acta a otro cliente, ese cliente también debe ser de su sede.
  const destino = await sedeDeCliente(id_submodulo);
  if (!destino.existe) {
    res.status(404).json({ error: 'El cliente indicado no existe' });
    return;
  }
  if (fueraDeSuSede(req.session.user, destino.sede)) {
    res.status(403).json({ error: 'No puede mover el acta a un cliente de otra sede' });
    return;
  }

  await query(
    'UPDATE moduloscliente SET codigo = ?, entidad_remitente = ?, acta_transferencia_modulo = ?, fecha_trans_modulo = ?, id_submodulo = ? WHERE id = ?',
    [codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo, id],
  );
  res.send('Módulo cliente actualizado');
}

export async function deleteModuloCliente(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.session.user;

  const acta = await queryOne<{ id: number; codigo: string; acta_transferencia_modulo: string; sede: string | null }>(
    `SELECT m.id, m.codigo, m.acta_transferencia_modulo, sm.sede_submodulos AS sede
     FROM moduloscliente m
     LEFT JOIN sub_modulos sm ON sm.id = m.id_submodulo
     WHERE m.id = ?`,
    [id],
  );
  if (!acta) {
    res.status(404).json({ error: 'El acta no existe o ya fue eliminada' });
    return;
  }
  // Un líder solo administra las actas de los clientes de su sede.
  if (user?.rol === 'LIDER' && acta.sede && acta.sede !== user.sede) {
    res.status(403).json({ error: 'Solo puede eliminar actas de clientes de su sede' });
    return;
  }

  // No se puede eliminar un módulo cliente con cajas asociadas: la FK
  // (modulos_caja.id_modulo_caja) lo impediría con un 500 genérico.
  const dependientes = await query<{ total: number }>(
    'SELECT COUNT(*) AS total FROM modulos_caja WHERE id_modulo_caja = ?',
    [id],
  );
  if ((dependientes[0]?.total ?? 0) > 0) {
    res.status(409).json({
      error: `No se puede eliminar: el acta tiene ${dependientes[0].total} caja(s) registrada(s)`,
    });
    return;
  }

  await query('DELETE FROM moduloscliente WHERE id = ?', [id]);
  void audit({
    entidad: 'moduloscliente',
    entidadId: id,
    accion: 'ELIMINAR',
    detalle: `Acta ${acta.acta_transferencia_modulo} del cliente ${acta.codigo}`,
    usuario: user,
  });
  res.send('Acta eliminada correctamente');
}

export async function countCajasOfModulo(req: Request, res: Response): Promise<void> {
  const moduloClienteId = String(req.query.modulo_cliente_id ?? '');

  if (!moduloClienteId) {
    res.status(400).json({ error: 'modulo_cliente_id es requerido' });
    return;
  }

  const rows = await query<{ total: number }>(
    'SELECT COUNT(*) AS total FROM modulos_caja WHERE id_modulo_caja = ?',
    [moduloClienteId],
  );
  res.json({ total: rows[0]?.total ?? 0 });
}
