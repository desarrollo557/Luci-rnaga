import { z } from 'zod';
import { fechaDocumental, textoNoDiligenciado } from './common.validator.js';

export const createModuloClienteSchema = z.object({
  // El código y la entidad remitente del acta son copias descriptivas de los del
  // cliente: se pueden dejar en blanco y se guardan como N/A.
  codigo: textoNoDiligenciado('El código'),
  entidad_remitente: textoNoDiligenciado('La entidad remitente'),
  // El número de acta sí se exige: es como se distingue un acta de otra dentro
  // del mismo cliente, en la lista y al elegirla para crear cajas.
  acta_transferencia_modulo: z
    .string({ message: 'El acta de transferencia es requerida' })
    .min(1, 'El acta de transferencia es requerida'),
  fecha_trans_modulo: fechaDocumental('La fecha de transferencia'),
  id_submodulo: z.coerce
    .number({ message: 'id_submodulo debe ser un número' })
    .int('id_submodulo debe ser un número entero')
    .positive('id_submodulo debe ser un número entero positivo'),
});

export const updateModuloClienteSchema = createModuloClienteSchema;