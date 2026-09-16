import { queryOne } from '../config/db.js';
import { fechaHoyLocal } from '../utils/format.js';
import {
  USUARIO_ACTUALIZACION_AUTOMATICA,
  recalcularTodosLosInventarios,
} from '../controllers/inventario.controller.js';

/**
 * Actualización diaria de los inventarios, a las 4:15 de la tarde hora de
 * Colombia.
 *
 * El inventario de un cliente es una foto de lo que hay digitado, y la
 * digitación no para: sin volver a leer, el documento envejece en silencio y lo
 * que se entrega deja de cuadrar con el sistema. Esta cita diaria lo pone al día
 * solo, sin que nadie tenga que acordarse.
 *
 * **Sobre la hora exacta.** El servicio de producción está en el plan gratuito de
 * Render, que lo duerme tras 15 minutos sin tráfico. Un temporizador dentro del
 * proceso no se dispara mientras duerme, así que a las 4:15 puede no haber nadie
 * despierto. Por eso, al arrancar, se comprueba si la cita del día ya pasó sin
 * ejecutarse y en ese caso se ejecuta en ese momento: la actualización llega
 * igual, aunque más tarde. Para que la hora se respete al minuto hay que pasar el
 * servicio al plan `starter`, donde no se duerme.
 *
 * Con una sola instancia, que es como corre hoy, no hay riesgo de que dos
 * procesos hagan el mismo trabajo a la vez. Si algún día se levanta más de una,
 * esto necesitaría un candado en la base.
 */

/** 4:15 p. m., hora de Colombia. */
const HORA = 16;
const MINUTO = 15;

/** Colombia es UTC-5 todo el año: no tiene horario de verano. */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

let temporizador: NodeJS.Timeout | null = null;
let ejecutando = false;

/**
 * Próxima vez que toca, como instante real.
 *
 * Se calcula restando el desfase y usando los métodos UTC: sobre esa fecha
 * desplazada, "las 16:15 UTC" son las 16:15 de Colombia. Es la forma de no
 * depender de la zona horaria en la que corra el servidor, que en Render es UTC.
 */
export function proximaCita(desde: Date = new Date()): Date {
  const enColombia = new Date(desde.getTime() - DESFASE_COLOMBIA_MS);
  const cita = new Date(enColombia);
  cita.setUTCHours(HORA, MINUTO, 0, 0);
  if (cita.getTime() <= enColombia.getTime()) {
    cita.setUTCDate(cita.getUTCDate() + 1);
  }
  return new Date(cita.getTime() + DESFASE_COLOMBIA_MS);
}

/** Si en Colombia ya pasó la hora de hoy. */
export function yaPasoLaHoraDeHoy(ahora: Date = new Date()): boolean {
  const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
  const minutosAhora = enColombia.getUTCHours() * 60 + enColombia.getUTCMinutes();
  return minutosAhora >= HORA * 60 + MINUTO;
}

/** Si la actualización automática de hoy ya se hizo. */
async function yaSeActualizoHoy(): Promise<boolean> {
  const fila = await queryOne<{ fecha: string | null }>(
    `SELECT MAX("FECHA_ACTUALIZACION") AS fecha FROM inventario WHERE "USUARIO_ACTUALIZACION" = ?`,
    [USUARIO_ACTUALIZACION_AUTOMATICA],
  );
  const ultima = fila?.fecha;
  if (!ultima) return false;
  // La conexión trabaja en hora de Colombia y las marcas llegan como texto, así
  // que basta con comparar los diez primeros caracteres: `AAAA-MM-DD`.
  return String(ultima).slice(0, 10) === fechaHoyLocal();
}

/** Ejecuta la actualización, sin dejar que se solapen dos. */
export async function ejecutarActualizacionDiaria(motivo: string): Promise<void> {
  if (ejecutando) {
    console.log('[Inventario] La actualización anterior sigue en curso; se omite esta.');
    return;
  }
  ejecutando = true;
  const empezo = Date.now();
  try {
    console.log(`[Inventario] Actualización automática (${motivo})…`);
    const { total, actualizados, fallidos } = await recalcularTodosLosInventarios(
      USUARIO_ACTUALIZACION_AUTOMATICA,
    );
    const segundos = Math.round((Date.now() - empezo) / 1000);
    console.log(
      `[Inventario] Actualización terminada en ${segundos}s: ${actualizados} de ${total} al día` +
        (fallidos > 0 ? `, ${fallidos} con error` : ''),
    );
  } catch (error) {
    console.error('[Inventario] La actualización automática falló entera:', error);
  } finally {
    ejecutando = false;
  }
}

/** Programa la siguiente cita y se vuelve a programar al terminar. */
function programarSiguiente(): void {
  const cita = proximaCita();
  const espera = cita.getTime() - Date.now();
  temporizador = setTimeout(() => {
    void ejecutarActualizacionDiaria('cita diaria de las 4:15 p. m.').finally(programarSiguiente);
  }, espera);
  // `unref` para que este temporizador no sea razón suficiente para que el
  // proceso siga vivo: si el servidor se está apagando, que se apague.
  temporizador.unref?.();
  console.log(`[Inventario] Próxima actualización automática: ${cita.toISOString()} (4:15 p. m. en Colombia)`);
}

/**
 * Arranca la actualización diaria. Se llama una vez, desde `server.ts`.
 *
 * Además de programar la próxima cita, recupera la de hoy si el servicio estuvo
 * dormido cuando tocaba.
 */
export function iniciarActualizacionDiaria(): void {
  if (temporizador) return;
  programarSiguiente();

  void (async () => {
    try {
      if (yaPasoLaHoraDeHoy() && !(await yaSeActualizoHoy())) {
        await ejecutarActualizacionDiaria('recuperando la cita de hoy, que el servicio se perdió dormido');
      }
    } catch (error) {
      console.error('[Inventario] No se pudo comprobar si faltaba la actualización de hoy:', error);
    }
  })();
}

/** Detiene la cita. Existe para las pruebas y para un apagado ordenado. */
export function detenerActualizacionDiaria(): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
}
