import { z } from 'zod';
import { isUpdValid, normalizeUpd } from '../utils/updFormat.js';
import { fechaDocumental } from './common.validator.js';

const optionalText = z.string().nullable().optional();
const optionalNumber = z.union([z.number(), z.string()]).nullable().optional();

/**
 * Normaliza (trim + mayúsculas) y valida un UPD: UPD + exactamente 7 dígitos.
 * El enforcement de membresía por rango es solo para rol TECNICA y se aplica en
 * el controller; aquí solo se garantiza el formato para todos los roles.
 */
const updField = z
  .string({ message: 'El UPD es requerido' })
  .min(1, 'El UPD es requerido')
  .transform((v) => normalizeUpd(v))
  .refine((v) => isUpdValid(v), {
    message: 'Formato de UPD inválido: debe ser UPD + 7 dígitos (ej. UPD2950001)',
  });

const fuidBaseSchema = z.object({
  fecha_del_dato: fechaDocumental('La fecha del dato'),
  n_orden: optionalNumber,
  codigo: optionalText,
  entidad_remitente: optionalText,
  entidad_productora: optionalText,
  unidad_administrativa: optionalText,
  oficina_productora: optionalText,
  objeto: optionalText,
  serie: optionalText,
  subserie: optionalText,
  numero_de_orden_interno: optionalText,
  accionado_procesado: optionalText,
  accionado_denunciante: optionalText,
  identificacion: optionalText,
  asunto: optionalText,
  radicado: optionalText,
  numero_doc: optionalText,
  numero_doc_hasta: optionalText,
  fecha_inicial: fechaDocumental('La fecha inicial'),
  fecha_final: fechaDocumental('La fecha final'),
  caja: z.string({ message: 'La caja es requerida' }).min(1, 'La caja es requerida'),
  upd: updField,
  tomo: optionalText,
  otro: optionalText,
  caja_interna: optionalText,
  folios: optionalText,
  soporte: optionalText,
  frecuencia: optionalText,
  elaborado_por: optionalText,
  nro_acta_transferible: optionalText,
  fecha_transferencia: fechaDocumental('La fecha de transferencia'),
  notas: optionalText,
  sede: optionalText,
  tiempo: optionalText,
  historial_y_cambios: optionalText,
  cambio_calidad: optionalText,
  sede_calidad: optionalText,
  asunto_2: optionalText,
  asunto_3: optionalText,
});

/**
 * El rango documental no puede ir hacia atrás.
 *
 * La validación existía en la versión anterior del sistema (`validateDates()`) y
 * se perdió al migrar: en el volcado de producción hay 10 registros con la fecha
 * final anterior a la inicial.
 *
 * Solo corre cuando ambas fechas vienen en el cuerpo. En una edición parcial que
 * trae una sola, la comparación contra el valor ya guardado la resuelve
 * `validarOrdenDeFechasParcial`, que sí puede leer el registro existente.
 */
function ordenDeFechas(
  datos: { fecha_inicial?: string | null; fecha_final?: string | null },
  ctx: z.RefinementCtx,
): void {
  const inicial = datos.fecha_inicial?.trim();
  const final = datos.fecha_final?.trim();
  if (!inicial || !final) return;
  if (final < inicial) {
    ctx.addIssue({
      code: 'custom',
      path: ['fecha_final'],
      message: 'La fecha final no puede ser anterior a la fecha inicial',
    });
  }
}

/**
 * El número de documento "hasta" no puede quedar por debajo del "desde".
 *
 * Solo se compara cuando ambos son enteros. Estos campos guardan también
 * radicados y referencias con letras, y `N/A` cuando el digitador marca el campo
 * como no diligenciado: en esos casos no hay un orden que comprobar y la regla
 * no aplica, igual que hace `onlyDigits` en el frontend.
 */
function ordenDeNumerosDeDocumento(
  datos: { numero_doc?: string | null; numero_doc_hasta?: string | null },
  ctx: z.RefinementCtx,
): void {
  const desde = datos.numero_doc?.trim();
  const hasta = datos.numero_doc_hasta?.trim();
  if (!desde || !hasta) return;
  if (!/^\d+$/.test(desde) || !/^\d+$/.test(hasta)) return;
  if (BigInt(hasta) < BigInt(desde)) {
    ctx.addIssue({
      code: 'custom',
      path: ['numero_doc_hasta'],
      message: 'El número de documento final no puede ser menor que el inicial',
    });
  }
}

export const createFuidSchema = fuidBaseSchema
  .superRefine(ordenDeFechas)
  .superRefine(ordenDeNumerosDeDocumento);

export const updateFuidSchema = fuidBaseSchema
  .partial()
  .extend({
    caja: z
      .string({ message: 'La caja no puede estar vacía' })
      .min(1, 'La caja no puede estar vacía')
      .optional(),
    upd: updField.optional(),
  })
  .superRefine(ordenDeFechas)
  .superRefine(ordenDeNumerosDeDocumento);

/**
 * Comprueba el orden de las fechas de una edición parcial contra lo ya guardado.
 *
 * Sin esto, un PUT que solo trae `fecha_final` pasaría el schema —no hay con qué
 * compararla— y dejaría el registro con el rango invertido. Devuelve el mensaje
 * de error o `null` si el rango resultante es válido.
 */
export function validarOrdenDeFechasParcial(
  cambios: { fecha_inicial?: string | null; fecha_final?: string | null },
  guardado: { fecha_inicial?: string | null; fecha_final?: string | null },
): string | null {
  // `undefined` significa "no se toca este campo"; `null` significa "bórralo".
  const inicial = (cambios.fecha_inicial === undefined ? guardado.fecha_inicial : cambios.fecha_inicial)?.trim();
  const final = (cambios.fecha_final === undefined ? guardado.fecha_final : cambios.fecha_final)?.trim();
  if (!inicial || !final) return null;
  return final < inicial ? 'La fecha final no puede ser anterior a la fecha inicial' : null;
}