import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';

export const app = express();

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
    secret: process.env.SESSION_SECRET || 'luciernaga-dev-secret',
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

// Health check ANTES de los routers (evita que /api/:id lo capture)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'luciernaga-api' });
});

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
