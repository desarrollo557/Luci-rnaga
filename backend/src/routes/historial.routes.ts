import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { historialDeRegistro, listHistorial } from '../controllers/historial.controller.js';

const router = Router();

router.get('/historial/registro/:idDato', isAuthenticated, isLiderOrAdmin, asyncHandler(historialDeRegistro));
router.get('/historial', isAuthenticated, isLiderOrAdmin, asyncHandler(listHistorial));

export default router;
