import { z } from 'zod';

const positiveInt = z.coerce
  .number({ message: 'Debe ser un número entero positivo' })
  .int('Debe ser un número entero')
  .positive('Debe ser un número entero positivo');
const usuariosArray = z.array(positiveInt).min(1, 'Se requiere al menos un usuario');
const cajaCodigo = z
  .string()
  .regex(/^\d{3}C\d{6}$/, 'Formato de caja inválido (000C000000)');

export const asignarUsuariosSchema = z.object({
  modulo_id: positiveInt,
  usuarios: usuariosArray,
});

export const asignarRangoSchema = z.object({
  modulo_id: positiveInt,
  usuarios: usuariosArray,
  rango_inicio: cajaCodigo,
  rango_fin: cajaCodigo,
});

export const usuariosOnlySchema = z.object({
  usuarios: usuariosArray,
});