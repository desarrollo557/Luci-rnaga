import type { Request, Response } from 'express';
import { query } from '../config/db.js';
import type { SubModulo } from '../types/db.js';

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
  } else if (rol === 'TECNICA') {
    // Los submódulos visibles derivan de los módulos cliente asignados al usuario
    // (modulo_tecnica -> moduloscliente.id_submodulo -> sub_modulos.id).
    sql = `SELECT DISTINCT sm.* FROM sub_modulos sm
      JOIN moduloscliente m ON m.id_submodulo = sm.id
      JOIN modulo_tecnica mt ON mt.modulo_id = m.id
      WHERE mt.usuario_id = ? AND sm.sede_submodulos = ?`;
    params.push(id, sede);
  } else if (rol === 'CALIDAD') {
    sql = `SELECT DISTINCT sm.* FROM sub_modulos sm
      JOIN moduloscliente m ON m.id_submodulo = sm.id
      JOIN modulo_calidad mc ON mc.modulo_id = m.id
      WHERE mc.usuario_id = ? AND sm.sede_submodulos = ?`;
    params.push(id, sede);
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

  await query('INSERT INTO sub_modulos (codigo, entidad_remitente, sede_submodulos) VALUES (?, ?, ?)', [
    codigo,
    entidad_remitente,
    sede_submodulos,
  ]);
  res.status(201).send('Sub-módulo creado correctamente');
}

export async function updateSubModulo(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { codigo, entidad_remitente } = req.body as { codigo: string; entidad_remitente: string };
  const sede_submodulos = req.session.user?.sede;

  if (!codigo || !entidad_remitente) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  await query('UPDATE sub_modulos SET codigo = ?, entidad_remitente = ?, sede_submodulos = ? WHERE id = ?', [
    codigo,
    entidad_remitente,
    sede_submodulos,
    id,
  ]);
  res.send('Sub-módulo actualizado correctamente');
}

export async function deleteSubModulo(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await query('DELETE FROM sub_modulos WHERE id = ?', [id]);
  res.send('Sub-módulo eliminado correctamente');
}
