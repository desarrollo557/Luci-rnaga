import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generatePlantilla } from '../controllers/plantilla.controller.js';

const router = Router();

router.post('/generarPlantilla', isAuthenticated, asyncHandler(generatePlantilla));

export default router;
