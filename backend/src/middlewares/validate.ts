import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/** Valida req.body con un schema zod y reemplaza el body por los datos parseados. */
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      res.status(400).json({ error: 'Datos inválidos', details });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Valida req.params con un schema zod. */
export function validateParams(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      res.status(400).json({ error: 'Parámetros inválidos', details });
      return;
    }
    Object.assign(req.params, result.data);
    next();
  };
}