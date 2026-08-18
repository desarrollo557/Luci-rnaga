import type { Request, Response } from 'express';
import { query, queryOne } from '../config/db.js';

// ===== Asignación TÉCNICA =====

/** Devuelve error si alguno de los usuarios no existe o no tiene el rol esperado. */
async function validarRolUsuarios(usuarios: number[], rolEsperado: 'TECNICA' | 'CALIDAD'): Promise<string | null> {
  const idsUnicos = [...new Set(usuarios.map(Number).filter((n) => Number.isInteger(n)))];
  if (idsUnicos.length === 0) return 'La lista de usuarios no es válida';
  const existentes = await query<{ id: number; nombre: string; rol: string }>(
    'SELECT id, nombre, rol FROM users WHERE id IN (?)',
    [idsUnicos],
  );
  const mapa = new Map(existentes.map((u) => [u.id, u.rol]));
  const inexistentes = idsUnicos.filter((id) => !mapa.has(id));
  if (inexistentes.length > 0) {
    return `Los siguientes usuarios no existen: ${inexistentes.join(', ')}`;
  }
  const rolIncorrecto = idsUnicos.filter((id) => mapa.get(id) !== rolEsperado);
  if (rolIncorrecto.length > 0) {
    const nombres = rolIncorrecto.map((id) => existentes.find((u) => u.id === id)?.nombre ?? id);
    return `Los siguientes usuarios no tienen el rol ${rolEsperado}: ${nombres.join(', ')}`;
  }
  return null;
}

export async function assignTecnica(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuarios } = req.body as { modulo_id: number; usuarios: number[] };

  if (!modulo_id) {
    res.status(400).json({ message: 'El campo modulo_id es requerido' });
    return;
  }
  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para asignar' });
    return;
  }

  const error = await validarRolUsuarios(usuarios, 'TECNICA');
  if (error) {
    res.status(400).json({ message: error });
    return;
  }

  const idsUnicos = [...new Set(usuarios.map(Number).filter((n) => Number.isInteger(n)))];
  const yaAsignados = await query<{ usuario_id: number }>(
    'SELECT usuario_id FROM asignacion_tecnica WHERE modulo_id = ? AND usuario_id IN (?)',
    [modulo_id, idsUnicos],
  );
  const yaSet = new Set(yaAsignados.map((a) => a.usuario_id));
  const nuevos = idsUnicos.filter((id) => !yaSet.has(id));
  if (nuevos.length === 0) {
    res.status(409).json({ message: 'Los usuarios seleccionados ya están asignados' });
    return;
  }

  const values = nuevos.map((usuarioId) => [modulo_id, usuarioId]);
  await query('INSERT INTO asignacion_tecnica (modulo_id, usuario_id) VALUES ?', [values]);
  res.json({
    message: yaSet.size > 0
      ? `Asignación guardada (${yaSet.size} ya estaban asignados)`
      : 'Usuarios asignados correctamente a técnica',
  });
}

export async function removeTecnica(req: Request, res: Response): Promise<void> {
  const { usuarios } = req.body as { usuarios: number[] };
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
    return;
  }

  const placeholders = usuarios.map(() => '?').join(',');
  const existing = await query<{ id: number }>(
    `SELECT id FROM asignacion_tecnica WHERE modulo_id = ? AND usuario_id IN (${placeholders})`,
    [modulo_id, ...usuarios],
  );

  if (existing.length === 0) {
    res.status(404).json({ message: 'No se encontraron usuarios asignados para eliminar' });
    return;
  }

  await query(`DELETE FROM asignacion_tecnica WHERE modulo_id = ? AND usuario_id IN (${placeholders})`, [
    modulo_id,
    ...usuarios,
  ]);
  res.json({ message: 'Usuarios eliminados correctamente de técnica' });
}

export async function listTecnicaUsers(req: Request, res: Response): Promise<void> {
  const { modulo_id } = req.params;
  const results = await query(
    `SELECT u.id, u.nombre, u.sede
     FROM users u
     JOIN asignacion_tecnica at ON u.id = at.usuario_id
     WHERE at.modulo_id = ?`,
    [modulo_id],
  );
  res.json(results);
}

// ===== Asignación CALIDAD =====

export async function assignCalidad(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuarios } = req.body as { modulo_id: number; usuarios: number[] };

  if (!modulo_id) {
    res.status(400).json({ message: 'El campo modulo_id es requerido' });
    return;
  }
  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para asignar' });
    return;
  }

  const error = await validarRolUsuarios(usuarios, 'CALIDAD');
  if (error) {
    res.status(400).json({ message: error });
    return;
  }

  const idsUnicos = [...new Set(usuarios.map(Number).filter((n) => Number.isInteger(n)))];
  const yaAsignados = await query<{ usuario_id: number }>(
    'SELECT usuario_id FROM asignacion_calidad WHERE modulo_id = ? AND usuario_id IN (?)',
    [modulo_id, idsUnicos],
  );
  const yaSet = new Set(yaAsignados.map((a) => a.usuario_id));
  const nuevos = idsUnicos.filter((id) => !yaSet.has(id));
  if (nuevos.length === 0) {
    res.status(409).json({ message: 'Los usuarios seleccionados ya están asignados' });
    return;
  }

  const values = nuevos.map((usuarioId) => [modulo_id, usuarioId]);
  await query('INSERT INTO asignacion_calidad (modulo_id, usuario_id) VALUES ?', [values]);
  res.json({
    message: yaSet.size > 0
      ? `Asignación guardada (${yaSet.size} ya estaban asignados)`
      : 'Usuarios asignados correctamente a calidad',
  });
}

export async function removeCalidad(req: Request, res: Response): Promise<void> {
  const { usuarios } = req.body as { usuarios: number[] };
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
    return;
  }

  const placeholders = usuarios.map(() => '?').join(',');
  const existing = await query<{ id: number }>(
    `SELECT id FROM asignacion_calidad WHERE modulo_id = ? AND usuario_id IN (${placeholders})`,
    [modulo_id, ...usuarios],
  );

  if (existing.length === 0) {
    res.status(404).json({ message: 'No se encontraron usuarios asignados para eliminar' });
    return;
  }

  await query(`DELETE FROM asignacion_calidad WHERE modulo_id = ? AND usuario_id IN (${placeholders})`, [
    modulo_id,
    ...usuarios,
  ]);
  res.json({ message: 'Usuarios eliminados correctamente de calidad' });
}

export async function listCalidadUsers(req: Request, res: Response): Promise<void> {
  const { modulo_id } = req.params;
  const results = await query(
    `SELECT u.id, u.nombre, u.sede
     FROM users u
     JOIN asignacion_calidad ac ON u.id = ac.usuario_id
     WHERE ac.modulo_id = ?`,
    [modulo_id],
  );
  res.json(results);
}

// ===== Helpers compartidos =====

export async function listUsersByRoleAndSede(req: Request, res: Response): Promise<void> {
  const sede = String(req.query.sede ?? '');
  const rol = String(req.params.rol ?? '').toUpperCase();

  // Si no se indica sede, listar todos los usuarios del rol (fallback robusto).
  if (!sede) {
    const results = await query('SELECT * FROM users WHERE rol = ?', [rol]);
    res.json(results);
    return;
  }

  const results = await query('SELECT * FROM users WHERE rol = ? AND sede = ?', [rol, sede]);
  res.json(results);
}

export { queryOne };
