import { z } from 'zod';
import { isUpdValid, normalizeUpd, toNumeric } from '../utils/updFormat.js';

const positiveInt = z.coerce
  .number({ message: 'Debe ser un número entero positivo' })
  .int('Debe ser un número entero')
  .positive('Debe ser un número entero positivo');

/** Normaliza (trim + mayúsculas) y valida un UPD: UPD + exactamente 7 dígitos. */
const updField = z
  .string({ message: 'El UPD es requerido' })
  .transform((v) => normalizeUpd(v))
  .refine((v) => isUpdValid(v), {
    message: 'Formato de UPD inválido: debe ser UPD + 7 dígitos (ej. UPD2950001)',
  });

/** Rechaza rangos invertidos (upd_inicio > upd_fin). */
function checkRangeOrdering(data: { upd_inicio: string; upd_fin: string }, ctx: z.RefinementCtx): void {
  if (toNumeric(data.upd_inicio) > toNumeric(data.upd_fin)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['upd_fin'],
      message: 'upd_fin no puede ser menor que upd_inicio',
    });
  }
}

export const assignRangeSchema = z
  .object({
    usuario_id: positiveInt,
    sub_modulo_id: positiveInt,
    upd_inicio: updField,
    upd_fin: updField,
  })
  .superRefine(checkRangeOrdering);

/** Mismos campos que la asignación: el pre-check valida un rango candidato idéntico. */
export const checkRangeSchema = assignRangeSchema;