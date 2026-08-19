import type { Request, Response } from 'express';
import { query, queryOne, queryResult } from '../config/db.js';
import type { FuidDato, Inventario } from '../types/db.js';
import type { SessionUser } from '../types/index.js';
import { buildInventarioFuidExcel, inventarioFuidFilename } from '../services/inventarioExcel.service.js';
import { subirOActualizarZohoSheetFromExcel, isZohoSheetConfigured, ZohoSheetError } from '../services/zohoSheet.service.js';

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

interface FuidConEstadoRow extends FuidDato {
  estado_caja: string | null;
}

const FUID_BASE_SELECT = `
  SELECT f.*, mc.estado_caja
  FROM fuiddatosreal f
  JOIN modulos_caja mc ON mc.caja_modulo = f.caja
  JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
  WHERE mcl.id_submodulo = (
    SELECT id_submodulo FROM moduloscliente WHERE codigo = ? LIMIT 1
  )
`;

const FUID_QUERY = `${FUID_BASE_SELECT} ORDER BY f.caja, f.n_orden`;

const FUID_COUNT_QUERY = `
  SELECT COUNT(*) AS total
  FROM fuiddatosreal f
  JOIN modulos_caja mc ON mc.caja_modulo = f.caja
  JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
  WHERE mcl.id_submodulo = (
    SELECT id_submodulo FROM moduloscliente WHERE codigo = ? LIMIT 1
  )
`;

const FUID_WHERE_FILTRO = `
  AND (f.caja LIKE ? OR f.upd LIKE ? OR f.asunto LIKE ? OR f.entidad_remitente LIKE ? OR f.serie LIKE ? OR f.subserie LIKE ?)
`;

const FUID_QUERY_FILTRADO = `${FUID_BASE_SELECT}${FUID_WHERE_FILTRO} ORDER BY f.caja, f.n_orden`;

const FUID_COUNT_QUERY_FILTRADO = `${FUID_COUNT_QUERY}${FUID_WHERE_FILTRO}`;

const FUID_STATS_QUERY = `
  SELECT COUNT(*) AS total_filas,
         COUNT(DISTINCT caja) AS total_cajas,
         COUNT(DISTINCT upd) AS total_upds,
         COALESCE(SUM(folios), 0) AS total_folios,
         MIN(fecha_inicial) AS fecha_inicial_min,
         MAX(fecha_final) AS fecha_final_max
  FROM fuiddatosreal f
  JOIN modulos_caja mc ON mc.caja_modulo = f.caja
  JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
  WHERE mcl.id_submodulo = (
    SELECT id_submodulo FROM moduloscliente WHERE codigo = ? LIMIT 1
  )
`;

interface FuidStatsRow {
  total_filas: number;
  total_cajas: number;
  total_upds: number;
  total_folios: number;
  fecha_inicial_min: string | null;
  fecha_final_max: string | null;
}

function buildFuidFilterParams(q: string): string[] {
  const term = `%${q}%`;
  return [term, term, term, term, term, term];
}

/** Extrae el resource_id de una URL de Zoho Sheet (ej. https://sheet.zoho.com/sheet/open/abc123). */
function extraerResourceIdDeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/sheet\/open\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

/** Sube el .xlsx FUID del inventario a Zoho Sheet como Sheet nativo y persiste el resultado. Nunca lanza errores. */
async function syncInventarioToWorkDrive(data: Record<string, unknown>, itemsId: number | string): Promise<SyncOutcome> {
  if (!isZohoSheetConfigured()) {
    await query(
      `UPDATE inventario SET ZOHO_SYNC_STATE = 'ERROR', ZOHO_SYNC_ERROR = ?, ZOHO_SYNC_AT = NOW() WHERE ITEMS = ?`,
      ['Zoho Sheet no configurado (faltan ZOHO_* en .env)', itemsId],
    );
    return { state: 'ERROR', error: 'Zoho Sheet no configurado (faltan ZOHO_* en .env)' };
  }
  try {
    const codigoCliente = data.CODIGO_DEL_CLIENTE;
    const filas = await query<FuidConEstadoRow>(FUID_QUERY, [codigoCliente]);
    if (!filas || filas.length === 0) {
      const message = 'El cliente no tiene datos FUID registrados para generar el inventario';
      await query(
        `UPDATE inventario SET ZOHO_SYNC_STATE = 'ERROR', ZOHO_SYNC_ERROR = ?, ZOHO_SYNC_AT = NOW() WHERE ITEMS = ?`,
        [message, itemsId],
      );
      return { state: 'ERROR', error: message };
    }
    const buffer = await buildInventarioFuidExcel(filas);
    const baseName = inventarioFuidFilename(data.CLIENTE, codigoCliente, data.FECHA_CREACION).replace(/\.xlsx$/i, '');
    const resourceIdExistente = extraerResourceIdDeUrl(typeof data.ZOHO_FILE_ID === 'string' ? data.ZOHO_FILE_ID : null);
    const { url } = await subirOActualizarZohoSheetFromExcel(buffer, baseName, resourceIdExistente);
    await query(
      `UPDATE inventario SET ZOHO_FILE_ID = ?, ZOHO_SYNC_STATE = 'SUBIDO', ZOHO_SYNC_AT = NOW(), ZOHO_SYNC_ERROR = NULL WHERE ITEMS = ?`,
      [url, itemsId],
    );
    console.log(`[Zoho Sheet] Inventario subido: ${baseName}`);
    return { state: 'SUBIDO', fileId: url, syncedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof ZohoSheetError ? error.message : 'Error desconocido al subir a Zoho Sheet';
    await query(
      `UPDATE inventario SET ZOHO_SYNC_STATE = 'ERROR', ZOHO_SYNC_ERROR = ?, ZOHO_SYNC_AT = NOW() WHERE ITEMS = ?`,
      [message.slice(0, 500), itemsId],
    );
    console.error('[Zoho Sheet] Error al subir inventario:', error);
    return { state: 'ERROR', error: message };
  }
}

function auditoriaUsuario(user: SessionUser | undefined): string {
  if (!user) return 'Sistema';
  const perfil = user.rol ?? '';
  const cc = user.cc ? ` (${user.cc})` : '';
  return perfil ? `${user.nombre}${cc} — ${perfil}` : `${user.nombre}${cc}`;
}

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

/** Lista todos los inventarios. */
export async function listInventario(_req: Request, res: Response): Promise<void> {
  const rows = await query<Inventario>('SELECT * FROM inventario');
  res.json(rows);
}

type ClienteParaInventario = {
  id: number;
  codigo: string;
  entidad_remitente: string;
  acta_transferencia_modulo: string;
  fecha_trans_modulo: string | null;
  id_submodulo: number;
};

/** CÃ³digos Ãºnicos de clientes con datos en mÃ³dulos, para el select del formulario de inventario. */
export async function listClientesParaInventario(_req: Request, res: Response): Promise<void> {
  const rows = await query<{ codigo: string; entidad_remitente: string }>(
    `SELECT DISTINCT codigo, entidad_remitente FROM moduloscliente
     WHERE codigo IS NOT NULL AND codigo <> ''
     ORDER BY codigo`,
  );
  res.json(rows);
}

/** Paquete completo para autocompletar el formulario de inventario segÃºn el cÃ³digo del cliente. */
export async function getClienteParaInventario(req: Request, res: Response): Promise<void> {
  const { codigo } = req.params;
  const cliente = await queryOne<ClienteParaInventario>(
    `SELECT id, codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo
     FROM moduloscliente WHERE codigo = ? LIMIT 1`,
    [codigo],
  );
  if (!cliente) {
    res.status(404).json({ error: `No se encontrÃ³ un cliente con cÃ³digo ${codigo}` });
    return;
  }
  const cajas = await query<{ caja_modulo: string }>(
    `SELECT caja_modulo FROM modulos_caja WHERE id_modulo_caja = ? ORDER BY caja_modulo`,
    [cliente.id],
  );
  const numeros = cajas.map((c) => c.caja_modulo).filter(Boolean) as string[];
  res.json({
    cliente,
    cajas,
    totalCajas: cajas.length,
    cajaIniciar: numeros.length > 0 ? numeros.reduce((a, b) => (a < b ? a : b)) : null,
    cajaFin: numeros.length > 0 ? numeros.reduce((a, b) => (a > b ? a : b)) : null,
  });
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

/** Filas FUID del cliente de un inventario, con paginaciÃ³n opcional (limit/offset). */
export async function getInventarioFuid(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const inventario = await queryOne<Inventario>('SELECT * FROM inventario WHERE ITEMS = ?', [id]);
  if (!inventario) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }

  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1), 200);
  const offsetRaw = Number(req.query.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const q = qRaw.length > 0 ? qRaw : '';
  const codigo = inventario.CODIGO_DEL_CLIENTE;

  const filterParams = q ? buildFuidFilterParams(q) : [];
  const baseParams = [codigo];

  const fuidSql = q ? FUID_QUERY_FILTRADO : FUID_QUERY;
  const countSql = q ? FUID_COUNT_QUERY_FILTRADO : FUID_COUNT_QUERY;

  const filas = await query<FuidConEstadoRow>(`${fuidSql} LIMIT ? OFFSET ?`, [
    ...baseParams,
    ...filterParams,
    limit,
    offset,
  ]);
  const countRows = await query<{ total: number }>(countSql, [...baseParams, ...filterParams]);

  const stats = await queryOne<FuidStatsRow>(FUID_STATS_QUERY, baseParams);

  res.json({
    inventario,
    filas,
    total: countRows[0]?.total ?? 0,
    limit,
    offset,
    q: q || null,
    stats: stats ?? null,
  });
}

export async function createInventario(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const existente = await queryOne<Inventario>('SELECT * FROM inventario WHERE CODIGO_DEL_CLIENTE = ? LIMIT 1', [body.CODIGO_DEL_CLIENTE]);
  if (existente) {
    const values = pickValues(body);
    const usuarioActual = auditoriaUsuario(req.session.user);
    const sets = `${FIELDS.map((f) => `${f} = ?`).join(', ')}, FECHA_ACTUALIZACION = NOW(), USUARIO_ACTUALIZACION = ?`;
    await query(`UPDATE inventario SET ${sets} WHERE ITEMS = ?`, [...values, usuarioActual, existente.ITEMS]);
    const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE ITEMS = ?', [existente.ITEMS]);
    if (!row) {
      res.status(500).json({ error: 'Registro actualizado pero no se pudo recuperar' });
      return;
    }
    const rowData: Record<string, unknown> = { ...row };
    const sync = await syncInventarioToWorkDrive(rowData, existente.ITEMS);
    res.json({ message: `El cliente ya tenía un inventario; se actualizó con los últimos registros`, id: existente.ITEMS, sync, actualizado: true });
    return;
  }
  const values = pickValues(body);
  const usuarioActual = auditoriaUsuario(req.session.user);
  const valuesConAuditoria = [...values, usuarioActual];
  const placeholders = [...values.map(() => '?'), 'NOW()', '?'].join(', ');

  const result = await queryResult(
    `INSERT INTO inventario (${FIELDS.join(', ')}, FECHA_ACTUALIZACION, USUARIO_ACTUALIZACION)
     VALUES (${placeholders})`,
    valuesConAuditoria,
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
    res.status(409).json({ error: `Ya existe un inventario para el cliente con cÃ³digo ${body.CODIGO_DEL_CLIENTE}. No se permiten duplicados.` });
    return;
  }
  const values = pickValues(body);
  const usuarioActual = auditoriaUsuario(req.session.user);

  const sets = `${FIELDS.map((f) => `${f} = ?`).join(', ')}, FECHA_ACTUALIZACION = NOW(), USUARIO_ACTUALIZACION = ?`;
  await query(`UPDATE inventario SET ${sets} WHERE ITEMS = ?`, [...values, usuarioActual, id]);
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
