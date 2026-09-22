import type { Request, Response } from 'express';
import { tieneCajaAsignada } from '../services/jerarquia.service.js';
import {
  ESTADOS_DE_SOLICITUD,
  ErrorDeReapertura,
  aprobarSolicitud,
  crearSolicitud,
  listarSolicitudes,
  rechazarSolicitud,
  type EstadoDeSolicitud,
} from '../services/reaperturaCaja.service.js';

/**
 * Solicitudes de reapertura de caja: la técnica las pide, el líder las
 * atiende. La lógica vive en `reaperturaCaja.service.ts`; aquí solo se
 * traduce a HTTP.
 */

function responderError(res: Response, error: unknown): boolean {
  if (error instanceof ErrorDeReapertura) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

/** `POST /modulos_caja/:id/solicitar-reapertura` — la técnica pide reabrir una caja suya. */
export async function solicitarReapertura(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const { id } = req.params;
  if (!(await tieneCajaAsignada(user, id))) {
    res.status(403).json({ error: 'Solo puede pedir la reapertura de las cajas que tiene asignadas' });
    return;
  }
  try {
    const resultado = await crearSolicitud(user, id);
    res.status(resultado.nueva ? 201 : 200).json({
      message: resultado.nueva
        ? 'Solicitud enviada al líder. Te avisaremos en cuanto la caja esté disponible.'
        : 'Ya tienes una solicitud pendiente para esta caja; el líder la verá enseguida.',
      solicitud: resultado.solicitud,
      nueva: resultado.nueva,
    });
  } catch (error) {
    if (!responderError(res, error)) throw error;
  }
}

/** `GET /solicitudes_reapertura?estado=&caja_id=` — las que esta persona puede ver. */
export async function listarSolicitudesReapertura(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const estado = String(req.query.estado ?? '').trim().toUpperCase();
  if (estado && !ESTADOS_DE_SOLICITUD.includes(estado as EstadoDeSolicitud)) {
    res.status(400).json({ error: `El estado debe ser ${ESTADOS_DE_SOLICITUD.join(', ')}` });
    return;
  }
  const cajaId = String(req.query.caja_id ?? '').trim();
  if (cajaId && !/^\d+$/.test(cajaId)) {
    res.status(400).json({ error: 'El identificador de la caja debe ser numérico' });
    return;
  }
  res.json(
    await listarSolicitudes(user, {
      estado: estado ? (estado as EstadoDeSolicitud) : undefined,
      cajaId: cajaId || undefined,
    }),
  );
}

/** `POST /solicitudes_reapertura/:id/aprobar` — el líder reabre la caja. */
export async function aprobarSolicitudReapertura(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  try {
    const solicitud = await aprobarSolicitud(user, req.params.id);
    res.json({
      message: `Caja ${solicitud.caja_modulo} reabierta: ${solicitud.solicitante} ya puede editarla`,
      solicitud,
    });
  } catch (error) {
    if (!responderError(res, error)) throw error;
  }
}

/** `POST /solicitudes_reapertura/:id/rechazar` — el líder no autoriza. */
export async function rechazarSolicitudReapertura(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  try {
    const solicitud = await rechazarSolicitud(user, req.params.id);
    res.json({
      message: `Solicitud rechazada: la caja ${solicitud.caja_modulo} sigue terminada`,
      solicitud,
    });
  } catch (error) {
    if (!responderError(res, error)) throw error;
  }
}
