import { z } from 'zod';

export const loginSchema = z.object({
  cc: z
    .string({ message: 'La cédula es requerida' })
    .min(1, 'La cédula es requerida')
    .regex(/^\d+$/, 'La cédula debe contener solo números'),
  contrasena: z.string({ message: 'La contraseña es requerida' }).min(1, 'La contraseña es requerida'),
  rol: z.enum(['ADMIN', 'LIDER', 'TECNICA', 'CALIDAD'], { message: 'Rol inválido' }),
  sede: z
    .string({ message: 'La sede es requerida' })
    .min(1, 'La sede es requerida')
    .refine((s) => ['Barranquilla', 'Santa Marta', 'Bogotá'].includes(s), {
      message: 'Sede inválida',
    }),
});