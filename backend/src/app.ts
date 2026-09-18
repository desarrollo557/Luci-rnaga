import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/index.js';
import { pool } from './config/db.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import { cuerpoEnMayusculas } from './middlewares/mayusculas.js';
import { marcarActividad } from './middlewares/actividad.js';
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
// Todo lo que se guarda en el software va en MAYÚSCULAS (salvo contraseñas).
app.use(cuerpoEnMayusculas);

/**
 * La sesión se guarda en la base, no en memoria.
 *
 * Con el almacén en memoria, cada despliegue y cada reinicio del servidor
 * echaba a todo el mundo, y con más de una instancia el usuario entraba en una
 * y la petición siguiente caía en otra que no lo conocía. La tabla `session` la
 * crea el propio almacén si no existe.
 */
const AlmacenPg = connectPgSimple(session);

/**
 * Cuando el frontend vive en otro dominio que la API —por ejemplo el sitio en
 * Vercel y la API en Render—, el navegador solo manda la cookie de sesión si va
 * marcada `SameSite=None`, y eso exige `Secure`. Servidos ambos desde el mismo
 * dominio, `lax` es más estricto y suficiente.
 */
const dominiosSeparados = process.env.COOKIE_CROSS_SITE === 'true';
const enProduccion = process.env.NODE_ENV === 'production';

// Render, Vercel y cualquier plataforma con proxy delante terminan el TLS antes
// de la aplicación: sin esto, Express cree que la conexión es HTTP y se niega a
// enviar una cookie `Secure`.
if (enProduccion) app.set('trust proxy', 1);

app.use(
  session({
    store: new AlmacenPg({ pool, createTableIfMissing: true, tableName: 'session' }),
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: enProduccion || dominiosSeparados,
      httpOnly: true,
      sameSite: dominiosSeparados ? 'none' : 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    },
  }),
);

// Health check ANTES de los routers y limitadores (evita que /api/:id lo capture)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

/*
 * Deja constancia de que quien tiene sesión sigue usando el software. Va
 * después de la sesión y antes de las rutas, para que cuente cualquier
 * petición, no solo las de una pantalla concreta.
 */
app.use(marcarActividad);

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
