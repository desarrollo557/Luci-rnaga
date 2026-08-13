import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { currentUser, checkAuth, login, logout } from '../controllers/auth.controller.js';

const router = Router();

router.get('/currentUser', asyncHandler(currentUser));
router.get('/checkAuth', asyncHandler(checkAuth));
router.post('/login', asyncHandler(login));
router.post('/logout', asyncHandler(logout));

export default router;
