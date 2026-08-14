import type { Request, Response } from 'express';
import { query, queryOne, queryResult } from '../config/db.js';
import type { Inventario } from '../types/db.js';
import { buildInventarioExcel, inventarioFilename } from '../services/inventarioExcel.service.js';
import { isWorkDriveConfigured, uploadToFolder, WorkDriveError } from '../services/workDrive.service.js';

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

type SyncOutcome = {
  state: 'SUBIDO' | 'ERROR' | 'PENDIENTE';
  fileId?: string | null;
  error?: string | null;
  syncedAt?: string | null;
};

async function inventarioExistsByCode(codigo: unknown, excludeItems?: number | string): Promise<boolean> {
  const code = codigo == null || codigo === '' ? null : String(codigo);
  if (code === null) return false;
  const row = excludeItems != null
    ? await queryOne<{ ITEMS: number }>(
        `SELECT ITEMS FROM inventario WHERE CODIGO_DEL_CLIENTE = ? AND ITEMS <> ? LIMIT 1`,
        [code, excludeItems],
      )
    : await queryOne<{ ITEMS: number }>(
        `SELECT ITEMS FROM inventario WHERE CODIGO_DEL_CLIENTE = ? LIMIT 1`,
        [code],
      );
  return !!row;
}

/** Sube el Excel del inventario a WorkDrive y persiste el resultado en la base. Nunca lanza errores. */
async function syncInventarioToWorkDrive(data: Record<string, unknown>, itemsId: number | string): Promise<SyncOutcome> {
  if (!isWorkDriveConfigured()) {
    await query(
      `UPDATE inventario SET ZOHO_SYNC_STATE = 'ERROR', ZOHO_SYNC_ERROR = ?, ZOHO_SYNC_AT = NOW() WHERE ITEMS = ?`,
      ['Zoho WorkDrive no configurado (faltan ZOHO_* en .env)', itemsId],
    );
    return { state: 'ERROR', error: 'Zoho WorkDrive no configurado (faltan ZOHO_* en .env)' };
  }
  try {
    const buffer = await buildInventarioExcel(data);
    const filename = inventarioFilename(data.CLIENTE, data.CODIGO_DEL_CLIENTE, data.FECHA_CREACION);
    const { fileId } = await uploadToFolder(buffer, filename);
    await query(
      `UPDATE inventario SET ZOHO_FILE_ID = ?, ZOHO_SYNC_STATE = 'SUBIDO', ZOHO_SYNC_AT = NOW(), ZOHO_SYNC_ERROR = NULL WHERE ITEMS = ?`,
      [fileId ?? null, itemsId],
    );
    console.log(`[WorkDrive] Inventario subido: ${filename}`);
    return { state: 'SUBIDO', fileId: fileId ?? null, syncedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof WorkDriveError ? error.message : 'Error desconocido al subir a WorkDrive';
    await query(
      `UPDATE inventario SET ZOHO_SYNC_STATE = 'ERROR', ZOHO_SYNC_ERROR = ?, ZOHO_SYNC_AT = NOW() WHERE ITEMS = ?`,
      [message.slice(0, 500), itemsId],
    );
    console.error('[WorkDrive] Error al subir inventario:', error);
    return { state: 'ERROR', error: message };
  }
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
  if (await inventarioExistsByCode(body.CODIGO_DEL_CLIENTE)) {
    res.status(409).json({ error: `Ya existe un inventario para el cliente con código ${body.CODIGO_DEL_CLIENTE}. No se permiten duplicados.` });
    return;
  }
  const values = pickValues(body);
  const placeholders = values.map(() => '?').join(', ');

  const result = await queryResult(
    `INSERT INTO inventario (${FIELDS.join(', ')})
     VALUES (${placeholders})`,
    values,
  );
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE ITEMS = ?', [result.insertId]);
  if (!row) {
    res.status(500).json({ error: 'Registro insertado pero no se pudo recuperar' });
    return;
  }
  const rowData: Record<string, unknown> = { ...row };
  const sync = await syncInventarioToWorkDrive(rowData, result.insertId);
  res.json({ message: 'Registro insertado correctamente', id: result.insertId, sync });
}

export async function updateInventario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  if (await inventarioExistsByCode(body.CODIGO_DEL_CLIENTE, id)) {
    res.status(409).json({ error: `Ya existe un inventario para el cliente con código ${body.CODIGO_DEL_CLIENTE}. No se permiten duplicados.` });
    return;
  }
  const values = pickValues(body);

  const sets = FIELDS.map((f) => `${f} = ?`).join(', ');
  await query(`UPDATE inventario SET ${sets} WHERE ITEMS = ?`, [...values, id]);
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE ITEMS = ?', [id]);
  if (!row) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }
  const rowData: Record<string, unknown> = { ...row };
  const sync = await syncInventarioToWorkDrive(rowData, id);
  res.json({ message: `Registro con ID: ${id} actualizado correctamente`, id, sync });
}

export async function syncInventarioController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE ITEMS = ?', [id]);
  if (!row) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }
  const rowData: Record<string, unknown> = { ...row };
  const sync = await syncInventarioToWorkDrive(rowData, row.ITEMS);
  res.json({ message: sync.state === 'SUBIDO' ? 'Documento subido correctamente' : 'Error al subir el documento', sync });
}

export async function deleteInventario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await query('DELETE FROM inventario WHERE ITEMS = ?', [id]);
  res.json({ message: `Registro con ID: ${id} eliminado` });
}

export type { InventarioField };
