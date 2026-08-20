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

export const app = express();

// Limitador general: 1000 peticiones por IP cada 15 minutos (configurable por env).
// Se elevó desde 300 porque cada recarga de página dispara muchas consultas y
// recargar la app varias veces agotaba el cupo → 429 en toda la API.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_GENERAL) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo más tarde.' },
});

// Limitador estricto para login: 30 intentos por minuto (configurable por env).
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LOGIN) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera un minuto.' },
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'luci-dev-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

// Health check ANTES de los routers y limitadores (evita que /api/:id lo capture)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'luci-api' });
});

// Rate limit: general sobre toda la API y estricto sobre /api/login
app.use(generalLimiter);
app.use('/api/login', loginLimiter);

// API
app.use('/api', apiRoutes);

// En producción servimos el build del frontend
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), process.env.FRONTEND_DIST || '../frontend/dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

app.use(notFoundHandler);
app.use(errorHandler);
