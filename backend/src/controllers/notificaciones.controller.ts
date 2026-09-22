import type { Request, Response } from 'express';
import {
  LATIDO_MS,
  escribirEvento,
  listarNotificaciones,
  marcarLeidas,
  suscribir,
} from '../services/notificaciones.service.js';

/**
 * Los avisos de la persona con sesión: la lista, marcarlos leídos y la
 * conexión abierta por la que llegan al instante.
 */

/** `GET /notificaciones` — los últimos avisos y cuántos quedan sin leer. */
export async function listarMisNotificaciones(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  res.json(await listarNotificaciones(user.id));
}

/** `POST /notificaciones/leidas` con `{ ids?: number[] }` — sin ids, todos. */
export async function marcarNotificacionesLeidas(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const crudo = (req.body as { ids?: unknown } | undefined)?.ids;
  let ids: number[] | undefined;
  if (crudo !== undefined) {
    if (!Array.isArray(crudo) || !crudo.every((v) => Number.isInteger(Number(v)))) {
      res.status(400).json({ error: 'ids debe ser una lista de números' });
      return;
    }
    ids = crudo.map(Number);
  }
  res.json({ leidas: await marcarLeidas(user.id, ids) });
}

/**
 * `GET /notificaciones/stream` — la conexión abierta (eventos del servidor).
 *
 * Se queda abierta hasta que la pestaña la cierre. Cada aviso nuevo para esta
 * persona se escribe aquí en cuanto se guarda; entre medias, un latido cada
 * tanto para que ningún proxy la corte. `retry` le dice al navegador cuánto
 * esperar antes de reconectarse si se cae.
 */
export function streamNotificaciones(req: Request, res: Response): void {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Nginx y proxies parecidos guardan la respuesta hasta que termina; esto les
  // pide que la pasen tal cual llega.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('retry: 3000\n\n');
  escribirEvento(res, 'conectado', { usuario_id: user.id });

  const soltar = suscribir(user.id, res);
  const latido = setInterval(() => {
    res.write(': latido\n\n');
  }, LATIDO_MS);

  req.on('close', () => {
    clearInterval(latido);
    soltar();
  });
}
