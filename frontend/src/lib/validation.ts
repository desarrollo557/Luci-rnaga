import { esValorVacio } from './camposVacios';

export type FieldValidator = (value: string, label: string) => string | null;

export function required(value: string, label: string): string | null {
  return value.trim() === '' ? `${label} es requerido` : null;
}

export function onlyDigits(value: string, label: string): string | null {
  // `N/A` es el marcador que deja el diálogo de campos sin diligenciar y la base
  // ya lo guarda así en columnas de texto como `folios`: no es un formato inválido.
  if (value.trim() === '' || esValorVacio(value)) return null;
  return /^\d+$/.test(value.trim()) ? null : `${label} debe contener solo números`;
}

export function minLength(value: string, n: number, label: string): string | null {
  return value.trim().length < n ? `${label} debe tener al menos ${n} caracteres` : null;
}

export function validDate(value: string, label: string): string | null {
  if (value.trim() === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? null
    : `${label} debe tener el formato YYYY-MM-DD`;
}

/**
 * Fecha más antigua aceptada en cualquier campo de fecha del FUID.
 *
 * Debe coincidir con FECHA_MINIMA_DOCUMENTAL de `backend/src/config/constants.ts`:
 * el backend es quien manda, esto solo adelanta el aviso al usuario.
 */
export const FECHA_MINIMA_DOCUMENTAL = '1920-01-01';

/** Hoy en formato YYYY-MM-DD, en la zona horaria donde opera la sede. */
export function fechaHoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** true si la cadena YYYY-MM-DD es un día que existe (descarta 2025-02-30). */
export function esFechaReal(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [anio, mes, dia] = value.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/**
 * Misma regla que `fechaDocumental` en el backend: formato, día real del
 * calendario y rango entre FECHA_MINIMA_DOCUMENTAL y hoy.
 */
export function dateInRange(value: string, label: string): string | null {
  const v = value.trim();
  if (v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} debe tener el formato AAAA-MM-DD`;
  if (!esFechaReal(v)) return `${label} no corresponde a un día que exista en el calendario`;
  if (v < FECHA_MINIMA_DOCUMENTAL) return `${label} no puede ser anterior a ${FECHA_MINIMA_DOCUMENTAL}`;
  const hoy = fechaHoyLocal();
  if (v > hoy) return `${label} no puede ser posterior a hoy (${hoy})`;
  return null;
}

/**
 * Misma regla que el superRefine de `createFuidSchema`: el rango documental no
 * puede ir hacia atrás. Devuelve el mensaje para mostrar bajo `fecha_final`.
 */
export function dateOrderValid(inicial: string, final: string): string | null {
  const desde = inicial.trim();
  const hasta = final.trim();
  if (desde === '' || hasta === '') return null;
  return hasta < desde ? 'La fecha final no puede ser anterior a la fecha inicial' : null;
}

export function validCaja(value: string): string | null {
  if (value.trim() === '') return null;
  return /^\d{3}C\d{6}$/.test(value.trim())
    ? null
    : 'El número de caja debe tener el formato 000C000000';
}

export function validUpd(value: string, label: string): string | null {
  if (value.trim() === '') return null;
  return /^UPD\d{7}$/.test(value.trim())
    ? null
    : `${label} debe tener el formato UPD + 7 dígitos (ej. UPD0000001)`;
}

export function createValidator(...checks: FieldValidator[]): FieldValidator {
  return (value, label) => {
    for (const check of checks) {
      const error = check(value, label);
      if (error) return error;
    }
    return null;
  };
}