import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import submodulosRoutes from './submodulos.routes.js';
import modulosclienteRoutes from './moduloscliente.routes.js';
import modulosCajaRoutes from './modulosCaja.routes.js';
import fuiddatosrealRoutes from './fuiddatosreal.routes.js';
import inventarioRoutes from './inventario.routes.js';
import historialRoutes from './historial.routes.js';
import plantillaRoutes from './plantilla.routes.js';
import reportesRoutes from './reportes.routes.js';

const router = Router();

router.use(authRoutes);
router.use('/users', usersRoutes);
router.use(submodulosRoutes);
router.use(modulosclienteRoutes);
router.use(modulosCajaRoutes);
router.use(fuiddatosrealRoutes);
router.use(inventarioRoutes);
router.use(historialRoutes);
router.use(plantillaRoutes);
router.use(reportesRoutes);

export default router;
