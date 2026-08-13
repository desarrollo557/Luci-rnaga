import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { estadisticasProduccion, fuidConEstadoCaja } from '../controllers/reportes.controller.js';

const router = Router();

router.get('/fuid-con-estado-caja', isAuthenticated, asyncHandler(fuidConEstadoCaja));
router.get('/estadisticas', isAuthenticated, asyncHandler(estadisticasProduccion));

export default router;
