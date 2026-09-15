import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  estadisticasProduccion,
  fuidConEstadoCaja,
  produccionDetallada,
  resumenCajasAgrupado,
} from '../controllers/reportes.controller.js';

const router = Router();

router.get('/fuid-con-estado-caja', isAuthenticated, asyncHandler(fuidConEstadoCaja));
router.get('/resumen-cajas-agrupado', isAuthenticated, asyncHandler(resumenCajasAgrupado));
router.get('/estadisticas', isAuthenticated, asyncHandler(estadisticasProduccion));
router.get('/estadisticas/detalle', isAuthenticated, asyncHandler(produccionDetallada));

export default router;
