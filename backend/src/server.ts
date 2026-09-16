import 'dotenv/config';
import { app } from './app.js';
import { DEFAULT_HOST, DEFAULT_PORT } from './config/constants.js';
import { asegurarEsquema } from './config/esquema.js';
import { iniciarActualizacionDiaria } from './services/actualizacionDiaria.service.js';

/*
 * El esquema se comprueba antes de atender la primera petición, no después: si
 * se hiciera en paralelo habría una ventana en la que el servidor ya responde y
 * la columna todavía no existe, que es exactamente el fallo que esto evita.
 *
 * Si la comprobación falla, se registra dentro y el servidor arranca igual:
 * quedarse sin servicio entero por no haber podido añadir una columna sería peor
 * que el problema que se está evitando.
 */
await asegurarEsquema();

app.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  console.log(`API Luciérnaga ejecutándose en http://localhost:${DEFAULT_PORT}`);
  // La cita diaria que pone los inventarios al día a las 4:15 p. m. hora de
  // Colombia. Se arranca aquí y no en `app.ts` para que las pruebas, que
  // importan la aplicación sin levantarla, no queden con un temporizador vivo.
  iniciarActualizacionDiaria();
});
