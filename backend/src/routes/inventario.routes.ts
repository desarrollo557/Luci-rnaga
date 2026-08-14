import { Router } from 'express';
import { isAuthenticated, isLiderOrAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listInventario,
  getInventario,
  createInventario,
  updateInventario,
  deleteInventario,
  syncInventarioController,
} from '../controllers/inventario.controller.js';

const router = Router();

router.get('/inventario', isAuthenticated, isLiderOrAdmin, asyncHandler(listInventario));
router.get('/inventario/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(getInventario));
router.post('/inventario', isAuthenticated, isLiderOrAdmin, asyncHandler(createInventario));
router.put('/inventario/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(updateInventario));
router.delete('/inventario/:id', isAuthenticated, isLiderOrAdmin, asyncHandler(deleteInventario));
router.post('/inventario/:id/sync', isAuthenticated, isLiderOrAdmin, asyncHandler(syncInventarioController));

export default router;
