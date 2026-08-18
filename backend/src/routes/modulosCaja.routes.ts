import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin, isTecnicaOnly } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createModuloCajaSchema,
  updateModuloCajaSchema,
} from '../validators/modulosCaja.validator.js';
import {
  asignarUsuariosSchema,
  asignarRangoSchema,
  usuariosOnlySchema,
} from '../validators/asignaciones.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listModulosCaja,
  getModuloCajaById,
  getNextCajaNumero,
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
router.post(
  '/modulos_caja',
  isAuthenticated,
  isLiderOrAdmin,
  validate(createModuloCajaSchema),
  asyncHandler(createModuloCaja),
);
router.put(
  '/modulos_caja/:id',
  isAuthenticated,
  isLiderOrAdmin,
  validate(updateModuloCajaSchema),
  asyncHandler(updateModuloCaja),
);
router.delete('/modulos_caja/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteModuloCaja));
router.patch('/modulos_caja/:id/cambiarEstado', isAuthenticated, isTecnicaOnly, asyncHandler(changeEstadoCaja));

router.get('/modulos_caja/count_fuiddatosreal', isAuthenticated, asyncHandler(countFuidByCaja));
router.get('/modulos_caja/next/:prefijo', isAuthenticated, isLiderOrAdmin, asyncHandler(getNextCajaNumero));
router.get('/modulos_caja/:id', isAuthenticated, asyncHandler(getModuloCajaById));
router.get('/modulos_caja/:modulo_id/usuarios', isAuthenticated, asyncHandler(listTecnicaUsersOfCaja));
router.get('/modulos_caja_calidad/:modulo_id/usuarios', isAuthenticated, asyncHandler(listCalidadUsersOfCaja));

// Asignaciones de caja
router.post(
  '/asignacion_caja_tecnica',
  isAuthenticated,
  isLiderOrAdmin,
  validate(asignarUsuariosSchema),
  asyncHandler(assignCajaTecnica),
);
router.post(
  '/asignacion_caja_tecnica/:modulo_id/eliminar',
  isAuthenticated,
  isLiderOrAdmin,
  validate(usuariosOnlySchema),
  asyncHandler(removeCajaTecnica),
);
router.post(
  '/asignacion_caja_calidad',
  isAuthenticated,
  isLiderOrAdmin,
  validate(asignarUsuariosSchema),
  asyncHandler(assignCajaCalidad),
);
router.post(
  '/asignacion_caja_calidad/:modulo_id/eliminar',
  isAuthenticated,
  isLiderOrAdmin,
  validate(usuariosOnlySchema),
  asyncHandler(removeCajaCalidad),
);
router.post(
  '/asignacion_caja_calidad/rango',
  isAuthenticated,
  isLiderOrAdmin,
  validate(asignarRangoSchema),
  asyncHandler(assignCajaCalidadRango),
);

export default router;
