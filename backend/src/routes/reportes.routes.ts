import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  descargarSeguimientoInventario,
  resumenSeguimientoInventario,
  estadisticasProduccion,
  fuidConEstadoCaja,
  produccionDetallada,
  resumenCajasAgrupado,
} from '../controllers/reportes.controller.js';
import { actividadDelEquipo, marcarEscribiendo } from '../controllers/actividad.controller.js';

const router = Router();

// Quién está trabajando ahora y cómo va su jornada.
router.get('/actividad', isAuthenticated, isLiderOrAdmin, asyncHandler(actividadDelEquipo));
// Lo llama quien digita, no quien mira: aquí no va el filtro de líder.
router.post('/actividad/escribiendo', isAuthenticated, asyncHandler(marcarEscribiendo));

router.get('/fuid-con-estado-caja', isAuthenticated, asyncHandler(fuidConEstadoCaja));
router.get('/resumen-cajas-agrupado', isAuthenticated, asyncHandler(resumenCajasAgrupado));
router.get('/estadisticas', isAuthenticated, asyncHandler(estadisticasProduccion));
router.get('/estadisticas/detalle', isAuthenticated, asyncHandler(produccionDetallada));
// Seguimiento de inventario en el formato oficial F-PSD-IDA-001.
router.get(
  '/seguimiento-inventario/resumen',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(resumenSeguimientoInventario),
);
router.get(
  '/seguimiento-inventario/excel',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(descargarSeguimientoInventario),
);

export default router;
