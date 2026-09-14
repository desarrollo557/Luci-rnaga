import type { RequestParamHandler } from 'express';

/**
 * Valida que un parámetro de ruta sea un entero positivo. Sin esto, un id como
 * "undefined" o "abc" llegaba a MySQL y terminaba en un 500 genérico.
 */
export const idNumerico: RequestParamHandler = (_req, res, next, valor) => {
  if (!/^\d+$/.test(String(valor))) {
    res.status(400).json({ error: 'Identificador inválido' });
    return;
  }
  next();
};
