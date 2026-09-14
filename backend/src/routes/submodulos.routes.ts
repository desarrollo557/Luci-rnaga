import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createSubModuloSchema, updateSubModuloSchema } from '../validators/submodulos.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idNumerico } from '../middlewares/paramId.js';
import {
  listSubModulos,
  createSubModulo,
  updateSubModulo,
  deleteSubModulo,
} from '../controllers/submodulos.controller.js';
import { listUsersByRoleAndSede } from '../controllers/asignaciones.controller.js';

const router = Router();
router.param('id', idNumerico);

// Sub-módulos
router.get('/sub_modulos', isAuthenticated, asyncHandler(listSubModulos));
router.post(
  '/sub_modulos',
  isAuthenticated,
  isLiderOrAdmin,
  validate(createSubModuloSchema),
  asyncHandler(createSubModulo),
);
router.put(
  '/sub_modulos/:id',
  isAuthenticated,
  isLiderOrAdmin,
  validate(updateSubModuloSchema),
  asyncHandler(updateSubModulo),
);
router.delete('/sub_modulos/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteSubModulo));

// Usuarios por rol y sede (TECNICA/CALIDAD disponibles para asignar)
router.get('/usuarios/:rol', isAuthenticated, asyncHandler(listUsersByRoleAndSede));

export default router;
