import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listModulosCliente,
  createModuloCliente,
  updateModuloCliente,
  deleteModuloCliente,
  assignUsersToModulo,
  removeUsersFromModulo,
  listUsersOfModulo,
  countCajasOfModulo,
} from '../controllers/moduloscliente.controller.js';

const router = Router();

router.get('/moduloscliente', isAuthenticated, asyncHandler(listModulosCliente));
router.post('/moduloscliente', isAuthenticated, isLiderOrAdmin, asyncHandler(createModuloCliente));
router.put('/moduloscliente/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(updateModuloCliente));
router.delete('/moduloscliente/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteModuloCliente));

router.post(
  '/moduloscliente/:moduloId/agregar',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(assignUsersToModulo),
);
router.post(
  '/moduloscliente/:moduloId/eliminar',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(removeUsersFromModulo),
);
router.get('/moduloscliente/:moduloId/usuarios', isAuthenticated, isLiderOrAdmin, asyncHandler(listUsersOfModulo));
router.get('/moduloscliente/count_cajas', isAuthenticated, asyncHandler(countCajasOfModulo));

export default router;
