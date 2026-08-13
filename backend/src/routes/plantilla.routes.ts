import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generatePlantilla } from '../controllers/plantilla.controller.js';

const router = Router();

router.post('/generarPlantilla', asyncHandler(generatePlantilla));

export default router;
