import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

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

/** Detecta errores MySQL de violación de llave foránea (referencia inexistente). */
function isForeignKeyError(err: unknown): err is { code: string; sqlMessage?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'ER_NO_REFERENCED_ROW_2'
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

  if (isForeignKeyError(err)) {
    console.error('Violación de llave foránea:', err.sqlMessage ?? err);
    res.status(409).json({
      error:
        'La referencia no existe. Verifica que el módulo cliente o el usuario seleccionado sea válido.',
    });
    return;
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
