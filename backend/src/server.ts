import 'dotenv/config';
import { app } from './app.js';
import { DEFAULT_HOST, DEFAULT_PORT } from './config/constants.js';
import { iniciarActualizacionDiaria } from './services/actualizacionDiaria.service.js';

app.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  console.log(`API Luciérnaga ejecutándose en http://localhost:${DEFAULT_PORT}`);
  // La cita diaria que pone los inventarios al día a las 4:15 p. m. hora de
  // Colombia. Se arranca aquí y no en `app.ts` para que las pruebas, que
  // importan la aplicación sin levantarla, no queden con un temporizador vivo.
  iniciarActualizacionDiaria();
});
