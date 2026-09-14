import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { historialDeRegistro, listHistorial, resumenHistorial } from '../controllers/historial.controller.js';

const router = Router();

// El resumen va antes que la ruta con parámetro: si no, "resumen" se tomaría
// por el identificador de un registro.
router.get('/historial/resumen', isAuthenticated, isLiderOrAdmin, asyncHandler(resumenHistorial));
router.get('/historial/registro/:idDato', isAuthenticated, isLiderOrAdmin, asyncHandler(historialDeRegistro));
router.get('/historial', isAuthenticated, isLiderOrAdmin, asyncHandler(listHistorial));

export default router;
