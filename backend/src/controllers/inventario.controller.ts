import type { Request, Response } from 'express';
import { query, queryOne, queryResult } from '../config/db.js';
import { audit } from '../services/audit.service.js';
import type { FuidDato, Inventario } from '../types/db.js';
import type { SessionUser } from '../types/index.js';
import { valorParaGuardar } from '../utils/noDiligenciado.js';
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

/**
 * Las columnas de `inventario` están en mayúsculas, y PostgreSQL solo las
 * respeta entre comillas dobles: sin ellas las buscaría en minúsculas y no
 * las encontraría. Es la única tabla del sistema con este problema, herencia
 * de cómo se creó en MySQL.
 */
const comillas = (columna: string): string => `"${columna}"`;

/**
 * Columnas de texto del inventario que se guardan como `N/A` cuando el
 * formulario las deja en blanco, igual que en el FUID y en la caja.
 *
 * Quedan fuera las columnas `date` e `int`, que no admiten el literal, y
 * `CODIGO_DEL_CLIENTE`: el controlador lo usa para decidir si el inventario de
 * ese cliente ya existe (`WHERE CODIGO_DEL_CLIENTE = ?`), así que un `N/A`
 * haría que dos inventarios sin código se tomaran por el mismo y el segundo
 * sobrescribiera al primero.
 */
const TEXTO_NO_DILIGENCIADO: ReadonlySet<string> = new Set<InventarioField>([
  'CLIENTE',
  'No_ACTA',
  'ANEXOS',
  'FUNCIONARIO',
  'ESTADO_DEL_INVENTARIO',
  'CAJA_INICIAR',
  'CAJ_FIN',
  'ESTADO_ENTREGA',
  'MES_ENTREGA_PACA',
]);

function pickValues(body: Record<string, unknown>): unknown[] {
  return FIELDS.map((campo) => valorParaGuardar(body[campo], TEXTO_NO_DILIGENCIADO.has(campo)));
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

/**
 * Acota el FUID a una sola acta de transferencia del cliente.
 *
 * Un cliente puede tener varias, y quien arma el inventario a veces necesita el
 * de una sola: entregar un acta no obliga a sacar el documento completo. El
 * número del acta vive en `moduloscliente`, que ya está en el JOIN, así que basta
 * con añadir la condición. Sin este añadido la consulta devuelve el FUID del
 * cliente entero, que es el comportamiento por defecto.
 */
const FUID_WHERE_ACTA = ` AND mcl.acta_transferencia_modulo = ?`;

/** Consulta del FUID de un cliente, acotada al acta indicada si se pide una. */
function fuidQueryPorActa(acta: string | null): string {
  return acta
    ? `${FUID_BASE_SELECT}${FUID_WHERE_ACTA} ORDER BY f.caja, f.n_orden`
    : FUID_QUERY;
}

/**
 * Totales del inventario de un cliente.
 *
 * `folios` es una columna de texto porque admite el marcador N/A, así que solo
 * se suman los valores que son un número. MySQL hacía esa conversión por su
 * cuenta; PostgreSQL no suma texto y la consulta entera fallaba con
 * "function sum(character varying) does not exist", que es lo que dejaba en 500
 * la vista de un inventario con sus registros.
 */
const FUID_STATS_QUERY = `
  SELECT COUNT(*) AS total_filas,
         COUNT(DISTINCT caja) AS total_cajas,
         COUNT(DISTINCT upd) AS total_upds,
         COALESCE(SUM(CASE WHEN folios ~ '^[0-9]+$' THEN folios::numeric ELSE 0 END), 0) AS total_folios,
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

/**
 * Motivo del fallo de la sincronización, en un texto que se pueda leer.
 *
 * Antes, todo lo que no fuera un `ZohoSheetError` se guardaba como "Error
 * desconocido al subir a Zoho Sheet". El mensaje se quedaba en los registros
 * del servidor y quien veía la pantalla no tenía nada con qué averiguar la
 * causa: un fallo al leer el formato del inventario y una caída de Zoho se
 * veían exactamente igual. Ahora se conserva el mensaje real, con el tipo de
 * error delante cuando no viene de Zoho, para saber en qué paso se rompió.
 */
function motivoDelFallo(error: unknown): string {
  if (error instanceof ZohoSheetError) return error.message;
  if (error instanceof Error) {
    const tipo = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
    return `Falló antes de llegar a Zoho Sheet — ${tipo}${error.message}`;
  }
  return `Falló antes de llegar a Zoho Sheet — ${String(error)}`;
}

/** Sube el .xlsx FUID del inventario a Zoho Sheet como Sheet nativo y persiste el resultado. Nunca lanza errores. */
async function syncInventarioToWorkDrive(data: Record<string, unknown>, itemsId: number | string): Promise<SyncOutcome> {
  if (!isZohoSheetConfigured()) {
    await query(
      `UPDATE inventario SET "ZOHO_SYNC_STATE" = 'ERROR', "ZOHO_SYNC_ERROR" = ?, "ZOHO_SYNC_AT" = NOW() WHERE "ITEMS" = ?`,
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
        `UPDATE inventario SET "ZOHO_SYNC_STATE" = 'ERROR', "ZOHO_SYNC_ERROR" = ?, "ZOHO_SYNC_AT" = NOW() WHERE "ITEMS" = ?`,
        [message, itemsId],
      );
      return { state: 'ERROR', error: message };
    }
    const buffer = await buildInventarioFuidExcel(filas);
    const baseName = inventarioFuidFilename(data.CLIENTE, codigoCliente, data.FECHA_CREACION).replace(/\.xlsx$/i, '');
    const resourceIdExistente = extraerResourceIdDeUrl(typeof data.ZOHO_FILE_ID === 'string' ? data.ZOHO_FILE_ID : null);
    const { url } = await subirOActualizarZohoSheetFromExcel(buffer, baseName, resourceIdExistente);
    await query(
      `UPDATE inventario SET "ZOHO_FILE_ID" = ?, "ZOHO_SYNC_STATE" = 'SUBIDO', "ZOHO_SYNC_AT" = NOW(), "ZOHO_SYNC_ERROR" = NULL WHERE "ITEMS" = ?`,
      [url, itemsId],
    );
    console.log(`[Zoho Sheet] Inventario subido: ${baseName}`);
    return { state: 'SUBIDO', fileId: url, syncedAt: new Date().toISOString() };
  } catch (error) {
    const message = motivoDelFallo(error);
    await query(
      `UPDATE inventario SET "ZOHO_SYNC_STATE" = 'ERROR', "ZOHO_SYNC_ERROR" = ?, "ZOHO_SYNC_AT" = NOW() WHERE "ITEMS" = ?`,
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
        `SELECT "ITEMS" FROM inventario WHERE "CODIGO_DEL_CLIENTE" = ? AND "ITEMS" <> ? LIMIT 1`,
        [code, excludeItems],
      )
    : await queryOne<{ ITEMS: number }>(
        `SELECT "ITEMS" FROM inventario WHERE "CODIGO_DEL_CLIENTE" = ? LIMIT 1`,
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
  /** Nulo en actas antiguas que quedaron sin cliente asociado. */
  id_submodulo: number | null;
};

/** Códigos únicos de clientes con datos en módulos, para el select del formulario de inventario. */
export async function listClientesParaInventario(_req: Request, res: Response): Promise<void> {
  const rows = await query<{ codigo: string; entidad_remitente: string }>(
    `SELECT DISTINCT codigo, entidad_remitente FROM moduloscliente
     WHERE codigo IS NOT NULL AND codigo <> ''
     ORDER BY codigo`,
  );
  res.json(rows);
}

type ActaDelCliente = {
  id: number;
  acta: string | null;
  fecha: string | null;
  totalCajas: number;
  cajaIniciar: string | null;
  cajaFin: string | null;
};

/**
 * Paquete completo para autocompletar el formulario de inventario según el
 * código del cliente.
 *
 * Un cliente puede tener varias actas de transferencia, y antes esta consulta
 * se quedaba con la primera (`LIMIT 1`): el formulario proponía siempre el mismo
 * número de acta y las cifras de cajas eran solo las de esa, aunque el FUID que
 * se descargaba fuera el del cliente entero. Ahora devuelve todas, cada una con
 * sus propias cajas, para que quien crea el inventario elija de cuál habla y las
 * cifras acompañen a esa elección.
 *
 * Los totales de primer nivel son los del cliente completo, que es el alcance
 * del inventario cuando no se acota a un acta.
 */
export async function getClienteParaInventario(req: Request, res: Response): Promise<void> {
  const { codigo } = req.params;
  const cliente = await queryOne<ClienteParaInventario>(
    `SELECT id, codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo
     FROM moduloscliente WHERE codigo = ? ORDER BY id LIMIT 1`,
    [codigo],
  );
  if (!cliente) {
    res.status(404).json({ error: `No se encontró un cliente con código ${codigo}` });
    return;
  }

  /*
   * Las actas del cliente se agrupan por `id_submodulo`, que es el cliente real
   * (`sub_modulos`), igual que hace la consulta de FUID de esta misma pantalla.
   * Un acta suelta sin cliente asociado no tiene con quién agruparse, así que en
   * ese caso se responde solo con ella.
   */
  const actas =
    cliente.id_submodulo == null
      ? await query<ActaDelCliente>(ACTAS_QUERY_POR_ID, [cliente.id])
      : await query<ActaDelCliente>(ACTAS_QUERY_POR_CLIENTE, [cliente.id_submodulo]);

  const cajas = await query<{ caja_modulo: string }>(
    cliente.id_submodulo == null ? CAJAS_QUERY_POR_ACTA : CAJAS_QUERY_POR_CLIENTE,
    [cliente.id_submodulo == null ? cliente.id : cliente.id_submodulo],
  );

  const numeros = cajas.map((c) => c.caja_modulo).filter(Boolean) as string[];
  res.json({
    cliente,
    actas,
    cajas,
    totalCajas: cajas.length,
    cajaIniciar: numeros.length > 0 ? numeros.reduce((a, b) => (a < b ? a : b)) : null,
    cajaFin: numeros.length > 0 ? numeros.reduce((a, b) => (a > b ? a : b)) : null,
  });
}

/** Actas con el recuento y el rango de sus propias cajas. */
const ACTAS_SELECT = `
  SELECT mcl.id,
         mcl.acta_transferencia_modulo AS acta,
         mcl.fecha_trans_modulo AS fecha,
         COUNT(mc.id) AS "totalCajas",
         MIN(mc.caja_modulo) AS "cajaIniciar",
         MAX(mc.caja_modulo) AS "cajaFin"
  FROM moduloscliente mcl
  LEFT JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
`;

const ACTAS_AGRUPACION = `
  GROUP BY mcl.id, mcl.acta_transferencia_modulo, mcl.fecha_trans_modulo
  ORDER BY mcl.acta_transferencia_modulo, mcl.id
`;

const ACTAS_QUERY_POR_CLIENTE = `${ACTAS_SELECT} WHERE mcl.id_submodulo = ? ${ACTAS_AGRUPACION}`;
const ACTAS_QUERY_POR_ID = `${ACTAS_SELECT} WHERE mcl.id = ? ${ACTAS_AGRUPACION}`;

const CAJAS_QUERY_POR_CLIENTE = `
  SELECT mc.caja_modulo
  FROM modulos_caja mc
  JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
  WHERE mcl.id_submodulo = ?
  ORDER BY mc.caja_modulo
`;

const CAJAS_QUERY_POR_ACTA = `
  SELECT caja_modulo FROM modulos_caja WHERE id_modulo_caja = ? ORDER BY caja_modulo
`;

export async function getInventario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [id]);
  if (!row) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }
  res.json(row);
}

/** Filas FUID del cliente de un inventario, con paginación opcional (limit/offset). */
export async function getInventarioFuid(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const inventario = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [id]);
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

/**
 * Descarga el inventario en Excel, el mismo archivo que se sube a Zoho.
 *
 * Hasta ahora el inventario solo existía en la nube: para tener el archivo
 * había que abrir Zoho y exportarlo desde allí. Se genera con el mismo servicio
 * que usa la sincronización, así que lo que se descarga y lo que se sube son
 * idénticos.
 */
export async function descargarInventarioExcel(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const inventario = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [id]);
  if (!inventario) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }

  const codigoCliente = inventario.CODIGO_DEL_CLIENTE;

  // `?acta=` acota la descarga a una sola acta de transferencia. Sin él se baja
  // el FUID completo del cliente, que es lo que esta pantalla hacía siempre.
  const actaRaw = typeof req.query.acta === 'string' ? req.query.acta.trim() : '';
  const acta = actaRaw.length > 0 ? actaRaw : null;

  const parametros = acta ? [codigoCliente, acta] : [codigoCliente];
  const filas = await query<FuidConEstadoRow>(fuidQueryPorActa(acta), parametros);
  if (filas.length === 0) {
    res.status(404).json({
      error: acta
        ? `El acta ${acta} no tiene datos FUID registrados para generar el inventario`
        : 'El cliente no tiene datos FUID registrados para generar el inventario',
    });
    return;
  }

  const buffer = await buildInventarioFuidExcel(filas);
  const nombre = inventarioFuidFilename(
    inventario.CLIENTE,
    codigoCliente,
    inventario.FECHA_CREACION,
    acta,
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // `filename*` va con el nombre codificado: el del cliente puede llevar tildes
  // y algunos navegadores cortan la descarga si llegan sin codificar.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nombre.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  );
  res.send(buffer);

  void audit({
    entidad: 'inventario',
    entidadId: String(id),
    accion: 'DESCARGAR',
    detalle: `Descarga del inventario de ${inventario.CLIENTE ?? codigoCliente}${
      acta ? `, acta ${acta}` : ''
    } (${filas.length} registros)`,
    usuario: req.session.user,
  });
}

export async function createInventario(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const existente = await queryOne<Inventario>('SELECT * FROM inventario WHERE "CODIGO_DEL_CLIENTE" = ? LIMIT 1', [body.CODIGO_DEL_CLIENTE]);
  if (existente) {
    const values = pickValues(body);
    const usuarioActual = auditoriaUsuario(req.session.user);
    const sets = `${FIELDS.map((f) => `${comillas(f)} = ?`).join(', ')}, "FECHA_ACTUALIZACION" = NOW(), "USUARIO_ACTUALIZACION" = ?`;
    await query(`UPDATE inventario SET ${sets} WHERE "ITEMS" = ?`, [...values, usuarioActual, existente.ITEMS]);
    const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [existente.ITEMS]);
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
    // La clave de esta tabla es "ITEMS", no `id`: hay que pedirla por su nombre
    // o no habría forma de recuperar el registro recién insertado.
    `INSERT INTO inventario (${FIELDS.map(comillas).join(', ')}, "FECHA_ACTUALIZACION", "USUARIO_ACTUALIZACION")
     VALUES (${placeholders}) RETURNING "ITEMS"`,
    valuesConAuditoria,
  );
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [result.insertId]);
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
  const usuarioActual = auditoriaUsuario(req.session.user);

  const sets = `${FIELDS.map((f) => `${comillas(f)} = ?`).join(', ')}, "FECHA_ACTUALIZACION" = NOW(), "USUARIO_ACTUALIZACION" = ?`;
  await query(`UPDATE inventario SET ${sets} WHERE "ITEMS" = ?`, [...values, usuarioActual, id]);
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [id]);
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
  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [id]);
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
  const existente = await queryOne<{ ITEMS: number; CLIENTE: string | null; No_ACTA: string | null }>(
    'SELECT "ITEMS", "CLIENTE", "No_ACTA" FROM inventario WHERE "ITEMS" = ?',
    [id],
  );
  if (!existente) {
    res.status(404).json({ message: 'El registro de inventario no existe o ya fue eliminado' });
    return;
  }
  await query('DELETE FROM inventario WHERE "ITEMS" = ?', [id]);
  void audit({
    entidad: 'inventario',
    entidadId: id,
    accion: 'ELIMINAR',
    detalle: `Inventario ${existente.CLIENTE ?? ''} acta ${existente.No_ACTA ?? ''}`.trim(),
    usuario: req.session.user,
  });
  res.json({ message: `Registro con ID: ${id} eliminado` });
}

export type { InventarioField };
