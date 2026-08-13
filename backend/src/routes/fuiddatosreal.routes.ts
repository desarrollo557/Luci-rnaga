import { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listFuid,
  checkDuplicateUpd,
  checkCajaDuplicates,
  getFuid,
  createFuid,
  updateFuid,
  deleteFuid,
  suggestions,
  saveSuggestionValue,
  marcarOk,
} from '../controllers/fuiddatosreal.controller.js';

const router = Router();

// Orden importa: rutas fijas ANTES de las paramétricas /:id y /:caja
router.get('/fuiddatosreal', isAuthenticated, asyncHandler(listFuid));
router.get('/fuiddatosreal/check-duplicate-upd', isAuthenticated, asyncHandler(checkDuplicateUpd));
router.get('/fuiddatosreal/check-caja-duplicates', isAuthenticated, asyncHandler(checkCajaDuplicates));
router.post('/fuiddatosreal/marcar-ok', isAuthenticated, asyncHandler(marcarOk));
router.post('/fuiddatosreal', isAuthenticated, asyncHandler(createFuid));
router.get('/fuiddatosreal/:caja/suggestions/:campo', isAuthenticated, asyncHandler(suggestions));
router.post('/fuiddatosreal/:caja/:campo', isAuthenticated, asyncHandler(saveSuggestionValue));
router.get('/fuiddatosreal/:id', isAuthenticated, asyncHandler(getFuid));
router.put('/fuiddatosreal/:id', isAuthenticated, asyncHandler(updateFuid));
router.delete('/fuiddatosreal/:id', isAuthenticated, asyncHandler(deleteFuid));

export default router;
