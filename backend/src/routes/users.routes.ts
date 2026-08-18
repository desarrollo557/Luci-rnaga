import { Router } from 'express';
import { isAuthenticated, isAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createUserSchema, updateUserSchema } from '../validators/users.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listUsers, getUser, createUser, updateUser, deleteUser, suspenderUsuario } from '../controllers/users.controller.js';

const router = Router();

// Prefijo montado en index.ts: /users
router.use(isAuthenticated, isAdmin);

router.get('/', asyncHandler(listUsers));
router.get('/:id', asyncHandler(getUser));
router.post('/', validate(createUserSchema), asyncHandler(createUser));
router.put('/:id', validate(updateUserSchema), asyncHandler(updateUser));
router.delete('/:id', asyncHandler(deleteUser));
router.patch('/:id/suspension', asyncHandler(suspenderUsuario));

export default router;
