import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { estadisticasProduccion, fuidConEstadoCaja, resumenCajasAgrupado } from '../controllers/reportes.controller.js';

const router = Router();

router.get('/fuid-con-estado-caja', isAuthenticated, asyncHandler(fuidConEstadoCaja));
router.get('/resumen-cajas-agrupado', isAuthenticated, asyncHandler(resumenCajasAgrupado));
router.get('/estadisticas', isAuthenticated, asyncHandler(estadisticasProduccion));

export default router;
