import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { idNumerico } from '../middlewares/paramId.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listarMisNotificaciones,
  marcarNotificacionesLeidas,
  streamNotificaciones,
} from '../controllers/notificaciones.controller.js';
import {
  aprobarSolicitudReapertura,
  listarSolicitudesReapertura,
  rechazarSolicitudReapertura,
} from '../controllers/solicitudesReapertura.controller.js';

const router = Router();
router.param('id', idNumerico);

// Avisos de la persona con sesión. El flujo es la conexión abierta por la que
// llegan al instante; la lista es lo que se consulta al entrar y al reconectar.
router.get('/notificaciones', isAuthenticated, asyncHandler(listarMisNotificaciones));
router.get('/notificaciones/stream', isAuthenticated, streamNotificaciones);
router.post('/notificaciones/leidas', isAuthenticated, asyncHandler(marcarNotificacionesLeidas));

// Solicitudes de reapertura: la técnica las pide desde la caja (ver
// `modulosCaja.routes.ts`); el líder de la sede o el administrador las atienden.
router.get('/solicitudes_reapertura', isAuthenticated, asyncHandler(listarSolicitudesReapertura));
router.post(
  '/solicitudes_reapertura/:id/aprobar',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(aprobarSolicitudReapertura),
);
router.post(
  '/solicitudes_reapertura/:id/rechazar',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(rechazarSolicitudReapertura),
);

export default router;
