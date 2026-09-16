import type { RequestHandler } from 'express';
import { tieneAlgunRol, tieneRol } from '../utils/roles.js';

/*
 * Los guardias miran los dos perfiles de la cuenta, no solo el principal. Una
 * cuenta de líder con el segundo perfil de administrador pasa por `isAdmin`
 * igual que una de administrador a secas: el segundo perfil suma permisos.
 */

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'No autenticado' });
};

export const isAdmin: RequestHandler = (req, res, next) => {
  if (tieneRol(req.session.user, 'ADMIN')) {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado: se requiere rol ADMIN' });
};

export const isLiderOrAdmin: RequestHandler = (req, res, next) => {
  if (tieneAlgunRol(req.session.user, ['LIDER', 'ADMIN'])) {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado: no tienes permiso para realizar esta acción' });
};

export const isTecnica: RequestHandler = (req, res, next) => {
  if (tieneAlgunRol(req.session.user, ['TECNICA', 'LIDER', 'ADMIN'])) {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado' });
};

export const isTecnicaOnly: RequestHandler = (req, res, next) => {
  if (tieneRol(req.session.user, 'TECNICA')) {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado: solo el rol TECNICA puede realizar esta acción' });
};
