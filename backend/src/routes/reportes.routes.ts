import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  descargarSeguimientoInventario,
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
// Seguimiento de inventario en el formato oficial F-PSD-IDA-001.
router.get(
  '/seguimiento-inventario/excel',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(descargarSeguimientoInventario),
);

export default router;
