import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SessionUser } from '../types/index.js';

/** Envuelve un handler async para que los errores vayan al errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Lee el usuario de sesión o responde 401. */
export function getSessionUser(req: Request): SessionUser | null {
  return req.session.user ?? null;
}
