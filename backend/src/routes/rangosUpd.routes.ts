import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { assignRangeSchema } from '../validators/rangosUpd.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  asignarRango,
  checkRango,
  listarRangos,
  revocarRango,
  siguienteUpd,
  avanceRangosUpd,
} from '../controllers/rangosUpd.controller.js';

const router = Router();

// Orden importa: la raíz GET /rangos-upd (listado) y las literales (/check, /next,
// /avance) ANTES de /:id/revocar para que ninguna ruta con parámetro capture las literales.
router.get('/rangos-upd', isAuthenticated, isLiderOrAdmin, asyncHandler(listarRangos));
router.post('/rangos-upd', isAuthenticated, isLiderOrAdmin, validate(assignRangeSchema), asyncHandler(asignarRango));
router.get('/rangos-upd/check', isAuthenticated, isLiderOrAdmin, asyncHandler(checkRango));
router.get('/rangos-upd/next', isAuthenticated, asyncHandler(siguienteUpd));
router.get('/rangos-upd/avance', isAuthenticated, isLiderOrAdmin, asyncHandler(avanceRangosUpd));
router.post('/rangos-upd/:id/revocar', isAuthenticated, isLiderOrAdmin, asyncHandler(revocarRango));

export default router;