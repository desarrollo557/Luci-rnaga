import { queryResult } from '../config/db.js';
import { fechaHoyLocal } from '../utils/format.js';
import { proximaCitaEnColombia } from '../utils/citaDiaria.js';
import { cerrarJornadasVencidas } from './cicloCaja.service.js';

/**
 * Cierre de jornada automático: pasada la medianoche, las cajas que quedaron
 * abiertas el día anterior sin que nadie las marcara para continuar se dan por
 * terminadas.
 *
 * Nace de una regla de la operación: quien digita y se va sin pulsar nada deja
 * la caja terminada en esa jornada. Antes la caja se quedaba abierta hasta que
 * la persona empezara otra, y eso dejaba la última caja de cada día en el aire:
 * la pantalla decía "en proceso" de algo que ya estaba hecho, y quien miraba no
 * sabía si faltaba trabajo o faltaba que alguien empezara la siguiente. La única
 * excepción es la caja que alguien marcó "la continúo otro día".
 *
 * Dentro de la jornada no pasa nada: salir de la caja y volver horas después es
 * lo normal, y la caja sigue abierta para editar y seguir digitando. Lo que
 * cierra es el cambio de día. La consulta que lo hace está en
 * `cicloCaja.service.ts`, junto al resto del ciclo de la caja.
 *
 * **Cuándo corre.** A las 12:05 de la noche, hora de Colombia, y además en cada
 * arranque del servidor (`server.ts` lo espera antes de atender a nadie). Lo
 * segundo importa por el plan gratuito de Render, que duerme el servicio a los
 * 15 minutos sin tráfico: a medianoche casi nunca hay nadie despierto, así que
 * el temporizador no se dispara, pero la primera petición de la mañana arranca
 * el proceso y el cierre se hace en ese momento, antes de que nadie vea una
 * caja de ayer todavía abierta.
 *
 * Es idempotente: ejecutarlo dos veces el mismo día no cambia nada la segunda,
 * porque solo toca cajas cuyo último registro es de un día ya pasado. Por eso
 * no hace falta llevar cuenta de si la cita de hoy ya se hizo.
 */

/** 12:05 a. m., hora de Colombia: con la fecha ya cambiada. */
const HORA = 0;
const MINUTO = 5;

let temporizador: NodeJS.Timeout | null = null;
let ejecutando = false;

/** Próxima vez que toca, como instante real. */
export function proximaCita(desde: Date = new Date()): Date {
  return proximaCitaEnColombia(HORA, MINUTO, desde);
}

/**
 * Cierra las jornadas vencidas y dice cuántas cajas cerró.
 *
 * Nunca lanza: si la base no responde se registra el motivo y se vuelve a
 * intentar en la siguiente cita o en el siguiente arranque. Quedarse sin
 * servidor por no haber podido cerrar una caja sería peor que el problema.
 */
export async function ejecutarCierreDeJornadas(motivo: string): Promise<number> {
  if (ejecutando) return 0;
  ejecutando = true;
  try {
    const cerradas = await cerrarJornadasVencidas(
      async (sql, params) => (await queryResult(sql, params)).affectedRows,
      fechaHoyLocal(),
    );
    if (cerradas > 0) {
      console.log(`[Cajas] ${cerradas} caja(s) dada(s) por terminada(s) al cerrar la jornada (${motivo}).`);
    }
    return cerradas;
  } catch (error) {
    console.error(`[Cajas] No se pudo cerrar la jornada (${motivo}):`, error);
    return 0;
  } finally {
    ejecutando = false;
  }
}

/** Programa la siguiente cita y se vuelve a programar al terminar. */
function programarSiguiente(): void {
  const cita = proximaCita();
  temporizador = setTimeout(() => {
    void ejecutarCierreDeJornadas('cita de las 12:05 a. m.').finally(programarSiguiente);
  }, cita.getTime() - Date.now());
  // `unref` para que este temporizador no sea razón suficiente para que el
  // proceso siga vivo: si el servidor se está apagando, que se apague.
  temporizador.unref?.();
  console.log(`[Cajas] Próximo cierre de jornada: ${cita.toISOString()} (12:05 a. m. en Colombia)`);
}

/**
 * Programa la cita de cada madrugada. Se llama una vez, desde `server.ts`, que
 * además ejecuta el cierre del arranque por su cuenta antes de escuchar.
 */
export function iniciarCierreDeJornadas(): void {
  if (temporizador) return;
  programarSiguiente();
}

/** Detiene la cita. Existe para las pruebas y para un apagado ordenado. */
export function detenerCierreDeJornadas(): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
}
