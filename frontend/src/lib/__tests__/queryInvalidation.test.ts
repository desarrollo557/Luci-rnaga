import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateDomain } from '../queryInvalidation';
import { INTERVALO_REFRESCO_MS, intervaloRefresco } from '../refresco';

/**
 * Qué se marca como viejo cuando cambia cada cosa.
 *
 * Es el fallo más silencioso de la aplicación: olvidar una dependencia no rompe
 * nada visible, simplemente deja una pantalla mostrando datos de hace un rato y
 * nadie entiende por qué. Ocurrió de verdad: guardar un registro FUID no
 * invalidaba el inventario, así que había que recargar la página entera para ver
 * el efecto de lo que se acababa de digitar.
 */

/** Recoge las claves que se invalidaron en una llamada. */
function clavesInvalidadas(dominio: Parameters<typeof invalidateDomain>[1]): string[] {
  const claves: string[] = [];
  const clienteFalso = {
    invalidateQueries: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
      claves.push(String(queryKey[0]));
      return Promise.resolve();
    }),
  } as unknown as QueryClient;
  invalidateDomain(clienteFalso, dominio);
  return claves;
}

describe('un registro FUID que entra o sale mueve todo lo que lo cuenta', () => {
  it('invalida el inventario, que cuenta registros para saber si está al día', () => {
    expect(clavesInvalidadas('fuiddatosreal')).toContain('inventario');
  });

  it('invalida también la vista previa del FUID del inventario', () => {
    expect(clavesInvalidadas('fuiddatosreal')).toContain('inventario-fuid');
  });

  it('invalida el historial y la producción, que también lo cuentan', () => {
    const claves = clavesInvalidadas('fuiddatosreal');
    expect(claves).toContain('historial');
    expect(claves).toContain('produccion');
  });

  it('invalida la caja, que muestra cuántos registros lleva', () => {
    expect(clavesInvalidadas('fuiddatosreal')).toContain('modulos-caja');
  });
});

describe('cada dominio se invalida a sí mismo', () => {
  const dominios = [
    'users',
    'modulos-cliente',
    'modulos-caja',
    'fuiddatosreal',
    'inventario',
    'sub-modulos',
    'notificaciones',
  ] as const;

  for (const dominio of dominios) {
    it(`${dominio} se incluye en su propia invalidación`, () => {
      expect(clavesInvalidadas(dominio)).toContain(dominio);
    });
  }

  it('ninguno repite una clave, que sería pedir lo mismo dos veces', () => {
    for (const dominio of dominios) {
      const claves = clavesInvalidadas(dominio);
      expect(new Set(claves).size, `${dominio} repite claves`).toBe(claves.length);
    }
  });
});

describe('otros cambios que llegan al inventario', () => {
  it('crear o mover una caja lo mueve', () => {
    expect(clavesInvalidadas('modulos-caja')).toContain('inventario');
  });

  it('crear o editar un acta lo mueve', () => {
    expect(clavesInvalidadas('modulos-cliente')).toContain('inventario');
  });

  it('editar un cliente lo mueve: su nombre y sus actas salen ahí', () => {
    expect(clavesInvalidadas('sub-modulos')).toContain('inventario');
  });
});

describe('la reapertura de cajas por solicitud', () => {
  it('reabrir o terminar una caja mueve sus solicitudes de reapertura', () => {
    expect(clavesInvalidadas('modulos-caja')).toContain('solicitudes-reapertura');
  });

  it('un aviso nuevo mueve la campana y las solicitudes pendientes', () => {
    const claves = clavesInvalidadas('notificaciones');
    expect(claves).toContain('notificaciones');
    expect(claves).toContain('solicitudes-reapertura');
  });
});

describe('refresco periódico', () => {
  it('activo devuelve el intervalo', () => {
    expect(intervaloRefresco()).toBe(INTERVALO_REFRESCO_MS);
    expect(intervaloRefresco(true)).toBe(INTERVALO_REFRESCO_MS);
  });

  it('apagado devuelve undefined, que es lo que deja la consulta quieta', () => {
    expect(intervaloRefresco(false)).toBeUndefined();
  });

  it('el intervalo es lo bastante corto para notarse y lo bastante largo para no molestar', () => {
    expect(INTERVALO_REFRESCO_MS).toBeGreaterThanOrEqual(5_000);
    expect(INTERVALO_REFRESCO_MS).toBeLessThanOrEqual(60_000);
  });
});
