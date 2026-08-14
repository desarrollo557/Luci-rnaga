import type { Request, Response } from 'express';
import { query } from '../config/db.js';
import type { ModuloCliente } from '../types/db.js';

export async function listModulosCliente(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ message: 'Acceso no permitido' });
    return;
  }

  const subModuloId = String(req.query.subModuloId ?? '');

  if (user.rol === 'TECNICA') {
    const results = await query<ModuloCliente>(
      `SELECT m.* FROM moduloscliente m
       JOIN modulo_tecnica mt ON mt.modulo_id = m.id
       WHERE mt.usuario_id = ? AND m.id_submodulo = ?`,
      [user.id, subModuloId],
    );
    res.json(results);
  } else if (user.rol === 'CALIDAD') {
    const results = await query<ModuloCliente>(
      `SELECT m.* FROM moduloscliente m
       JOIN modulo_calidad mc ON mc.modulo_id = m.id
       WHERE mc.usuario_id = ? AND m.id_submodulo = ?`,
      [user.id, subModuloId],
    );
    res.json(results);
  } else if (user.rol === 'LIDER' || user.rol === 'ADMIN') {
    const results = await query<ModuloCliente>('SELECT * FROM moduloscliente WHERE id_submodulo = ?', [subModuloId]);
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

  await query(
    'UPDATE moduloscliente SET codigo = ?, entidad_remitente = ?, acta_transferencia_modulo = ?, fecha_trans_modulo = ?, id_submodulo = ? WHERE id = ?',
    [codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo, id],
  );
  res.send('Módulo cliente actualizado');
}

export async function deleteModuloCliente(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await query('DELETE FROM moduloscliente WHERE id = ?', [id]);
  res.send('Módulo cliente eliminado');
}

export async function assignUsersToModulo(req: Request, res: Response): Promise<void> {
  const { moduloId } = req.params;
  const { usuarios } = req.body as { usuarios: number[] };
  const rol = String(req.query.rol ?? '').toLowerCase();

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para agregar' });
    return;
  }

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';
  const values = usuarios.map((usuarioId) => [moduloId, usuarioId]);
  await query(`INSERT INTO ${tablaRelacion} (modulo_id, usuario_id) VALUES ?`, [values]);
  res.json({ message: `Usuarios ${rol} agregados correctamente` });
}

export async function removeUsersFromModulo(req: Request, res: Response): Promise<void> {
  const { moduloId } = req.params;
  const { usuarios } = req.body as { usuarios: number[] };
  const rol = String(req.query.rol ?? '').toLowerCase();

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
    return;
  }

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';
  await query(`DELETE FROM ${tablaRelacion} WHERE modulo_id = ? AND usuario_id IN (?)`, [moduloId, usuarios]);
  res.json({ message: `Usuarios ${rol} eliminados correctamente` });
}

export async function listUsersOfModulo(req: Request, res: Response): Promise<void> {
  const { moduloId } = req.params;
  const rol = String(req.query.rol ?? '').toLowerCase();
  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';

  const results = await query(
    `SELECT u.id, u.nombre, u.sede
     FROM users u
     JOIN ${tablaRelacion} mt ON u.id = mt.usuario_id
     WHERE mt.modulo_id = ? AND u.rol = ?`,
    [moduloId, rol.toUpperCase()],
  );
  res.json(results);
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
