import { z } from 'zod';

const positiveInt = z.coerce
  .number({ message: 'Debe ser un número entero positivo' })
  .int('Debe ser un número entero')
  .positive('Debe ser un número entero positivo');
const usuariosArray = z.array(positiveInt).min(1, 'Se requiere al menos un usuario');

export const asignarUsuariosSchema = z.object({
  modulo_id: positiveInt,
  usuarios: usuariosArray,
});

export const usuariosOnlySchema = z.object({
  usuarios: usuariosArray,
});
