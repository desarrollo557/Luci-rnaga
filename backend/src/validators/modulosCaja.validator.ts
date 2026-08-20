import { z } from 'zod';

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .nullable()
  .optional();

const updRegex = /^UPD\d{7}$/i;

export const createModuloCajaSchema = z.object({
  caja_modulo: z
    .string({ message: 'El número de caja es requerido' })
    .regex(/^\d{3}C\d{6}$/, 'El número de caja debe tener el formato 000C000000'),
  entidad_remitente_caja: z
    .string({ message: 'La entidad remitente es requerida' })
    .min(1, 'La entidad remitente es requerida'),
  acta_trans_caja: z
    .string({ message: 'El acta de transferencia es requerida' })
    .min(1, 'El acta de transferencia es requerida'),
  fecha_trans_caja: optionalDate,
  id_modulo_caja: z.coerce
    .number({ message: 'id_modulo_caja debe ser un número' })
    .int('id_modulo_caja debe ser un número entero')
    .positive('id_modulo_caja debe ser un número entero positivo'),
  entidad_productora_caja: z
    .string({ message: 'La entidad productora es requerida' })
    .min(1, 'La entidad productora es requerida'),
  unidad_administrativa_caja: z
    .string({ message: 'La unidad administrativa es requerida' })
    .min(1, 'La unidad administrativa es requerida'),
  oficina_productora_caja: z
    .string({ message: 'La oficina productora es requerida' })
    .min(1, 'La oficina productora es requerida'),
  objeto_caja: z.string({ message: 'El objeto es requerido' }).min(1, 'El objeto es requerido'),
  estado_caja: z.enum(['EN PROCESO', 'FINALIZADO'], { message: 'Estado de caja inválido' }),
  upd_inicio: z.string().regex(updRegex, 'El UPD debe tener formato UPDXXXXXXX').optional(),
});

export const updateModuloCajaSchema = createModuloCajaSchema.omit({ id_modulo_caja: true });