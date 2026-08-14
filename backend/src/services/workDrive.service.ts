const DC_DOMAINS: Record<string, string> = {
  US: 'zoho.com',
  EU: 'zoho.eu',
  IN: 'zoho.in',
  AU: 'zoho.com.au',
  JP: 'zoho.jp',
  CN: 'zoho.com.cn',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function getDomains(): { auth: string; workdrive: string } {
  const dc = (process.env.ZOHO_DC || 'US').toUpperCase();
  const domain = DC_DOMAINS[dc] || 'zoho.com';
  return { auth: `https://accounts.${domain}`, workdrive: `https://workdrive.${domain}` };
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
  const res = await fetch(`${auth}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho token error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

export async function uploadToFolder(buffer: Buffer, filename: string): Promise<{ fileId?: string }> {
  const { workdrive } = getDomains();
  const folderId = process.env.ZOHO_FOLDER_ID;
  if (!folderId) throw new Error('ZOHO_FOLDER_ID no configurado');
  const token = await getAccessToken();
  const form = new FormData();
  form.append(
    'content',
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
  const url = `${workdrive}/api/v1/upload?filename=${encodeURIComponent(filename)}&override-name-exist=true&parent_id=${encodeURIComponent(folderId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho upload error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { data?: Array<{ attributes?: { resource_id?: string } }> };
  return { fileId: data?.data?.[0]?.attributes?.resource_id };
}

/** True when the required Zoho env vars are present. */
export function isWorkDriveConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_FOLDER_ID);
}