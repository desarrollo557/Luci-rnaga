import type { Request, Response } from 'express';
import { query, queryOne, queryResult } from '../config/db.js';
import { sqlOrdenEnCaja } from '../services/fuid.service.js';
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
  SELECT f.*, o.n_orden_caja, mc.estado_caja
  FROM fuiddatosreal f
  JOIN ${sqlOrdenEnCaja()} o ON o.id = f.id
  JOIN modulos_caja mc ON mc.caja_modulo = f.caja
  JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
  WHERE mcl.id_submodulo = (
    SELECT id_submodulo FROM moduloscliente WHERE codigo = ? LIMIT 1
  )
`;

const FUID_QUERY = `${FUID_BASE_SELECT} ORDER BY f.caja, o.n_orden_caja`;

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

// Por caja y, dentro de ella, por el consecutivo: como se leen en el papel.
const FUID_ORDEN = ' ORDER BY f.caja, o.n_orden_caja';

/*
 * Las tres consultas del FUID —las filas, su recuento y sus totales— comparten
 * los mismos dos recortes opcionales: el acta y el texto del buscador. Se arman
 * aquí en vez de tener una constante por combinación, que eran cuatro y ahora
 * serían ocho, y en las que el orden de los parámetros se desincronizaba en
 * cuanto se tocaba una sola.
 *
 * El orden importa: primero el código del cliente, después el acta y al final el
 * texto del filtro. `parametrosFuid` los devuelve en ese mismo orden.
 */
function recortes(acta: string | null, conFiltro: boolean): string {
  return `${acta ? FUID_WHERE_ACTA : ''}${conFiltro ? FUID_WHERE_FILTRO : ''}`;
}

/** Consulta del FUID de un cliente, acotada al acta y al texto que se pidan. */
function fuidQueryPorActa(acta: string | null, conFiltro = false): string {
  return `${FUID_BASE_SELECT}${recortes(acta, conFiltro)}${FUID_ORDEN}`;
}

function fuidCountPorActa(acta: string | null, conFiltro = false): string {
  return `${FUID_COUNT_QUERY}${recortes(acta, conFiltro)}`;
}

function fuidStatsPorActa(acta: string | null): string {
  return `${FUID_STATS_QUERY}${recortes(acta, false)}`;
}

/** Parámetros en el mismo orden en que los espera cualquiera de las tres. */
function parametrosFuid(codigo: unknown, acta: string | null, filtro: string[] = []): unknown[] {
  return [codigo, ...(acta ? [acta] : []), ...filtro];
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
/**
 * Listado de inventarios, uno por cliente.
 *
 * Además de lo guardado, trae lo que hay **ahora mismo** en el sistema: cuántas
 * actas, cuántas cajas y cuántos registros. La pantalla compara esas cifras vivas
 * con las que el inventario tiene guardadas y así puede decir si está al día o
 * cuántos registros entraron sin reflejar. Sin esa comparación, el botón de
 * actualizar es una acción a ciegas: no hay forma de saber si hace falta.
 *
 * `total_actas` sirve además para saber qué filas se pueden desplegar en árbol
 * sin preguntar por cada una: con una sola acta no hay nada que desplegar.
 *
 * Va por `LATERAL` y no por tres subconsultas sueltas para recorrer las cajas y
 * los registros del cliente una vez en lugar de tres. La tabla `inventario` tiene
 * una fila por cliente, así que el recorrido es corto.
 */
export async function listInventario(_req: Request, res: Response): Promise<void> {
  const rows = await query<Inventario>(`
    SELECT i.*,
           COALESCE(v.total_actas, 0) AS total_actas,
           COALESCE(v.cajas_vivas, 0) AS cajas_vivas,
           COALESCE(v.registros_vivos, 0) AS registros_vivos
    FROM inventario i
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT mcl.id) AS total_actas,
             COUNT(DISTINCT mc.id) AS cajas_vivas,
             COUNT(f.id) AS registros_vivos
      FROM moduloscliente mcl
      LEFT JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
      LEFT JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
      WHERE mcl.id_submodulo = (
        SELECT id_submodulo FROM moduloscliente WHERE codigo = i."CODIGO_DEL_CLIENTE" ORDER BY id LIMIT 1
      )
    ) v ON true
  `);
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
  /** Registros FUID digitados en las cajas de esta acta. */
  registros: number;
  /** De esos, los creados después de la última lectura del inventario. */
  registrosSinReflejar: number;
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
  /*
   * Momento de la última lectura del inventario de este cliente. Es la frontera
   * que separa lo que el inventario ya cuenta de lo que entró después.
   */
  const inventario = await queryOne<{ FECHA_ACTUALIZACION: string | null }>(
    'SELECT "FECHA_ACTUALIZACION" FROM inventario WHERE "CODIGO_DEL_CLIENTE" = ? LIMIT 1',
    [codigo],
  );
  const ultimaLectura = inventario?.FECHA_ACTUALIZACION ?? null;

  // El parámetro de la fecha va primero: aparece antes en el texto de la
  // consulta que el del cliente, y la traducción a PostgreSQL numera por orden
  // de aparición.
  const actas =
    cliente.id_submodulo == null
      ? await query<ActaDelCliente>(ACTAS_QUERY_POR_ID, [ultimaLectura, cliente.id])
      : await query<ActaDelCliente>(ACTAS_QUERY_POR_CLIENTE, [ultimaLectura, cliente.id_submodulo]);

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
/*
 * Actas de un cliente con sus cifras, y cuánto de su trabajo no está todavía
 * reflejado en el inventario.
 *
 * `registrosSinReflejar` se calcula, no se adivina: un registro creado después
 * de la última lectura del inventario es, por definición, uno que el inventario
 * no cuenta. Antes esto era una heurística —se marcaba "la última de la lista"—
 * y la lista viene ordenada por el número de acta como texto, así que marcaba la
 * de número más alto alfabéticamente, que casi nunca era la que había recibido
 * el trabajo.
 *
 * Con el inventario recién leído, la fecha de referencia es posterior a todos
 * los registros y la cuenta da cero en todas las actas, que es lo correcto.
 * Cuando la referencia llega nula —un cliente sin inventario aún— la comparación
 * es nula y el FILTER no cuenta nada, que también es lo correcto: sin inventario
 * no hay nada que reflejar.
 *
 * Los registros heredados de la base antigua pueden no tener `created_at`. En
 * ese caso no se cuentan, que es el lado seguro: un acta antigua no saldrá
 * marcada por error.
 */
const ACTAS_SELECT = `
  SELECT mcl.id,
         mcl.acta_transferencia_modulo AS acta,
         mcl.fecha_trans_modulo AS fecha,
         COUNT(DISTINCT mc.id) AS "totalCajas",
         MIN(mc.caja_modulo) AS "cajaIniciar",
         MAX(mc.caja_modulo) AS "cajaFin",
         COUNT(f.id) AS registros,
         COUNT(f.id) FILTER (WHERE f.created_at > ?) AS "registrosSinReflejar"
  FROM moduloscliente mcl
  LEFT JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
  LEFT JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
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

  // `?acta=` acota la vista previa a una sola acta de transferencia. Sin él se
  // ve el FUID del cliente entero, que es como se abría hasta ahora.
  const actaRaw = typeof req.query.acta === 'string' ? req.query.acta.trim() : '';
  const acta = actaRaw.length > 0 ? actaRaw : null;

  const filtro = q ? buildFuidFilterParams(q) : [];
  const conFiltro = filtro.length > 0;

  const filas = await query<FuidConEstadoRow>(`${fuidQueryPorActa(acta, conFiltro)} LIMIT ? OFFSET ?`, [
    ...parametrosFuid(codigo, acta, filtro),
    limit,
    offset,
  ]);
  const countRows = await query<{ total: number }>(
    fuidCountPorActa(acta, conFiltro),
    parametrosFuid(codigo, acta, filtro),
  );

  // Los totales describen el alcance que se está viendo, con su acta pero sin el
  // texto del buscador: son el tamaño del conjunto, no el de la búsqueda.
  const stats = await queryOne<FuidStatsRow>(fuidStatsPorActa(acta), parametrosFuid(codigo, acta));

  res.json({
    inventario,
    filas,
    total: countRows[0]?.total ?? 0,
    limit,
    offset,
    q: q || null,
    acta,
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

  enviarExcel(res, buffer, nombre);

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

/**
 * Cifras reales de un cliente, leídas de sus cajas y de sus registros FUID.
 *
 * Salen de una sola consulta a propósito: si el total de cajas y el de registros
 * se leyeran por separado, entre una lectura y la otra podría entrar digitación y
 * el inventario acabaría contando dos momentos distintos.
 *
 * `COUNT(DISTINCT mc.id)` y no `COUNT(mc.id)` porque el JOIN con los registros
 * repite cada caja tantas veces como registros tenga. Los registros sí se cuentan
 * sin DISTINCT: el número de caja es único en la tabla, así que cada registro
 * casa con una sola caja y aparece una única vez.
 */
const CIFRAS_DEL_CLIENTE = `
  SELECT COUNT(DISTINCT mcl.id) AS total_actas,
         COUNT(DISTINCT mc.id) AS total_cajas,
         COUNT(DISTINCT mc.id) FILTER (WHERE mc.estado_caja = 'FINALIZADO') AS cajas_procesadas,
         MIN(mc.caja_modulo) AS caja_iniciar,
         MAX(mc.caja_modulo) AS caja_fin,
         COUNT(f.id) AS registros
  FROM moduloscliente mcl
  LEFT JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
  LEFT JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
  WHERE mcl.id_submodulo = (
    SELECT id_submodulo FROM moduloscliente WHERE codigo = ? ORDER BY id LIMIT 1
  )
`;

interface CifrasDelCliente {
  total_actas: number;
  total_cajas: number;
  cajas_procesadas: number;
  caja_iniciar: string | null;
  caja_fin: string | null;
  registros: number;
}

/** Con qué nombre se firma una actualización que no pidió ninguna persona. */
export const USUARIO_ACTUALIZACION_AUTOMATICA = 'ACTUALIZACION AUTOMATICA';

/**
 * Pone al día las cifras de un inventario con lo que hay ahora mismo en la base.
 *
 * El inventario nace siendo una foto del cliente, pero la digitación sigue: se
 * abren cajas, se cierran otras y entran registros. Sin volver a leer, el
 * documento envejece en silencio y lo que se entrega deja de cuadrar con lo que
 * hay en el sistema.
 *
 * No toca lo que se escribe a mano —funcionario, estados, fechas de entrega,
 * tipos de caja—: eso es gestión, no un dato que la base pueda deducir. Solo
 * reemplaza lo que sí sabe contar.
 *
 * Tras recalcular vuelve a subir el documento a Zoho Sheet, porque de nada sirve
 * tener la cifra al día aquí y el archivo viejo allá.
 */
export async function recalcularInventario(
  inventario: Inventario,
  usuario: string,
): Promise<{ inventario: Inventario; sync: SyncOutcome; cifras: CifrasDelCliente } | null> {
  const codigo = inventario.CODIGO_DEL_CLIENTE;
  if (!codigo) return null;

  const cifras = await queryOne<CifrasDelCliente>(CIFRAS_DEL_CLIENTE, [codigo]);
  if (!cifras) return null;

  await query(
    `UPDATE inventario
       SET "TOTAL_CAJAS" = ?, "CAJAS_PROCESADAS" = ?, "CAJA_INICIAR" = ?, "CAJ_FIN" = ?,
           "REGISTROS_PROCESADOS" = ?, "FECHA_ACTUALIZACION" = NOW(), "USUARIO_ACTUALIZACION" = ?
     WHERE "ITEMS" = ?`,
    [
      cifras.total_cajas,
      cifras.cajas_procesadas,
      cifras.caja_iniciar,
      cifras.caja_fin,
      cifras.registros,
      usuario,
      inventario.ITEMS,
    ],
  );

  const recalculado = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [inventario.ITEMS]);
  if (!recalculado) return null;

  const sync = await syncInventarioToWorkDrive({ ...recalculado }, inventario.ITEMS);
  const final = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [inventario.ITEMS]);
  return { inventario: final ?? recalculado, sync, cifras };
}

/** `POST /inventario/:id/recalcular`: el botón de actualizar de la pantalla. */
export async function recalcularInventarioController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const inventario = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [id]);
  if (!inventario) {
    res.status(404).json({ error: 'Registro no encontrado' });
    return;
  }

  const antes = {
    totalCajas: inventario.TOTAL_CAJAS,
    registros: inventario.REGISTROS_PROCESADOS,
  };
  const resultado = await recalcularInventario(inventario, auditoriaUsuario(req.session.user));
  if (!resultado) {
    res.status(404).json({ error: 'El inventario no tiene código de cliente con el que recalcular' });
    return;
  }

  void audit({
    entidad: 'inventario',
    entidadId: String(id),
    accion: 'ACTUALIZAR',
    detalle: `Recálculo de ${inventario.CLIENTE ?? inventario.CODIGO_DEL_CLIENTE}: cajas ${antes.totalCajas ?? 0} → ${resultado.cifras.total_cajas}, registros ${antes.registros ?? 0} → ${resultado.cifras.registros}`,
    usuario: req.session.user,
  });

  res.json({
    message: 'Inventario actualizado con los datos del sistema',
    inventario: resultado.inventario,
    sync: resultado.sync,
    antes,
    ahora: { totalCajas: resultado.cifras.total_cajas, registros: resultado.cifras.registros },
  });
}

/**
 * Recalcula todos los inventarios. La usa la actualización diaria.
 *
 * Va de uno en uno y no en paralelo a propósito: cada uno sube su archivo a Zoho,
 * y lanzar decenas de subidas a la vez es la forma más rápida de que el servicio
 * empiece a responder 429.
 */
export async function recalcularTodosLosInventarios(usuario: string): Promise<{
  total: number;
  actualizados: number;
  fallidos: number;
}> {
  const inventarios = await query<Inventario>('SELECT * FROM inventario ORDER BY "ITEMS"');
  let actualizados = 0;
  let fallidos = 0;

  for (const inventario of inventarios) {
    try {
      const resultado = await recalcularInventario(inventario, usuario);
      if (resultado) actualizados++;
      else fallidos++;
    } catch (error) {
      fallidos++;
      console.error(
        `[Inventario] No se pudo recalcular el inventario ${inventario.ITEMS} (${inventario.CODIGO_DEL_CLIENTE ?? 'sin código'}):`,
        error,
      );
    }
  }

  return { total: inventarios.length, actualizados, fallidos };
}

/** Cabeceras y cuerpo de una descarga de Excel. */
function enviarExcel(res: Response, buffer: Buffer, nombre: string): void {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // `filename*` va con el nombre codificado: el del cliente puede llevar tildes
  // y algunos navegadores cortan la descarga si llegan sin codificar.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nombre.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  );
  res.send(buffer);
}

/**
 * Descarga el FUID de un cliente por su código, sin pasar por un registro de
 * inventario.
 *
 * Existe aparte de `descargarInventarioExcel` por dos razones. La primera es que
 * hace falta poder bajar el documento mientras se está creando el inventario,
 * cuando todavía no hay fila en `inventario` de la que colgar la descarga. La
 * segunda es el árbol de la pantalla: cada acta cuelga de un cliente, no de un
 * inventario, y pedirla por el código del cliente evita tener que arrastrar el
 * identificador del inventario hasta cada rama.
 *
 * Con `?acta=` baja solo esa acta de transferencia; sin ella, el cliente entero.
 */
export async function descargarFuidDeCliente(req: Request, res: Response): Promise<void> {
  const { codigo } = req.params;
  const cliente = await queryOne<{ entidad_remitente: string | null }>(
    'SELECT entidad_remitente FROM moduloscliente WHERE codigo = ? ORDER BY id LIMIT 1',
    [codigo],
  );
  if (!cliente) {
    res.status(404).json({ error: `No se encontró un cliente con código ${codigo}` });
    return;
  }

  const actaRaw = typeof req.query.acta === 'string' ? req.query.acta.trim() : '';
  const acta = actaRaw.length > 0 ? actaRaw : null;

  const filas = await query<FuidConEstadoRow>(fuidQueryPorActa(acta), acta ? [codigo, acta] : [codigo]);
  if (filas.length === 0) {
    res.status(404).json({
      error: acta
        ? `El acta ${acta} no tiene datos FUID registrados para generar el inventario`
        : 'El cliente no tiene datos FUID registrados para generar el inventario',
    });
    return;
  }

  const buffer = await buildInventarioFuidExcel(filas);
  // Sin fecha de creación el nombre toma la de hoy, que es cuando se descarga.
  const nombre = inventarioFuidFilename(cliente.entidad_remitente, codigo, null, acta);
  enviarExcel(res, buffer, nombre);

  void audit({
    entidad: 'inventario',
    entidadId: codigo,
    accion: 'DESCARGAR',
    detalle: `Descarga del FUID de ${cliente.entidad_remitente ?? codigo}${
      acta ? `, acta ${acta}` : ' (cliente completo)'
    } (${filas.length} registros)`,
    usuario: req.session.user,
  });
}

/**
 * `GET /inventario/mio/excel?desde=&hasta=`
 *
 * El inventario general de quien digita: sus propios registros, de todas las
 * cajas, en el formato F-PSD-001. Lo pidió la operación para que cada técnico
 * pueda bajar lo que ha digitado sin pasar por el líder. Se cruza por la
 * cédula que va en `elaborado_por` ("NOMBRE (CC)") y no por el nombre, que
 * puede cambiar. Con `desde` y `hasta` se acota por la fecha del dato.
 */
export async function descargarMiInventario(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const fecha = (nombre: string) => (typeof req.query[nombre] === 'string' ? String(req.query[nombre]).trim() : '');
  const desde = fecha('desde');
  const hasta = fecha('hasta');
  for (const valor of [desde, hasta]) {
    if (valor && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      res.status(400).json({ error: 'Las fechas deben tener el formato AAAA-MM-DD' });
      return;
    }
  }

  const condiciones = [`substring(f.elaborado_por from '[(]([^)]*)[)]') = ?`];
  const params: unknown[] = [user.cc];
  if (desde) {
    condiciones.push('f.fecha_del_dato >= ?');
    params.push(desde);
  }
  if (hasta) {
    condiciones.push('f.fecha_del_dato <= ?');
    params.push(hasta);
  }

  const filas = await query<FuidConEstadoRow>(
    `SELECT f.*, o.n_orden_caja, mc.estado_caja
       FROM fuiddatosreal f
       JOIN ${sqlOrdenEnCaja()} o ON o.id = f.id
       LEFT JOIN modulos_caja mc ON mc.caja_modulo = f.caja
      WHERE ${condiciones.join(' AND ')}
      ORDER BY f.caja, o.n_orden_caja`,
    params,
  );
  if (filas.length === 0) {
    res.status(404).json({
      error: desde || hasta ? 'No tienes registros digitados en ese periodo' : 'Todavía no tienes registros digitados',
    });
    return;
  }

  const buffer = await buildInventarioFuidExcel(filas);
  enviarExcel(res, buffer, inventarioFuidFilename(user.nombre, user.cc, null));

  void audit({
    entidad: 'inventario',
    entidadId: user.cc,
    accion: 'DESCARGAR',
    detalle: `Descarga del inventario propio de ${user.nombre} (${filas.length} registros)`,
    usuario: user,
  });
}

/**
 * Crea el inventario de un cliente, o lo actualiza si ya lo tenía.
 *
 * Solo hace falta el cliente. Todo lo que la base puede contar —cajas, cajas
 * terminadas, rango de cajas y registros— lo pone el recálculo del final, no el
 * formulario: son cifras que ya existen en el sistema, y pedirlas a mano era
 * invitarse a que el documento dijera una cosa y la base otra. Lo que sí se
 * escribe es la gestión: funcionario, estados, fechas de entrega y tipos de caja.
 *
 * El recálculo deja además el archivo subido a Zoho Sheet, así que el inventario
 * nace ya publicado y con sus cifras al día.
 */
export async function createInventario(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const usuarioActual = auditoriaUsuario(req.session.user);
  const values = pickValues(body);

  const existente = await queryOne<Inventario>('SELECT * FROM inventario WHERE "CODIGO_DEL_CLIENTE" = ? LIMIT 1', [
    body.CODIGO_DEL_CLIENTE,
  ]);

  let items: number | string;
  let yaExistia = false;

  if (existente) {
    yaExistia = true;
    items = existente.ITEMS;
    const sets = `${FIELDS.map((f) => `${comillas(f)} = ?`).join(', ')}, "FECHA_ACTUALIZACION" = NOW(), "USUARIO_ACTUALIZACION" = ?`;
    await query(`UPDATE inventario SET ${sets} WHERE "ITEMS" = ?`, [...values, usuarioActual, items]);
  } else {
    const placeholders = [...values.map(() => '?'), 'NOW()', '?'].join(', ');
    const result = await queryResult(
      // La clave de esta tabla es "ITEMS", no `id`: hay que pedirla por su nombre
      // o no habría forma de recuperar el registro recién insertado.
      `INSERT INTO inventario (${FIELDS.map(comillas).join(', ')}, "FECHA_ACTUALIZACION", "USUARIO_ACTUALIZACION")
       VALUES (${placeholders}) RETURNING "ITEMS"`,
      [...values, usuarioActual],
    );
    items = result.insertId;
  }

  const row = await queryOne<Inventario>('SELECT * FROM inventario WHERE "ITEMS" = ?', [items]);
  if (!row) {
    res.status(500).json({ error: 'Registro guardado pero no se pudo recuperar' });
    return;
  }

  const recalculado = await recalcularInventario(row, usuarioActual);
  const sync = recalculado?.sync ?? (await syncInventarioToWorkDrive({ ...row }, items));

  res.json({
    message: yaExistia
      ? 'El cliente ya tenía un inventario; se actualizó con los últimos registros'
      : 'Inventario creado con los datos del sistema',
    id: items,
    sync,
    actualizado: yaExistia,
    inventario: recalculado?.inventario ?? row,
  });
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

  // Al guardar también se releen las cifras, igual que al crear: el inventario
  // no debe quedarse con un número de cajas de hace dos semanas solo porque
  // alguien entró a corregir el nombre del funcionario.
  const recalculado = await recalcularInventario(row, usuarioActual);
  const sync = recalculado?.sync ?? (await syncInventarioToWorkDrive({ ...row }, id));

  res.json({
    message: `Registro con ID: ${id} actualizado correctamente`,
    id,
    sync,
    inventario: recalculado?.inventario ?? row,
  });
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
