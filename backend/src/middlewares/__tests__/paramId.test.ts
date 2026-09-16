import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { idNumerico } from '../paramId.js';

/**
 * El filtro de los identificadores de ruta.
 *
 * Está puesto en `router.param('id', ...)` de casi todas las rutas. Sin él, un
 * id como "undefined" —que es lo que manda el navegador cuando el dato aún no
 * ha cargado— viajaba hasta la base y volvía como un 500 genérico, sin decir
 * que el problema era el enlace y no el servidor.
 */

interface Resultado {
  paso: boolean;
  estado?: number;
  cuerpo?: { error?: string };
}

function validar(valor: unknown): Resultado {
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
  idNumerico({} as Request, res, (() => {
    resultado.paso = true;
  }) as NextFunction, valor as string, 'id');
  return resultado;
}

describe('deja pasar un identificador de verdad', () => {
  it('un número entero', () => {
    expect(validar('22').paso).toBe(true);
    expect(validar('1').paso).toBe(true);
  });

  it('también con ceros delante', () => {
    expect(validar('007').paso).toBe(true);
  });
});

describe('detiene lo que rompería la consulta', () => {
  it('la cadena "undefined", que es lo que manda el navegador sin dato', () => {
    const resultado = validar('undefined');
    expect(resultado.paso).toBe(false);
    expect(resultado.estado).toBe(400);
    expect(resultado.cuerpo?.error).toBe('Identificador inválido');
  });

  it('texto, vacío y valores ausentes', () => {
    for (const valor of ['abc', '', null, undefined, 'null']) {
      expect(validar(valor).estado, JSON.stringify(valor)).toBe(400);
    }
  });

  it('negativos y decimales', () => {
    expect(validar('-1').estado).toBe(400);
    expect(validar('1.5').estado).toBe(400);
  });

  it('un intento de inyección en el identificador', () => {
    expect(validar('1 OR 1=1').estado).toBe(400);
    expect(validar("1; DROP TABLE users").estado).toBe(400);
  });
});
