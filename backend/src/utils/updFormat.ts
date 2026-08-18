const UPD_PREFIX = 'UPD';
const UPD_DIGITS = 7;
const UPD_REGEX = /^UPD\d{7}$/;

/** Normaliza un UPD: quita espacios y pasa a mayúsculas. */
export function normalizeUpd(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toUpperCase();
}

/** Valida el formato UPD + exactamente 7 dígitos (^UPD\d{7}$). */
export function isUpdValid(upd: string): boolean {
  return UPD_REGEX.test(upd);
}

/** Convierte 'UPD2950001' → 2950001. Devuelve NaN si el sufijo no es numérico. */
export function toNumeric(upd: string): number {
  return Number(upd.slice(UPD_PREFIX.length));
}

/** Convierte 2950001 → 'UPD2950001' (LPAD a 7 dígitos). */
export function formatUpd(n: number): string {
  return UPD_PREFIX + String(n).padStart(UPD_DIGITS, '0');
}
