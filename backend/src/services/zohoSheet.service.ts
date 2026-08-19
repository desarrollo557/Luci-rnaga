import { getAccessToken, invalidateAccessTokenCache } from './workDrive.service.js';

const DC_DOMAINS: Record<string, string> = {
  US: 'zoho.com',
  EU: 'zoho.eu',
  IN: 'zoho.in',
  AU: 'zoho.com.au',
  JP: 'zoho.jp',
  CN: 'zoho.com.cn',
};

const DEFAULT_WORKSHEET = 'Hoja1';
const BATCH_SIZE = 500;

/** Encabezado oficial del FUID (fila 8 del Excel) en el orden exacto: [header, campo BD]. */
export const FUID_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['N° Orden', 'n_orden'],
  ['CÓDIGO', 'codigo'],
  ['ENTIDAD REMITENTE', 'entidad_remitente'],
  ['ENTIDAD PRODUCTORA', 'entidad_productora'],
  ['UNIDAD ADMINISTRATIVA', 'unidad_administrativa'],
  ['OFICINA PRODUCTORA', 'oficina_productora'],
  ['OBJETO', 'objeto'],
  ['SERIE', 'serie'],
  ['SUBSERIE', 'subserie'],
  ['ASUNTOS', 'asunto'],
  ['Desde', 'numero_doc'],
  ['Hasta', 'numero_doc_hasta'],
  ['Inicial', 'fecha_inicial'],
  ['Final', 'fecha_final'],
  ['CAJA', 'caja'],
  ['UPD', 'upd'],
  ['TOMO', 'tomo'],
  ['OTRO', 'otro'],
  ['CAJA INTERNA', 'caja_interna'],
  ['FOLIOS', 'folios'],
  ['SOPORTE', 'soporte'],
  ['FRECUENCIA', 'frecuencia'],
  ['NOTAS', 'notas'],
  ['ELABORADO POR', 'elaborado_por'],
  ['FECHA DE INVENTARIO', 'fecha_del_dato'],
  ['No. ACTA DE TRANSFERENCIA', 'nro_acta_transferible'],
  ['FECHA DE TRANSFERENCIA', 'fecha_transferencia'],
];

export class ZohoSheetError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ZohoSheetError';
  }
}

function getDomain(): string {
  const dc = (process.env.ZOHO_DC || 'US').toUpperCase();
  return DC_DOMAINS[dc] || 'zoho.com';
}

function sheetBase(): string {
  return `https://sheet.${getDomain()}`;
}

/** Respuesta acotada a ~200 caracteres, sin saltos de línea, para mensajes de error. */
function bodySnippet(body: string, max = 200): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** True when the required Zoho env vars are present. */
export function isZohoSheetConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

/**
 * Ejecuta un fetch con el token de Zoho y reintentos: 401/403 renuevan el token,
 * 429/5xx esperan 1.5s y reintentan. Los errores de red se envuelven en ZohoSheetError.
 */
async function zohoFetch(url: string, init: RequestInit): Promise<Response> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let token: string;
  try {
    token = await getAccessToken();
  } catch (cause) {
    throw new ZohoSheetError('No se pudo obtener el token de Zoho Sheet: falló la autenticación', { cause });
  }

  const attempt = (t: string): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Zoho-oauthtoken ${t}` },
    });

  let res: Response;
  try {
    res = await attempt(token);
    if (res.status === 401 || res.status === 403) {
      invalidateAccessTokenCache();
      const freshToken = await getAccessToken();
      res = await attempt(freshToken);
    } else if (res.status === 429 || res.status >= 500) {
      await sleep(1500);
      res = await attempt(token);
    }
  } catch (cause) {
    throw new ZohoSheetError('No se pudo conectar con Zoho Sheet: falló la conexión con el servidor', { cause });
  }
  return res;
}

/** Crea un workbook de Zoho Sheet y devuelve su resource_id (el id real del workbook). */
export async function createZohoSheetWorkbook(nombre: string): Promise<string> {
  const url = `${sheetBase()}/api/v2/create`;
  const body = new URLSearchParams({ method: 'workbook.create', workbook_name: nombre });
  const res = await zohoFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    const detail = bodySnippet(raw) || `HTTP ${res.status}`;
    throw new ZohoSheetError(`No se pudo crear el workbook de Zoho Sheet: HTTP ${res.status} — ${detail}`, {
      cause: new Error(`HTTP ${res.status}: ${raw}`),
    });
  }
  const data = (await res.json().catch(() => ({}))) as { resource_id?: string; workbook_id?: string };
  const resourceId = data.resource_id ?? data.workbook_id;
  if (!resourceId) {
    throw new ZohoSheetError('No se pudo crear el workbook de Zoho Sheet: la respuesta no incluye resource_id');
  }
  return resourceId;
}

/** Escribe registros en la hoja del workbook en lotes de 500. Los headers salen de las keys del primer objeto. */
export async function writeZohoSheetRecords(
  workbookId: string,
  worksheetName: string,
  records: Array<Record<string, unknown>>,
): Promise<void> {
  if (records.length === 0) return;
  const url = `${sheetBase()}/api/v2/${workbookId}`;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const lote = records.slice(i, i + BATCH_SIZE);
    const body = new URLSearchParams({
      method: 'worksheet.records.add',
      worksheet_name: worksheetName,
      header_row: '1',
      cell_data: JSON.stringify(lote),
    });
    const res = await zohoFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const raw = await res.text().catch(() => '');
    if (!res.ok) {
      const detail = bodySnippet(raw) || `HTTP ${res.status}`;
      throw new ZohoSheetError(`No se pudieron escribir los registros en Zoho Sheet: HTTP ${res.status} — ${detail}`, {
        cause: new Error(`HTTP ${res.status}: ${raw}`),
      });
    }
    let status = 'success';
    try {
      const json = JSON.parse(raw) as { status?: string };
      if (json.status) status = json.status;
    } catch {
      // fallback: la respuesta no es JSON, se asume éxito si el HTTP fue 2xx
    }
    if (status !== 'success') {
      const detail = bodySnippet(raw) || `status=${status}`;
      throw new ZohoSheetError(`No se pudieron escribir los registros en Zoho Sheet: ${detail}`, {
        cause: new Error(raw),
      });
    }
  }
}

/** Crea el workbook y escribe las filas FUID mapeadas a las 27 columnas oficiales. */
export async function buildZohoSheetFromFuid<T extends object>(
  filas: T[],
  nombre: string,
): Promise<{ workbookId: string; url: string }> {
  const records = filas.map((fila) => {
    const obj: Record<string, unknown> = {};
    for (const [header, campo] of FUID_COLUMNS) {
      const valor = (fila as Record<string, unknown>)[campo];
      obj[header] = valor == null ? '' : valor;
    }
    return obj;
  });

  const workbookId = await createZohoSheetWorkbook(nombre);
  await writeZohoSheetRecords(workbookId, DEFAULT_WORKSHEET, records);
  const url = `${sheetBase()}/sheet/open/${workbookId}`;
  return { workbookId, url };
}

/** POST multipart a la API de upload de Zoho Sheet con token y reintentos (401/403/F7007 renuevan token, 429/5xx esperan 1.5s). */
async function zohoUploadAttempt(form: FormData, url: string): Promise<Response> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (cause) {
    throw new ZohoSheetError('No se pudo obtener el token de Zoho Sheet: falló la autenticación', { cause });
  }

  const attempt = (t: string): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${t}` },
      body: form,
    });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let res: Response;
  try {
    res = await attempt(token);
    const rawBody = await res.clone().text().catch(() => '');
    if (res.status === 401 || res.status === 403 || rawBody.includes('Invalid OAuth scope') || rawBody.includes('F7007')) {
      invalidateAccessTokenCache();
      const freshToken = await getAccessToken();
      res = await attempt(freshToken);
    } else if (res.status === 429 || res.status >= 500) {
      await sleep(1500);
      res = await attempt(token);
    }
  } catch (cause) {
    throw new ZohoSheetError('No se pudo conectar con Zoho Sheet: falló la conexión con el servidor', { cause });
  }
  return res;
}

/**
 * Sube/actualiza un .xlsx a Zoho Sheet:
 * - Si hay resourceIdExistente: crea workbook NUEVO con nombre versionado (evita duplicados silenciosos).
 *   El ZOHO_FILE_ID se actualiza al último. Los antiguos quedan como historial.
 * - Si no: usa workbook.upload (crea nuevo).
 * Devuelve { workbookId, url }.
 */
export async function subirOActualizarZohoSheetFromExcel(
  buffer: Buffer,
  workbookName: string,
  resourceIdExistente?: string | null,
): Promise<{ workbookId: string; url: string }> {
  // Nombre versionado si es actualización: Inventario_FUID_Cliente_054_ITEMS1_2026-08-19T18-30-00
  const finalWorkbookName = resourceIdExistente
    ? `${workbookName}_ITEMS${Date.now()}`
    : workbookName;

  const form = new FormData();
  form.append('method', 'workbook.upload');
  form.append('workbook_name', finalWorkbookName);
  form.append('override-name-exist', 'true');
  const folderId = process.env.ZOHO_FOLDER_ID;
  if (folderId) form.append('parent_id', folderId);
  form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${finalWorkbookName}.xlsx`);

  const url = `${sheetBase()}/api/v2/upload`;
  const res = await zohoUploadAttempt(form, url);
  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    const detail = bodySnippet(raw) || `HTTP ${res.status}`;
    throw new ZohoSheetError(`No se pudo subir el workbook a Zoho Sheet: HTTP ${res.status} — ${detail}`, {
      cause: new Error(`HTTP ${res.status}: ${raw}`),
    });
  }
  let data: { resource_id?: string; workbook_url?: string; status?: string } = {};
  try { data = JSON.parse(raw) as typeof data; } catch {}
  const workbookId = data.resource_id;
  if (!workbookId) {
    throw new ZohoSheetError('No se pudo subir el workbook: la respuesta no incluye resource_id');
  }
  const urlAbierta = data.workbook_url || `${sheetBase()}/sheet/open/${workbookId}`;
  return { workbookId, url: urlAbierta };
}

/** Wrapper de compatibilidad: sube el .xlsx como workbook nuevo (sin resource_id previo). */
export async function uploadZohoSheetFromExcel(
  buffer: Buffer,
  workbookName: string,
): Promise<{ workbookId: string; url: string }> {
  return subirOActualizarZohoSheetFromExcel(buffer, workbookName);
}
