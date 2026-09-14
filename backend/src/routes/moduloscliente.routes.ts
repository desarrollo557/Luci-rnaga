import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createModuloClienteSchema,
  updateModuloClienteSchema,
} from '../validators/moduloscliente.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idNumerico } from '../middlewares/paramId.js';
import {
  listModulosCliente,
  getModuloClienteById,
  createModuloCliente,
  updateModuloCliente,
  deleteModuloCliente,
  countCajasOfModulo,
} from '../controllers/moduloscliente.controller.js';

const router = Router();
router.param('id', idNumerico);

router.get('/moduloscliente', isAuthenticated, asyncHandler(listModulosCliente));
router.post(
  '/moduloscliente',
  isAuthenticated,
  isLiderOrAdmin,
  validate(createModuloClienteSchema),
  asyncHandler(createModuloCliente),
);
router.put(
  '/moduloscliente/:id',
  isAuthenticated,
  isLiderOrAdmin,
  validate(updateModuloClienteSchema),
  asyncHandler(updateModuloCliente),
);
router.delete('/moduloscliente/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteModuloCliente));

router.get('/moduloscliente/count_cajas', isAuthenticated, asyncHandler(countCajasOfModulo));
router.get('/moduloscliente/:id', isAuthenticated, asyncHandler(getModuloClienteById));

export default router;
