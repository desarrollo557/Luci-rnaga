import { z } from 'zod';
import { fechaDocumental, textoNoDiligenciado } from './common.validator.js';

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
  fecha_trans_caja: fechaDocumental('La fecha de transferencia'),
  id_modulo_caja: z.coerce
    .number({ message: 'id_modulo_caja debe ser un número' })
    .int('id_modulo_caja debe ser un número entero')
    .positive('id_modulo_caja debe ser un número entero positivo'),
  // Los cuatro campos descriptivos de la caja admiten NULL en MySQL y no
  // siempre se conocen al crearla: se pueden dejar en blanco y se guardan como
  // N/A. Los de arriba (número de caja, entidad remitente, acta y fecha) son
  // NOT NULL en la tabla y además identifican la caja, así que siguen siendo
  // obligatorios.
  entidad_productora_caja: textoNoDiligenciado('La entidad productora'),
  unidad_administrativa_caja: textoNoDiligenciado('La unidad administrativa'),
  oficina_productora_caja: textoNoDiligenciado('La oficina productora'),
  objeto_caja: textoNoDiligenciado('El objeto'),
  estado_caja: z.enum(['EN PROCESO', 'FINALIZADO'], { message: 'Estado de caja inválido' }),
  upd_inicio: z.string().regex(updRegex, 'El UPD debe tener formato UPDXXXXXXX').optional(),
});

export const updateModuloCajaSchema = createModuloCajaSchema.omit({ id_modulo_caja: true });