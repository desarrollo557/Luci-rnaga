import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idNumerico } from '../middlewares/paramId.js';
import {
  listInventario,
  getInventario,
  getInventarioFuid,
  createInventario,
  updateInventario,
  deleteInventario,
  syncInventarioController,
  listClientesParaInventario,
  getClienteParaInventario,
  descargarInventarioExcel,
  descargarFuidDeCliente,
} from '../controllers/inventario.controller.js';

const router = Router();
router.param('id', idNumerico);

router.get('/inventario', isAuthenticated, isLiderOrAdmin, asyncHandler(listInventario));
router.get('/inventario/clientes', isAuthenticated, isLiderOrAdmin, asyncHandler(listClientesParaInventario));
// La ruta del Excel va antes que la del cliente a secas: si no, `:codigo`
// capturaría también el segmento `excel`.
router.get('/inventario/clientes/:codigo/excel', isAuthenticated, isLiderOrAdmin, asyncHandler(descargarFuidDeCliente));
router.get('/inventario/clientes/:codigo', isAuthenticated, isLiderOrAdmin, asyncHandler(getClienteParaInventario));
router.get('/inventario/:id/fuid', isAuthenticated, isLiderOrAdmin, asyncHandler(getInventarioFuid));
router.get('/inventario/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(getInventario));
router.get('/inventario/:id/excel', isAuthenticated, isLiderOrAdmin, asyncHandler(descargarInventarioExcel));
router.post('/inventario', isAuthenticated, isLiderOrAdmin, asyncHandler(createInventario));
router.put('/inventario/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(updateInventario));
router.delete('/inventario/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteInventario));
router.post('/inventario/:id/sync', isAuthenticated, isLiderOrAdmin, asyncHandler(syncInventarioController));

export default router;
