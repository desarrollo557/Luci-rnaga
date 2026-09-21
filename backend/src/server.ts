import 'dotenv/config';
import { app } from './app.js';
import { DEFAULT_HOST, DEFAULT_PORT } from './config/constants.js';
import { faltaConfiguracionDeBase } from './config/db.js';
import { asegurarEsquema } from './config/esquema.js';
import { iniciarActualizacionDiaria } from './services/actualizacionDiaria.service.js';
import { ejecutarCierreDeJornadas, iniciarCierreDeJornadas } from './services/cierreDeJornada.service.js';

/*
 * El esquema se comprueba antes de atender la primera petición, no después: si
 * se hiciera en paralelo habría una ventana en la que el servidor ya responde y
 * la columna todavía no existe, que es exactamente el fallo que esto evita.
 *
 * Si la comprobación falla, se registra dentro y el servidor arranca igual:
 * quedarse sin servicio entero por no haber podido añadir una columna sería peor
 * que el problema que se está evitando.
 */
/*
 * Sin base no hay nada que servir, así que se comprueba antes de escuchar y con
 * un mensaje que diga qué falta. El software usa PostgreSQL (Supabase) y ya no
 * MySQL: un `.env` de aquella época, con `DB_HOST` y sin `PG_*`, arrancaba
 * igual y respondía 500 a todo.
 */
const falta = faltaConfiguracionDeBase();
if (falta) {
  console.error(
    `[Base de datos] No se puede arrancar: ${falta}. ` +
      'El backend usa PostgreSQL (Supabase); las variables DB_HOST, DB_USER, DB_PASSWORD y DB_NAME eran de MySQL y ya no se leen. ' +
      'Copie backend/.env.example a backend/.env y rellene PG_HOST, PG_USER y PG_PASSWORD (ver docs/ENTORNOS.md).',
  );
  process.exit(1);
}

await asegurarEsquema();

/*
 * Las cajas que quedaron abiertas en jornadas anteriores se cierran antes de
 * atender a nadie. En el plan gratuito de Render el servidor duerme de noche y
 * despierta con la primera petición de la mañana, y esa petición ya tiene que
 * ver la caja de ayer como terminada. Nunca lanza: si falla, lo registra.
 */
await ejecutarCierreDeJornadas('arranque del servidor');

app.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  console.log(`API Luciérnaga ejecutándose en http://localhost:${DEFAULT_PORT}`);
  // Las citas diarias: los inventarios se ponen al día a las 4:15 p. m. y las
  // cajas de la jornada anterior se cierran a las 12:05 a. m., hora de
  // Colombia. Se arrancan aquí y no en `app.ts` para que las pruebas, que
  // importan la aplicación sin levantarla, no queden con un temporizador vivo.
  iniciarActualizacionDiaria();
  iniciarCierreDeJornadas();
});
