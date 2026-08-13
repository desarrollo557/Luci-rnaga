import type { RequestHandler } from 'express';

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'No autenticado' });
};

export const isAdmin: RequestHandler = (req, res, next) => {
  if (req.session.user?.rol === 'ADMIN') {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado: se requiere rol ADMIN' });
};

export const isLiderOrAdmin: RequestHandler = (req, res, next) => {
  const rol = req.session.user?.rol;
  if (rol === 'LIDER' || rol === 'ADMIN') {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado: no tienes permiso para realizar esta acción' });
};

export const isTecnica: RequestHandler = (req, res, next) => {
  const rol = req.session.user?.rol;
  if (rol === 'TECNICA' || rol === 'LIDER' || rol === 'ADMIN' || rol === 'CALIDAD') {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado' });
};

export const isTecnicaOnly: RequestHandler = (req, res, next) => {
  if (req.session.user?.rol === 'TECNICA') {
    return next();
  }
  res.status(403).json({ error: 'Acceso denegado: solo el rol TECNICA puede realizar esta acción' });
};
