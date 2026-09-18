import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin, isTecnicaOnly } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createModuloCajaSchema,
  createSerieCajasSchema,
  updateModuloCajaSchema,
} from '../validators/modulosCaja.validator.js';
import {
  asignarUsuariosSchema,
  usuariosOnlySchema,
} from '../validators/asignaciones.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idNumerico } from '../middlewares/paramId.js';
import {
  listModulosCaja,
  getModuloCajaById,
  getNextCajaNumero,
  getNextUpdByCaja,
  setUpdInicioTecnica,
  createModuloCaja,
  createCajasSerie,
  updateModuloCaja,
  deleteModuloCaja,
  changeEstadoCaja,
  countFuidByCaja,
  listTecnicaUsersOfCaja,
  listJornadasDeCaja,
  declararJornadaDeCaja,
  getTecnicaStats,
} from '../controllers/modulosCaja.controller.js';
import {
  assignCajaTecnica,
  removeCajaTecnica,
} from '../controllers/asignacionesCaja.controller.js';

const router = Router();
router.param('id', idNumerico);
router.param('modulo_id', idNumerico);

// Módulos de caja
router.get('/modulos_caja', isAuthenticated, asyncHandler(listModulosCaja));
router.post(
  '/modulos_caja',
  isAuthenticated,
  isLiderOrAdmin,
  validate(createModuloCajaSchema),
  asyncHandler(createModuloCaja),
);
// Crear serie de cajas (número inicial → final)
router.post(
  '/modulos_caja/serie',
  isAuthenticated,
  isLiderOrAdmin,
  validate(createSerieCajasSchema),
  asyncHandler(createCajasSerie),
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
router.get('/modulos_caja/next-upd/:cajaModulo', isAuthenticated, asyncHandler(getNextUpdByCaja));
router.put(
  '/modulos_caja/:cajaModulo/upd-inicio',
  isAuthenticated,
  isTecnicaOnly,
  asyncHandler(setUpdInicioTecnica),
);
router.get('/modulos_caja/tecnica-stats', isAuthenticated, asyncHandler(getTecnicaStats));
router.get('/modulos_caja/:id', isAuthenticated, asyncHandler(getModuloCajaById));
router.get('/modulos_caja/:modulo_id/usuarios', isAuthenticated, asyncHandler(listTecnicaUsersOfCaja));
// Historial de digitación de la caja: qué se trabajó en ella cada día.
router.get('/modulos_caja/:id/jornadas', isAuthenticated, asyncHandler(listJornadasDeCaja));
// Cierre de jornada: la termino o la continúo otro día. Lo declara quien digita.
router.post('/modulos_caja/:id/jornada', isAuthenticated, asyncHandler(declararJornadaDeCaja));

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

export default router;
