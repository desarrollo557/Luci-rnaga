import type { Request, Response } from 'express';
import { query } from '../config/db.js';
import type { Historial } from '../types/db.js';

export async function listHistorial(_req: Request, res: Response): Promise<void> {
  const rows = await query<Historial>('SELECT * FROM historial');
  res.json(rows);
}
