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

/**
 * El nombre de una persona, sin la cédula que lo acompaña.
 *
 * `elaborado_por` se guarda como "NOMBRE (CC)" porque los informes de producción
 * cruzan al digitador con la tabla de usuarios por esa cédula. Pero el FUID que
 * se genera se le entrega al cliente, y ahí la cédula de quien digitó no pinta
 * nada: al líder le tocaba borrarla a mano de cada fila antes de entregar.
 *
 * Solo se quita el paréntesis **final**, que es donde va la cédula. Un nombre que
 * lleve paréntesis en medio los conserva. Si al quitarlo no quedara nada —un
 * valor que fuera solo "(123)"— se devuelve el original, porque una celda vacía
 * dice menos que un dato raro.
 *
 * Es solo para lo que sale del sistema: lo guardado no cambia, o los informes de
 * producción se quedarían sin con qué cruzar al digitador.
 */
export function soloNombre(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;
  const sinCedula = valor.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return sinCedula === '' ? valor : sinCedula;
}
