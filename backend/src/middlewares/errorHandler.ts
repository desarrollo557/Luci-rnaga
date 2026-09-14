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

/**
 * Errores de la base traducidos a respuestas con sentido.
 *
 * PostgreSQL identifica cada fallo con un código SQLSTATE, que sustituye a los
 * números de MySQL con los que nació el software (1062, 1406, 1452, 1451). Los
 * cuatro casos que llegan al usuario son los mismos.
 */
const SQLSTATE = {
  /** unique_violation: choca con una restricción UNIQUE (antes 1062). */
  DUPLICADO: '23505',
  /** string_data_right_truncation: el texto no cabe en la columna (antes 1406). */
  TEXTO_LARGO: '22001',
  /** foreign_key_violation: cubre los dos casos de MySQL, 1452 y 1451. */
  LLAVE_FORANEA: '23503',
} as const;

function codigoDe(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
}

/** Texto que PostgreSQL añade al error; dice cuál de los dos casos de llave foránea es. */
function detalleDe(err: unknown): string {
  const e = err as { detail?: unknown; message?: unknown };
  return `${typeof e?.detail === 'string' ? e.detail : ''} ${typeof e?.message === 'string' ? e.message : ''}`;
}

/**
 * Nombre de la columna en un error de texto demasiado largo.
 *
 * MySQL lo decía en el mensaje ("Data too long for column 'asunto'");
 * PostgreSQL solo indica el tipo, así que cuando no se puede deducir el campo
 * el aviso queda en genérico. Se conserva la lectura del formato de MySQL
 * porque el mismo manejador atiende a los errores que aún llegan de ahí.
 */
function columnaDelMensaje(sqlMessage: string | undefined): string | null {
  const encontrado = /column '([^']+)'/i.exec(sqlMessage ?? '');
  return encontrado?.[1] ?? null;
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

  if (codigoDe(err) === SQLSTATE.DUPLICADO) {
    res.status(409).json({ error: 'Registro duplicado. Ya existe un elemento con esos datos.' });
    return;
  }

  if (codigoDe(err) === SQLSTATE.TEXTO_LARGO) {
    console.error('Texto más largo que la columna:', err);
    const columna = columnaDelMensaje(detalleDe(err));
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

  if (codigoDe(err) === SQLSTATE.LLAVE_FORANEA) {
    // El mismo código cubre los dos casos opuestos, y el detalle los separa:
    // "is still referenced from" al borrar un padre con hijos, y "is not
    // present in" al apuntar a algo que no existe.
    const detalle = detalleDe(err);
    console.error('Violación de llave foránea:', detalle || err);
    if (/still referenced/i.test(detalle)) {
      res.status(409).json({
        error:
          'No se puede eliminar: el registro tiene elementos asociados. Elimina primero sus dependencias.',
      });
      return;
    }
    res.status(409).json({
      error:
        'La referencia no existe. Verifica que el módulo cliente o el usuario seleccionado sea válido.',
    });
    return;
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
