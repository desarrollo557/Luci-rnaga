/**
 * Configuración central del backend.
 *
 * Reúne los valores que antes estaban repartidos como literales por app.ts,
 * server.ts y db.ts (ver AUDIT_REPORT.md §1). Cada constante lee su variable de
 * entorno correspondiente y cae a un valor por defecto seguro para desarrollo.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ── Servidor ──────────────────────────────────────────────────────────────
export const DEFAULT_PORT = envInt('PORT', 3000);
export const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
export const SERVICE_NAME = 'luci-api';

// ── Rate limiting ─────────────────────────────────────────────────────────
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_GENERAL = envInt('RATE_LIMIT_GENERAL', 1000);
export const RATE_LIMIT_LOGIN_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_LOGIN = envInt('RATE_LIMIT_LOGIN', 30);

// ── CORS y sesión ─────────────────────────────────────────────────────────
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8;
export const DEFAULT_FRONTEND_DIST = '../frontend/dist';

// ── Base de datos ─────────────────────────────────────────────────────────
export const DB_CONNECTION_LIMIT = envInt('DB_CONNECTION_LIMIT', 10);
export const DB_QUEUE_LIMIT = 0;

// ── Seguridad ─────────────────────────────────────────────────────────────
export const BCRYPT_SALT_ROUNDS = 10;

// ── Paginación ────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

// ── Auditoría ─────────────────────────────────────────────────────────────
export const AUDIT_DETALLE_MAX_LENGTH = 500;

/**
 * En producción el secreto de sesión es obligatorio: un fallback conocido
 * permitiría falsificar cookies de sesión (AUDIT_REPORT.md, app.ts:47).
 */
export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET es obligatorio cuando NODE_ENV=production');
  }
  return 'luci-dev-secret';
}
