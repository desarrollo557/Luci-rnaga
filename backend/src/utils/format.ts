/** Normaliza un string: quita espacios, colapsa dobles y pasa a mayúsculas. */
export function cleanUpper(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Devuelve el valor o 'N/A' como string en mayúsculas. */
export function naOrDefault(value: unknown): string {
  const cleaned = cleanUpper(value);
  return cleaned || 'N/A';
}

/** Convierte fecha a formato YYYY-MM-DD o null. */
export function dateOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
