import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import {
  DEFAULT_CORS_ORIGIN,
  DEFAULT_FRONTEND_DIST,
  RATE_LIMIT_GENERAL,
  RATE_LIMIT_LOGIN,
  RATE_LIMIT_LOGIN_WINDOW_MS,
  RATE_LIMIT_WINDOW_MS,
  SERVICE_NAME,
  SESSION_MAX_AGE_MS,
  resolveSessionSecret,
} from './config/constants.js';

export const app = express();

// Limitador general: 1000 peticiones por IP cada 15 minutos (configurable por env).
// Se elevó desde 300 porque cada recarga de página dispara muchas consultas y
// recargar la app varias veces agotaba el cupo → 429 en toda la API.
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_GENERAL,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo más tarde.' },
});

const loginLimiter = rateLimit({
  windowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
  limit: RATE_LIMIT_LOGIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera un minuto.' },
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json());

app.use(
  session({
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    },
  }),
);

// Health check ANTES de los routers y limitadores (evita que /api/:id lo capture)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

app.use(generalLimiter);
app.use('/api/login', loginLimiter);

app.use('/api', apiRoutes);

// En producción servimos el build del frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), process.env.FRONTEND_DIST || DEFAULT_FRONTEND_DIST);
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

app.use(notFoundHandler);
app.use(errorHandler);
