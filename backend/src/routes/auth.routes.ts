import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middlewares/validate.js';
import { loginSchema } from '../validators/auth.validator.js';
import { currentUser, checkAuth, login, logout } from '../controllers/auth.controller.js';

const router = Router();

router.get('/currentUser', asyncHandler(currentUser));
router.get('/checkAuth', asyncHandler(checkAuth));
router.post('/login', validate(loginSchema), asyncHandler(login));
router.post('/logout', asyncHandler(logout));

export default router;
