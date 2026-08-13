import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listHistorial } from '../controllers/historial.controller.js';

const router = Router();

router.get('/historial', isAuthenticated, isLiderOrAdmin, asyncHandler(listHistorial));

export default router;
