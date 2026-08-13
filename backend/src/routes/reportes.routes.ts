import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fuidConEstadoCaja } from '../controllers/reportes.controller.js';

const router = Router();

router.get('/fuid-con-estado-caja', isAuthenticated, asyncHandler(fuidConEstadoCaja));

export default router;
