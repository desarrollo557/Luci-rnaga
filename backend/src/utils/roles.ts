import type { Rol } from '../types/db.js';

/**
 * Perfiles de una cuenta.
 *
 * Una cuenta lleva un perfil principal y, opcionalmente, un segundo. El
 * principal decide dónde aterriza la persona al entrar y es el que leen las
 * consultas que buscan gente por su oficio, como la que lista técnicas para
 * asignarlas a una caja. El segundo **solo suma permisos**: nunca quita ninguno.
 *
 * El caso que lo motivó es el administrador que además lleva clientes: antes
 * hacían falta dos cuentas para la misma persona, con dos contraseñas y dos
 * sesiones, y había que salir de una para entrar en la otra.
 */
export interface ConPerfiles {
  rol: string;
  rol_secundario?: string | null;
}

/** Si la cuenta tiene ese perfil, sea el principal o el segundo. */
export function tieneRol(usuario: ConPerfiles | null | undefined, rol: Rol): boolean {
  if (!usuario) return false;
  return usuario.rol === rol || usuario.rol_secundario === rol;
}

/** Si la cuenta tiene alguno de esos perfiles. */
export function tieneAlgunRol(usuario: ConPerfiles | null | undefined, roles: readonly Rol[]): boolean {
  return roles.some((rol) => tieneRol(usuario, rol));
}

/** Los perfiles de la cuenta, el principal primero y sin repetir. */
export function rolesDe(usuario: ConPerfiles | null | undefined): string[] {
  if (!usuario) return [];
  const segundo = usuario.rol_secundario;
  return segundo && segundo !== usuario.rol ? [usuario.rol, segundo] : [usuario.rol];
}
