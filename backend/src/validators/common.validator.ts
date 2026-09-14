import { z } from 'zod';
import { FECHA_MINIMA_DOCUMENTAL } from '../config/constants.js';
import { fechaHoyLocal } from '../utils/format.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Comprueba que una cadena `YYYY-MM-DD` corresponda a un día que existe.
 *
 * El regex por sí solo acepta `2025-02-30` o `2025-13-01`. Se reconstruye la
 * fecha en UTC y se comparan los tres componentes: si MySQL hubiera recibido
 * `2025-02-30` la habría guardado como `0000-00-00` o la habría rechazado según
 * el modo estricto, y en ambos casos el dato se pierde sin que nadie se entere.
 */
export function esFechaReal(valor: string): boolean {
  if (!FORMATO_FECHA.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/**
 * Devuelve el motivo por el que una fecha no es válida, o `null` si lo es.
 *
 * Las cadenas `YYYY-MM-DD` se comparan como texto a propósito: el orden
 * lexicográfico coincide con el cronológico y así se evita construir objetos
 * `Date`, que reintroducirían el problema de zona horaria.
 */
export function motivoFechaInvalida(valor: string, etiqueta: string): string | null {
  if (!FORMATO_FECHA.test(valor)) return `${etiqueta} debe tener el formato AAAA-MM-DD`;
  if (!esFechaReal(valor)) return `${etiqueta} no corresponde a un día que exista en el calendario`;
  if (valor < FECHA_MINIMA_DOCUMENTAL) {
    return `${etiqueta} no puede ser anterior a ${FECHA_MINIMA_DOCUMENTAL}`;
  }
  const hoy = fechaHoyLocal();
  if (valor > hoy) return `${etiqueta} no puede ser posterior a hoy (${hoy})`;
  return null;
}

/**
 * Campo de fecha opcional del FUID: formato, día real y dentro del rango
 * [FECHA_MINIMA_DOCUMENTAL, hoy].
 *
 * `hoy` se resuelve en cada petición con `fechaHoyLocal()`, que usa la zona
 * horaria de Colombia. Calcularlo al cargar el módulo dejaría el servidor
 * rechazando las fechas del día en cuanto pasara la medianoche sin reiniciarlo.
 */
export function fechaDocumental(etiqueta: string) {
  return z
    .string()
    .nullable()
    .optional()
    .superRefine((valor, ctx) => {
      // Vacío y null significan "sin dato", que es válido: el campo es opcional.
      if (valor == null || valor.trim() === '') return;
      const motivo = motivoFechaInvalida(valor.trim(), etiqueta);
      if (motivo) ctx.addIssue({ code: 'custom', message: motivo });
    });
}
