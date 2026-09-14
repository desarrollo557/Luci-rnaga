import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ETIQUETA_CAMPO_FUID, LONGITUD_MAXIMA_FUID } from '../config/constants.js';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** Middleware de ruta no encontrada. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

/** Detecta errores MySQL de entrada duplicada (PK/índice único). */
function isDuplicateEntryError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ER_DUP_ENTRY';
}

/**
 * Detecta el error 1406 de MySQL: un texto más largo que su columna.
 *
 * Los validadores zod ya acotan cada campo con `LONGITUD_MAXIMA_FUID`, así que
 * esto solo se dispara en rutas todavía sin schema. Sin este caso, el error caía
 * en el 500 genérico y el usuario no tenía forma de saber qué campo recortar.
 */
function isDataTooLongError(err: unknown): err is { code: string; sqlMessage?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    ((err as { code?: unknown }).code === 'ER_DATA_TOO_LONG' ||
      (err as { errno?: unknown }).errno === 1406)
  );
}

/** Extrae el nombre de la columna del mensaje "Data too long for column 'asunto' at row 1". */
function columnaDelMensaje(sqlMessage: string | undefined): string | null {
  const encontrado = /column '([^']+)'/i.exec(sqlMessage ?? '');
  return encontrado?.[1] ?? null;
}

/** Detecta errores MySQL de violación de llave foránea (referencia inexistente). */
function isForeignKeyError(err: unknown): err is { code: string; sqlMessage?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'ER_NO_REFERENCED_ROW_2'
  );
}

/** Detecta errores MySQL de registro padre referenciado (no se puede borrar un padre con hijos). */
function isRowReferencedError(err: unknown): err is { code: string; sqlMessage?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'ER_ROW_IS_REFERENCED_2'
  );
}

/** Middleware de errores central. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    res.status(400).json({ error: 'Datos inválidos', details });
    return;
  }

  if (isDuplicateEntryError(err)) {
    res.status(409).json({ error: 'Registro duplicado. Ya existe un elemento con esos datos.' });
    return;
  }

  if (isDataTooLongError(err)) {
    console.error('Texto más largo que la columna:', err.sqlMessage ?? err);
    const columna = columnaDelMensaje(err.sqlMessage);
    const etiqueta = columna ? ETIQUETA_CAMPO_FUID[columna as keyof typeof ETIQUETA_CAMPO_FUID] : undefined;
    const message = etiqueta
      ? `${etiqueta} supera el máximo de ${LONGITUD_MAXIMA_FUID[columna as keyof typeof LONGITUD_MAXIMA_FUID]} caracteres. Acórtelo e intente de nuevo.`
      : 'Uno de los campos supera la longitud máxima permitida. Acórtelo e intente de nuevo.';
    res.status(400).json({
      error: 'Datos inválidos',
      details: [{ field: columna ?? '', message }],
    });
    return;
  }

  if (isForeignKeyError(err)) {
    console.error('Violación de llave foránea:', err.sqlMessage ?? err);
    res.status(409).json({
      error:
        'La referencia no existe. Verifica que el módulo cliente o el usuario seleccionado sea válido.',
    });
    return;
  }

  if (isRowReferencedError(err)) {
    console.error('Registro referenciado:', err.sqlMessage ?? err);
    res.status(409).json({
      error:
        'No se puede eliminar: el registro tiene elementos asociados. Elimina primero sus dependencias.',
    });
    return;
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
