import { z } from 'zod';

export const ROLES = ['ADMIN', 'LIDER', 'TECNICA', 'CALIDAD'] as const;

const ccField = z
  .string({ message: 'La cédula es requerida' })
  .regex(/^\d{1,20}$/, 'La cédula debe contener solo números (1 a 20 dígitos)');
const nombreField = z
  .string({ message: 'El nombre es requerido' })
  .min(3, 'El nombre debe tener al menos 3 caracteres');
const contrasenaField = z
  .string({ message: 'La contraseña es requerida' })
  .min(4, 'La contraseña debe tener al menos 4 caracteres');
const rolField = z.enum(ROLES, { message: 'Rol inválido' });
const sedeField = z.string({ message: 'La sede es requerida' }).min(1, 'La sede es requerida');

export const createUserSchema = z.object({
  cc: ccField,
  nombre: nombreField,
  contrasena: contrasenaField,
  rol: rolField,
  sede: sedeField,
});

export const updateUserSchema = z.object({
  cc: ccField,
  nombre: nombreField,
  contrasena: contrasenaField.optional(),
  rol: rolField,
  sede: sedeField,
});