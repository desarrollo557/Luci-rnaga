import { z } from 'zod';

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .nullable()
  .optional();

export const createModuloClienteSchema = z.object({
  codigo: z.string({ message: 'El código es requerido' }).min(1, 'El código es requerido'),
  entidad_remitente: z
    .string({ message: 'La entidad remitente es requerida' })
    .min(1, 'La entidad remitente es requerida'),
  acta_transferencia_modulo: z
    .string({ message: 'El acta de transferencia es requerida' })
    .min(1, 'El acta de transferencia es requerida'),
  fecha_trans_modulo: optionalDate,
  id_submodulo: z.coerce
    .number({ message: 'id_submodulo debe ser un número' })
    .int('id_submodulo debe ser un número entero')
    .positive('id_submodulo debe ser un número entero positivo'),
});

export const updateModuloClienteSchema = createModuloClienteSchema;