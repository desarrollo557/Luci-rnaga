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

describe('un texto más largo que su columna no es un 500 genérico', () => {
  it('responde 400 con el campo cuando el error nombra la columna', () => {
    // PostgreSQL usa el SQLSTATE 22001 (string_data_right_truncation), que
    // sustituye al 1406 de MySQL.
    const { codigo, cuerpo } = manejar({
      code: '22001',
      detail: "Data too long for column 'asunto'",
      message: 'value too long for type character varying(255)',
    });
    expect(codigo).toBe(400);
    expect(cuerpo).toEqual({
      error: 'Datos inválidos',
      details: [
        { field: 'asunto', message: 'El asunto supera el máximo de 255 caracteres. Acórtelo e intente de nuevo.' },
      ],
    });
  });

  it('responde 400 genérico cuando el error no dice qué columna es', () => {
    // Es el caso normal en PostgreSQL: el mensaje solo nombra el tipo. Los
    // validadores zod acotan cada campo antes, así que esto es el último
    // recurso y basta con que el usuario sepa que algo se pasó de largo.
    const { codigo, cuerpo } = manejar({
      code: '22001',
      message: 'value too long for type character varying(255)',
    });
    expect(codigo).toBe(400);
    expect(cuerpo).toEqual({
      error: 'Datos inválidos',
      details: [
        { field: '', message: 'Uno de los campos supera la longitud máxima permitida. Acórtelo e intente de nuevo.' },
      ],
    });
  });
});

describe('el resto de errores de la base', () => {
  it('un duplicado responde 409', () => {
    const { codigo, cuerpo } = manejar({
      code: '23505',
      detail: 'Key (upd)=(UPD2950163) already exists.',
    });
    expect(codigo).toBe(409);
    expect(cuerpo).toEqual({ error: 'Registro duplicado. Ya existe un elemento con esos datos.' });
  });

  it('una referencia que no existe responde 409', () => {
    const { codigo, cuerpo } = manejar({
      code: '23503',
      detail: 'Key (id_submodulo)=(99) is not present in table "sub_modulos".',
    });
    expect(codigo).toBe(409);
    expect(cuerpo).toEqual({
      error: 'La referencia no existe. Verifica que el módulo cliente o el usuario seleccionado sea válido.',
    });
  });

  it('borrar un registro del que cuelgan otros responde 409 con su propio mensaje', () => {
    // En PostgreSQL los dos casos comparten código y solo el detalle los separa.
    const { codigo, cuerpo } = manejar({
      code: '23503',
      detail: 'Key (id)=(3) is still referenced from table "moduloscliente".',
    });
    expect(codigo).toBe(409);
    expect(cuerpo).toEqual({
      error: 'No se puede eliminar: el registro tiene elementos asociados. Elimina primero sus dependencias.',
    });
  });

  it('un error desconocido sigue siendo un 500', () => {
    const { codigo, cuerpo } = manejar(new Error('algo raro'));
    expect(codigo).toBe(500);
    expect(cuerpo).toEqual({ error: 'Error interno del servidor' });
  });
});
