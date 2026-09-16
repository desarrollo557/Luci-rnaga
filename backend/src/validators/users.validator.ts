import { z } from 'zod';

export const ROLES = ['ADMIN', 'LIDER', 'TECNICA'] as const;

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

/**
 * Segundo perfil, opcional.
 *
 * Una cadena vacía cuenta como "sin segundo perfil": es lo que manda el
 * formulario cuando el selector está en blanco, y rechazarla obligaría a la
 * pantalla a distinguir entre no enviar el campo y enviarlo vacío.
 */
const rolSecundarioField = z
  .union([z.enum(ROLES), z.literal(''), z.null()])
  .optional()
  .transform((valor) => (valor === '' || valor === undefined ? null : valor));

/** Los dos perfiles de una cuenta tienen que ser distintos. */
function perfilesDistintos(
  datos: { rol?: string; rol_secundario?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (datos.rol_secundario && datos.rol_secundario === datos.rol) {
    ctx.addIssue({
      code: 'custom',
      path: ['rol_secundario'],
      message: 'El segundo perfil tiene que ser distinto del principal',
    });
  }
}
const sedeField = z.string({ message: 'La sede es requerida' }).min(1, 'La sede es requerida');

export const createUserSchema = z
  .object({
    cc: ccField,
    nombre: nombreField,
    contrasena: contrasenaField,
    rol: rolField,
    rol_secundario: rolSecundarioField,
    sede: sedeField,
  })
  .superRefine(perfilesDistintos);

export const updateUserSchema = z
  .object({
    cc: ccField,
    nombre: nombreField,
    contrasena: contrasenaField.optional(),
    rol: rolField,
    rol_secundario: rolSecundarioField,
    sede: sedeField,
  })
  .superRefine(perfilesDistintos);