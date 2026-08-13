import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin, isTecnicaOnly } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listModulosCaja,
  createModuloCaja,
  updateModuloCaja,
  deleteModuloCaja,
  changeEstadoCaja,
  countFuidByCaja,
  listTecnicaUsersOfCaja,
  listCalidadUsersOfCaja,
} from '../controllers/modulosCaja.controller.js';
import {
  assignCajaTecnica,
  removeCajaTecnica,
  assignCajaCalidad,
  removeCajaCalidad,
  assignCajaCalidadRango,
} from '../controllers/asignacionesCaja.controller.js';

const router = Router();

// Módulos de caja
router.get('/modulos_caja', isAuthenticated, asyncHandler(listModulosCaja));
router.post('/modulos_caja', isAuthenticated, isLiderOrAdmin, asyncHandler(createModuloCaja));
router.put('/modulos_caja/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(updateModuloCaja));
router.delete('/modulos_caja/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteModuloCaja));
router.patch('/modulos_caja/:id/cambiarEstado', isAuthenticated, isTecnicaOnly, asyncHandler(changeEstadoCaja));

router.get('/modulos_caja/count_fuiddatosreal', isAuthenticated, asyncHandler(countFuidByCaja));
router.get('/modulos_caja/:modulo_id/usuarios', isAuthenticated, asyncHandler(listTecnicaUsersOfCaja));
router.get('/modulos_caja_calidad/:modulo_id/usuarios', isAuthenticated, asyncHandler(listCalidadUsersOfCaja));

// Asignaciones de caja
router.post('/asignacion_caja_tecnica', isAuthenticated, isLiderOrAdmin, asyncHandler(assignCajaTecnica));
router.post(
  '/asignacion_caja_tecnica/:modulo_id/eliminar',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(removeCajaTecnica),
);
router.post('/asignacion_caja_calidad', isAuthenticated, isLiderOrAdmin, asyncHandler(assignCajaCalidad));
router.post(
  '/asignacion_caja_calidad/:modulo_id/eliminar',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(removeCajaCalidad),
);
router.post(
  '/asignacion_caja_calidad/rango',
  isAuthenticated,
  isLiderOrAdmin,
  asyncHandler(assignCajaCalidadRango),
);

export default router;
