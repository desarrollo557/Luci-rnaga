const DC_DOMAINS: Record<string, string> = {
  US: 'zoho.com',
  EU: 'zoho.eu',
  IN: 'zoho.in',
  AU: 'zoho.com.au',
  JP: 'zoho.jp',
  CN: 'zoho.com.cn',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export class WorkDriveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WorkDriveError';
  }
}

/** Invalida el token en caché para forzar una renovación en la siguiente llamada. */
export function invalidateAccessTokenCache(): void {
  cachedToken = null;
}

function getDomains(): { auth: string; workdrive: string } {
  const dc = (process.env.ZOHO_DC || 'US').toUpperCase();
  const domain = DC_DOMAINS[dc] || 'zoho.com';
  return { auth: `https://accounts.${domain}`, workdrive: `https://workdrive.${domain}` };
}

/** Respuesta acotada a ~200 caracteres, sin saltos de línea, para mensajes de error. */
function bodySnippet(body: string, max = 200): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const { auth } = getDomains();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID || '',
    client_secret: process.env.ZOHO_CLIENT_SECRET || '',
    refresh_token: process.env.ZOHO_REFRESH_TOKEN || '',
  });
  let res: Response;
  try {
    res = await fetch(`${auth}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (cause) {
    throw new WorkDriveError('No se pudo obtener el token de Zoho WorkDrive: falló la conexión con el servidor de autenticación', {
      cause,
    });
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let detail = bodySnippet(raw) || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(raw) as { error?: string };
      if (json.error) detail = json.error;
    } catch {
      // fallback: el detalle ya quedó como snippet del texto crudo
    }
    if (detail === 'invalid_grant') {
      detail = 'invalid_grant (revisa el refresh token en .env)';
    }
    throw new WorkDriveError(`No se pudo obtener el token de Zoho WorkDrive: ${detail}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  if (!data.access_token) {
    throw new WorkDriveError('No se pudo obtener el token de Zoho WorkDrive: la respuesta no incluye access_token');
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

function buildForm(buffer: Buffer, filename: string): FormData {
  const form = new FormData();
  form.append(
    'content',
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
  return form;
}

export async function uploadToFolder(buffer: Buffer, filename: string): Promise<{ fileId?: string }> {
  const { workdrive } = getDomains();
  const folderId = process.env.ZOHO_FOLDER_ID;
  if (!folderId) throw new WorkDriveError('No se pudo subir el documento a Zoho WorkDrive: ZOHO_FOLDER_ID no configurado');
  const url = `${workdrive}/api/v1/upload?filename=${encodeURIComponent(filename)}&override-name-exist=true&parent_id=${encodeURIComponent(folderId)}`;

  const doAttempt = (token: string): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      body: buildForm(buffer, filename),
    });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const token = await getAccessToken();
  let res: Response;
  try {
    res = await doAttempt(token);
    const rawBody = await res.clone().text().catch(() => '');
    if (res.status === 401 || res.status === 403 || rawBody.includes('Invalid OAuth scope') || rawBody.includes('F7007')) {
      // Token con scope insuficiente (p.ej. tras regenerarlo en la consola de Zoho):
      // descartar la caché, obtener un access token fresco con el refresh token actual e intentar una vez más.
      cachedToken = null;
      const freshToken = await getAccessToken();
      res = await doAttempt(freshToken);
    } else if (res.status === 429 || res.status >= 500) {
      await sleep(1500);
      res = await doAttempt(token);
    }
  } catch (cause) {
    throw new WorkDriveError('No se pudo subir el documento a Zoho WorkDrive: falló la conexión con el servidor', { cause });
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    const detail = bodySnippet(raw) || `HTTP ${res.status}`;
    throw new WorkDriveError(`No se pudo subir el documento a Zoho WorkDrive: HTTP ${res.status} — ${detail}`, {
      cause: new Error(`HTTP ${res.status}: ${raw}`),
    });
  }
  const data = (await res.json()) as { data?: Array<{ attributes?: { resource_id?: string } }> };
  return { fileId: data?.data?.[0]?.attributes?.resource_id };
}

/** Elimina un archivo de WorkDrive por su file_id (resource_id). */
export async function deleteFile(fileId: string): Promise<void> {
  const { workdrive } = getDomains();
  const url = `${workdrive}/api/v1/files/${fileId}`;

  const doAttempt = (token: string): Promise<Response> =>
    fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const token = await getAccessToken();
  let res: Response;
  try {
    res = await doAttempt(token);
    if (res.status === 401 || res.status === 403) {
      invalidateAccessTokenCache();
      const freshToken = await getAccessToken();
      res = await doAttempt(freshToken);
    } else if (res.status === 429 || res.status >= 500) {
      await sleep(1500);
      res = await doAttempt(token);
    }
  } catch (cause) {
    throw new WorkDriveError('No se pudo eliminar el archivo de Zoho WorkDrive: falló la conexión con el servidor', { cause });
  }
  if (!res.ok && res.status !== 404) {
    const raw = await res.text().catch(() => '');
    const detail = bodySnippet(raw) || `HTTP ${res.status}`;
    throw new WorkDriveError(`No se pudo eliminar el archivo de Zoho WorkDrive: HTTP ${res.status} — ${detail}`, {
      cause: new Error(`HTTP ${res.status}: ${raw}`),
    });
  }
  // 404 = ya no existe, OK silencioso
}

/** True when the required Zoho env vars are present. */
export function isWorkDriveConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_FOLDER_ID);
}
