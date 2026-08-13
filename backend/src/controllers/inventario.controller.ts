import type { Request, Response } from 'express';
import { query, queryOne, queryResult } from '../config/db.js';
import type { Inventario } from '../types/db.js';

const FIELDS = [
  'CODIGO_DEL_CLIENTE',
  'CLIENTE',
  'No_ACTA',
  'FECHA_TRANSFERENCIA',
  'X200',
  'X300',
  'X400',
  'NC',
  'TOTAL_CAJAS',
  'ANEXOS',
  'FECHA_ENTREGA_CUSTODIA',
  'FUNCIONARIO',
  'ESTADO_DEL_INVENTARIO',
  'CAJAS_PROCESADAS',
  'CAJA_INICIAR',
  'CAJ_FIN',
  'REGISTROS_PROCESADOS',
  'FECHA_ENTREGA',
  'INICIO_INVENTARIO',
  'FIN_INVENTARIO',
  'ESTADO_ENTREGA',
  'MES_ENTREGA_PACA',
] as const;

type InventarioField = (typeof FIELDS)[number];

function pickValues(body: Record<string, unknown>): unknown[] {
  return FIELDS.map((f) => (body[f] == null || body[f] === '' ? null : body[f]));
}

export async function listInventario(_req: Request, res: Response): Promise<void> {
  const rows = await query<Inventario>('SELECT * FROM inventario');
  res.json(rows);
}

export async function getInventario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE ITEMS = ?', [id]);
  if (!row) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }
  res.json(row);
}

export async function createInventario(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const values = pickValues(body);
  const placeholders = values.map(() => '?').join(', ');

  const result = await queryResult(
    `INSERT INTO inventario (${FIELDS.join(', ')})
     VALUES (${placeholders})`,
    values,
  );
  res.json({ message: 'Registro insertado correctamente', id: result.insertId });
}

export async function updateInventario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  const values = pickValues(body);

  const sets = FIELDS.map((f) => `${f} = ?`).join(', ');
  await query(`UPDATE inventario SET ${sets} WHERE ITEMS = ?`, [...values, id]);
  res.json({ message: `Registro con ID: ${id} actualizado correctamente` });
}

export async function deleteInventario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await query('DELETE FROM inventario WHERE ITEMS = ?', [id]);
  res.json({ message: `Registro con ID: ${id} eliminado` });
}

export type { InventarioField };
