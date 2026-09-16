import { ZONA_HORARIA } from '../config/constants.js';

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

/**
 * Día (YYYY-MM-DD) de un instante en la hora de Colombia, donde operan todas las
 * sedes. No usar toISOString(): devuelve la fecha UTC y desde las 7 p. m. ya es
 * "mañana".
 */
export function fechaLocal(instante: Date, timeZone: string = ZONA_HORARIA): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** Fecha de hoy (YYYY-MM-DD) en la hora de Colombia. */
export function fechaHoyLocal(timeZone: string = ZONA_HORARIA): string {
  return fechaLocal(new Date(), timeZone);
}
