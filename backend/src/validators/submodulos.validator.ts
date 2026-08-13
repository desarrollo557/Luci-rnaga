import { z } from 'zod';

export const createSubModuloSchema = z.object({
  codigo: z.string({ message: 'El código es requerido' }).min(1, 'El código es requerido'),
  entidad_remitente: z
    .string({ message: 'La entidad remitente es requerida' })
    .min(1, 'La entidad remitente es requerida'),
  sede_submodulos: z.string().optional(),
});

export const updateSubModuloSchema = createSubModuloSchema;