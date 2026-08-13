import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fuidConEstadoCaja } from '../controllers/reportes.controller.js';

const router = Router();

router.get('/fuid-con-estado-caja', asyncHandler(fuidConEstadoCaja));

export default router;
