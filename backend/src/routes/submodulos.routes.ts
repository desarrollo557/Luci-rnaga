import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listSubModulos,
  createSubModulo,
  updateSubModulo,
  deleteSubModulo,
} from '../controllers/submodulos.controller.js';
import {
  assignTecnica,
  removeTecnica,
  listTecnicaUsers,
  assignCalidad,
  removeCalidad,
  listCalidadUsers,
  listUsersByRoleAndSede,
} from '../controllers/asignaciones.controller.js';

const router = Router();

// Sub-módulos
router.get('/sub_modulos', isAuthenticated, asyncHandler(listSubModulos));
router.post('/sub_modulos', isAuthenticated, isLiderOrAdmin, asyncHandler(createSubModulo));
router.put('/sub_modulos/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(updateSubModulo));
router.delete('/sub_modulos/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteSubModulo));

// Asignaciones TÉCNICA
router.post('/asignacion_tecnica', isAuthenticated, isLiderOrAdmin, asyncHandler(assignTecnica));
router.post('/asignacion_tecnica/:modulo_id/eliminar', isAuthenticated, isLiderOrAdmin, asyncHandler(removeTecnica));
router.get('/asignacion_tecnica/:modulo_id/usuarios', isAuthenticated, asyncHandler(listTecnicaUsers));

// Asignaciones CALIDAD
router.post('/asignacion_calidad', isAuthenticated, isLiderOrAdmin, asyncHandler(assignCalidad));
router.post('/asignacion_calidad/:modulo_id/eliminar', isAuthenticated, isLiderOrAdmin, asyncHandler(removeCalidad));
router.get('/asignacion_calidad/:modulo_id/usuarios', isAuthenticated, asyncHandler(listCalidadUsers));

// Usuarios por rol y sede (TECNICA/CALIDAD disponibles para asignar)
router.get('/usuarios/:rol', isAuthenticated, asyncHandler(listUsersByRoleAndSede));

export default router;
