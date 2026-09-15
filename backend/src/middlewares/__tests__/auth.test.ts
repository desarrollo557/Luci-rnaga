import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { isAdmin, isAuthenticated, isLiderOrAdmin, isTecnica, isTecnicaOnly } from '../auth.js';

/**
 * Los cinco guardias que deciden qué puede hacer cada perfil.
 *
 * Se prueban aquí, sin base de datos ni servidor, porque son la única capa que
 * separa a un digitador de la administración de usuarios: si uno de ellos deja
 * pasar un rol de más, ningún controlador lo vuelve a comprobar. Cada guardia
 * se ejerce con los cuatro roles y sin sesión, y se afirma tanto a quién deja
 * pasar como a quién no.
 *
 * La matriz completa de endpoints por rol se comprueba contra la API real en
 * `backend/scripts/pruebas/roles.ts`; esto es el nivel de abajo.
 */

type Rol = 'ADMIN' | 'LIDER' | 'TECNICA' | 'CALIDAD';
const ROLES: Rol[] = ['ADMIN', 'LIDER', 'TECNICA', 'CALIDAD'];

interface Resultado {
  paso: boolean;
  estado?: number;
  cuerpo?: { error?: string };
}

/** Ejecuta un guardia con la sesión indicada (`null` = sin iniciar sesión). */
function ejecutar(
  guardia: (req: Request, res: Response, next: NextFunction) => void,
  rol: Rol | null,
): Resultado {
  const req = { session: rol ? { user: { rol } } : {} } as unknown as Request;
  const resultado: Resultado = { paso: false };
  const res = {
    status(codigo: number) {
      resultado.estado = codigo;
      return this;
    },
    json(cuerpo: { error?: string }) {
      resultado.cuerpo = cuerpo;
      return this;
    },
  } as unknown as Response;
  guardia(req, res, () => {
    resultado.paso = true;
  });
  return resultado;
}

/** Roles que el guardia deja pasar, en orden fijo para poder compararlos. */
function quienesPasan(guardia: Parameters<typeof ejecutar>[0]): Rol[] {
  return ROLES.filter((rol) => ejecutar(guardia, rol).paso);
}

describe('sin iniciar sesión no se pasa de la puerta', () => {
  it('isAuthenticated responde 401 y no llama al siguiente', () => {
    const resultado = ejecutar(isAuthenticated, null);
    expect(resultado.paso).toBe(false);
    expect(resultado.estado).toBe(401);
    expect(resultado.cuerpo?.error).toBe('No autenticado');
  });

  it('ningún guardia de rol deja pasar a un anónimo', () => {
    for (const guardia of [isAdmin, isLiderOrAdmin, isTecnica, isTecnicaOnly]) {
      expect(ejecutar(guardia, null).paso).toBe(false);
    }
  });
});

describe('qué rol deja pasar cada guardia', () => {
  it('isAuthenticated: los cuatro perfiles', () => {
    expect(quienesPasan(isAuthenticated)).toEqual(['ADMIN', 'LIDER', 'TECNICA', 'CALIDAD']);
  });

  it('isAdmin: solo la administración', () => {
    expect(quienesPasan(isAdmin)).toEqual(['ADMIN']);
  });

  it('isLiderOrAdmin: el líder y la administración', () => {
    expect(quienesPasan(isLiderOrAdmin)).toEqual(['ADMIN', 'LIDER']);
  });

  it('isTecnicaOnly: solo técnica', () => {
    // Cambiar el estado de una caja y fijar su UPD de inicio son acciones de
    // quien tiene la caja delante; el líder las ve, pero no las ejecuta.
    expect(quienesPasan(isTecnicaOnly)).toEqual(['TECNICA']);
  });

  it('isTecnica: los cuatro, pese al nombre', () => {
    expect(quienesPasan(isTecnica)).toEqual(['ADMIN', 'LIDER', 'TECNICA', 'CALIDAD']);
  });
});

describe('el motivo del rechazo se nombra', () => {
  it('isAdmin dice que se requiere ADMIN', () => {
    const resultado = ejecutar(isAdmin, 'LIDER');
    expect(resultado.estado).toBe(403);
    expect(resultado.cuerpo?.error).toContain('ADMIN');
  });

  it('isTecnicaOnly dice que la acción es de técnica', () => {
    const resultado = ejecutar(isTecnicaOnly, 'CALIDAD');
    expect(resultado.estado).toBe(403);
    expect(resultado.cuerpo?.error).toContain('TECNICA');
  });

  it('isLiderOrAdmin rechaza a técnica y a calidad con 403', () => {
    for (const rol of ['TECNICA', 'CALIDAD'] as const) {
      expect(ejecutar(isLiderOrAdmin, rol).estado).toBe(403);
    }
  });
});

describe('un rol desconocido no se cuela', () => {
  it('ningún guardia de rol acepta un valor fuera de la lista', () => {
    const invitado = 'INVITADO' as unknown as Rol;
    for (const guardia of [isAdmin, isLiderOrAdmin, isTecnicaOnly]) {
      expect(ejecutar(guardia, invitado).paso).toBe(false);
    }
  });
});
