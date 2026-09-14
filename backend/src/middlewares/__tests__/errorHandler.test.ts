import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../errorHandler.js';

interface Respuesta {
  codigo: number;
  cuerpo: unknown;
}

/** Pasa un error por el manejador y captura lo que responde. */
function manejar(err: unknown): Respuesta {
  const capturado: Respuesta = { codigo: 0, cuerpo: null };
  const res = {
    status(codigo: number) {
      capturado.codigo = codigo;
      return {
        json: (cuerpo: unknown) => {
          capturado.cuerpo = cuerpo;
        },
      };
    },
  } as unknown as Response;
  errorHandler(err, {} as Request, res, () => undefined);
  return capturado;
}

describe('punto 9 — el error 1406 de MySQL deja de ser un 500 genérico', () => {
  it('responde 400 y nombra la columna que hay que recortar', () => {
    const { codigo, cuerpo } = manejar({
      code: 'ER_DATA_TOO_LONG',
      errno: 1406,
      sqlMessage: "Data too long for column 'asunto' at row 1",
    });
    expect(codigo).toBe(400);
    expect(cuerpo).toEqual({
      error: 'Datos inválidos',
      details: [
        { field: 'asunto', message: 'El asunto supera el máximo de 255 caracteres. Acórtelo e intente de nuevo.' },
      ],
    });
  });

  it('responde 400 aunque la columna no esté en el mapa', () => {
    const { codigo, cuerpo } = manejar({
      code: 'ER_DATA_TOO_LONG',
      errno: 1406,
      sqlMessage: "Data too long for column 'otra_tabla_columna' at row 1",
    });
    expect(codigo).toBe(400);
    expect(cuerpo).toMatchObject({ error: 'Datos inválidos' });
  });

  it('lo reconoce por el número de error aunque falte el código', () => {
    expect(manejar({ errno: 1406, sqlMessage: 'Data too long' }).codigo).toBe(400);
  });
});

describe('otros errores de MySQL siguen tratándose igual', () => {
  it('un duplicado responde 409', () => {
    expect(manejar({ code: 'ER_DUP_ENTRY' }).codigo).toBe(409);
  });

  it('una llave foránea inexistente responde 409', () => {
    expect(manejar({ code: 'ER_NO_REFERENCED_ROW_2' }).codigo).toBe(409);
  });

  it('un error desconocido sigue siendo 500', () => {
    expect(manejar(new Error('algo se rompió')).codigo).toBe(500);
  });
});
