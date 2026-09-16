import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { rolesDe, tieneAlgunRol, tieneRol } from '../roles.js';
import { isAdmin, isLiderOrAdmin, isTecnicaOnly } from '../../middlewares/auth.js';

/**
 * Cuentas con dos perfiles.
 *
 * Una cuenta lleva un perfil principal y, opcionalmente, un segundo. La regla es
 * que el segundo **solo suma permisos**: nunca quita ninguno. El caso que lo
 * motivó es el administrador que además lleva clientes, que antes necesitaba dos
 * cuentas con dos contraseñas.
 *
 * Lo que se comprueba aquí es lo que dejaría el sistema abierto o inservible sin
 * que nadie lo note: que el segundo perfil abra puertas de verdad, que no las
 * cierre, y que una cuenta de un solo perfil siga comportándose exactamente como
 * antes de que existiera esta idea.
 */

const ADMIN_Y_LIDER = { rol: 'LIDER', rol_secundario: 'ADMIN' };
const SOLO_LIDER = { rol: 'LIDER', rol_secundario: null };
const SOLO_ADMIN = { rol: 'ADMIN' };

describe('saber qué perfiles tiene una cuenta', () => {
  it('reconoce el perfil principal', () => {
    expect(tieneRol(SOLO_LIDER, 'LIDER')).toBe(true);
  });

  it('reconoce el segundo perfil', () => {
    expect(tieneRol(ADMIN_Y_LIDER, 'ADMIN')).toBe(true);
  });

  it('no inventa perfiles que la cuenta no tiene', () => {
    expect(tieneRol(ADMIN_Y_LIDER, 'TECNICA')).toBe(false);
    expect(tieneRol(SOLO_LIDER, 'ADMIN')).toBe(false);
  });

  it('sin cuenta no hay ningún perfil', () => {
    expect(tieneRol(null, 'ADMIN')).toBe(false);
    expect(tieneRol(undefined, 'LIDER')).toBe(false);
    expect(tieneAlgunRol(null, ['ADMIN', 'LIDER'])).toBe(false);
  });

  it('basta con tener uno de los perfiles pedidos', () => {
    expect(tieneAlgunRol(ADMIN_Y_LIDER, ['TECNICA', 'ADMIN'])).toBe(true);
    expect(tieneAlgunRol(SOLO_LIDER, ['TECNICA', 'ADMIN'])).toBe(false);
  });

  it('los perfiles se listan con el principal primero', () => {
    expect(rolesDe(ADMIN_Y_LIDER)).toEqual(['LIDER', 'ADMIN']);
    expect(rolesDe(SOLO_ADMIN)).toEqual(['ADMIN']);
  });

  it('un segundo perfil repetido no se lista dos veces', () => {
    // La base lo impide con una restricción, pero si una fila vieja llegara así
    // la pantalla no debe mostrar la misma chapa dos veces.
    expect(rolesDe({ rol: 'ADMIN', rol_secundario: 'ADMIN' })).toEqual(['ADMIN']);
  });

  it('un segundo perfil vacío es no tener segundo perfil', () => {
    expect(rolesDe({ rol: 'LIDER', rol_secundario: null })).toEqual(['LIDER']);
    expect(rolesDe({ rol: 'LIDER' })).toEqual(['LIDER']);
  });
});

/** Ejecuta un guardia con la sesión indicada. */
function pasa(
  guardia: (req: Request, res: Response, next: NextFunction) => void,
  user: Record<string, unknown> | null,
): boolean {
  const req = { session: user ? { user } : {} } as unknown as Request;
  let paso = false;
  const res = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  guardia(req, res, () => {
    paso = true;
  });
  return paso;
}

describe('los guardias miran los dos perfiles', () => {
  it('un líder que además administra entra en la administración', () => {
    expect(pasa(isAdmin, ADMIN_Y_LIDER)).toBe(true);
  });

  it('un líder a secas sigue sin entrar en la administración', () => {
    expect(pasa(isAdmin, SOLO_LIDER)).toBe(false);
  });

  it('el segundo perfil no quita lo que daba el principal', () => {
    expect(pasa(isLiderOrAdmin, ADMIN_Y_LIDER)).toBe(true);
  });

  it('un administrador con segundo perfil de técnica puede lo de la técnica', () => {
    expect(pasa(isTecnicaOnly, { rol: 'ADMIN', rol_secundario: 'TECNICA' })).toBe(true);
  });

  it('un administrador a secas sigue sin poder lo que es solo de la técnica', () => {
    expect(pasa(isTecnicaOnly, SOLO_ADMIN)).toBe(false);
  });

  it('una cuenta de un solo perfil se comporta igual que antes', () => {
    expect(pasa(isAdmin, SOLO_ADMIN)).toBe(true);
    expect(pasa(isLiderOrAdmin, SOLO_LIDER)).toBe(true);
    expect(pasa(isLiderOrAdmin, { rol: 'TECNICA' })).toBe(false);
    expect(pasa(isTecnicaOnly, { rol: 'TECNICA' })).toBe(true);
  });

  it('sin sesión no pasa ninguno', () => {
    expect(pasa(isAdmin, null)).toBe(false);
    expect(pasa(isLiderOrAdmin, null)).toBe(false);
    expect(pasa(isTecnicaOnly, null)).toBe(false);
  });

  it('un perfil inventado en el segundo campo no abre nada', () => {
    expect(pasa(isAdmin, { rol: 'TECNICA', rol_secundario: 'SUPERUSUARIO' })).toBe(false);
    expect(pasa(isLiderOrAdmin, { rol: 'TECNICA', rol_secundario: 'SUPERUSUARIO' })).toBe(false);
  });
});
