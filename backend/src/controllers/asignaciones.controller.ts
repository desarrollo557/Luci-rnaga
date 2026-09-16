import type { Request, Response } from 'express';
import { query } from '../config/db.js';

/** Lo que se devuelve de cada usuario: nunca la contraseña, ni siquiera cifrada. */
const CAMPOS = 'id, cc, nombre, rol, sede';

/** Usuarios de un rol (en la práctica, TECNICA) disponibles para asignar a cajas, filtrados por sede. */
export async function listUsersByRoleAndSede(req: Request, res: Response): Promise<void> {
  const sede = String(req.query.sede ?? '');
  const rol = String(req.params.rol ?? '').toUpperCase();

  // Si no se indica sede, listar todos los usuarios del rol (fallback robusto).
  if (!sede) {
    const results = await query(`SELECT ${CAMPOS} FROM users WHERE rol = ?`, [rol]);
    res.json(results);
    return;
  }

  const results = await query(`SELECT ${CAMPOS} FROM users WHERE rol = ? AND sede = ?`, [rol, sede]);
  res.json(results);
}
