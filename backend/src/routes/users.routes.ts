import { Router } from 'express';
import { isAuthenticated, isAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listUsers, getUser, createUser, updateUser, deleteUser } from '../controllers/users.controller.js';

const router = Router();

// Prefijo montado en index.ts: /users
router.use(isAuthenticated, isAdmin);

router.get('/', asyncHandler(listUsers));
router.get('/:id', asyncHandler(getUser));
router.post('/', asyncHandler(createUser));
router.put('/:id', asyncHandler(updateUser));
router.delete('/:id', asyncHandler(deleteUser));

export default router;
