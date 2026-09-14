import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { cuerpoEnMayusculas } from '../mayusculas.js';

/** Pasa un cuerpo por el middleware y devuelve el resultado. */
function normalizar(body: unknown): unknown {
  const req = { body } as Request;
  let siguienteLlamado = false;
  cuerpoEnMayusculas(req, {} as Response, () => {
    siguienteLlamado = true;
  });
  expect(siguienteLlamado).toBe(true);
  return req.body;
}

describe('punto 6 — trim y colapso de espacios', () => {
  it('recorta los extremos, colapsa los espacios internos y pasa a mayúsculas', () => {
    expect(normalizar({ serie: '  OFICIO   VARIOS  ' })).toEqual({ serie: 'OFICIO VARIOS' });
  });

  it('deja intacto un valor que ya estaba limpio', () => {
    expect(normalizar({ serie: 'OFICIO VARIOS' })).toEqual({ serie: 'OFICIO VARIOS' });
  });

  it('convierte a mayúsculas', () => {
    expect(normalizar({ entidad_remitente: 'fondeargos' })).toEqual({
      entidad_remitente: 'FONDEARGOS',
    });
  });

  it('hace que dos formas del mismo valor dejen de ser distintas', () => {
    // Este es el caso que ensuciaba el autocompletado y las agrupaciones.
    expect(normalizar({ serie: 'OFICIO ' })).toEqual(normalizar({ serie: 'OFICIO' }));
  });

  it('no toca las contraseñas', () => {
    const cuerpo = {
      contrasena: '  Mi Clave  ',
      password: ' otra ',
      contrasena_actual: ' vieja ',
      nueva_contrasena: ' nueva ',
      cc: ' 123 ',
    };
    expect(normalizar(cuerpo)).toEqual({
      contrasena: '  Mi Clave  ',
      password: ' otra ',
      contrasena_actual: ' vieja ',
      nueva_contrasena: ' nueva ',
      cc: '123',
    });
  });

  it('entra en objetos anidados y en arreglos', () => {
    expect(normalizar({ dato: { asunto: 'a   b' }, lista: ['  x  ', ' y y '] })).toEqual({
      dato: { asunto: 'A B' },
      lista: ['X', 'Y Y'],
    });
  });

  it('deja como están los valores que no son texto', () => {
    expect(normalizar({ nulo: null, numero: 42, booleano: true })).toEqual({
      nulo: null,
      numero: 42,
      booleano: true,
    });
  });

  it('no falla con un cuerpo vacío', () => {
    expect(normalizar({})).toEqual({});
  });
});
