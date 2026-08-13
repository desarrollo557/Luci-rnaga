import { z } from 'zod';

const optionalText = z.string().nullable().optional();
const optionalNumber = z.union([z.number(), z.string()]).nullable().optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .nullable()
  .optional();

export const createFuidSchema = z.object({
  fecha_del_dato: optionalDate,
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
  fecha_inicial: optionalDate,
  fecha_final: optionalDate,
  caja: z.string({ message: 'La caja es requerida' }).min(1, 'La caja es requerida'),
  upd: z.string({ message: 'El UPD es requerido' }).min(1, 'El UPD es requerido'),
  tomo: optionalText,
  otro: optionalText,
  caja_interna: optionalText,
  folios: optionalText,
  soporte: optionalText,
  frecuencia: optionalText,
  elaborado_por: optionalText,
  nro_acta_transferible: optionalText,
  fecha_transferencia: optionalDate,
  notas: optionalText,
  sede: optionalText,
  tiempo: optionalText,
  historial_y_cambios: optionalText,
  cambio_calidad: optionalText,
  sede_calidad: optionalText,
  asunto_2: optionalText,
  asunto_3: optionalText,
});

export const updateFuidSchema = createFuidSchema.partial().extend({
  caja: z
    .string({ message: 'La caja no puede estar vacía' })
    .min(1, 'La caja no puede estar vacía')
    .optional(),
  upd: z
    .string({ message: 'El UPD no puede estar vacío' })
    .min(1, 'El UPD no puede estar vacío')
    .optional(),
});