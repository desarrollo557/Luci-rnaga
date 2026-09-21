/**
 * Citas diarias a una hora fija de Colombia.
 *
 * Dos tareas del servidor corren una vez al día a una hora concreta: la
 * actualización de los inventarios, a las 4:15 de la tarde, y el cierre de las
 * cajas que quedaron abiertas al terminar la jornada, pasada la medianoche. Las
 * dos necesitan lo mismo: saber cuándo es la próxima vez que toca, contado en
 * hora de Colombia aunque el servidor corra en UTC, como en Render.
 *
 * El cálculo resta el desfase fijo y trabaja con los métodos UTC sobre esa
 * fecha desplazada: "las 16:15 UTC" de la fecha desplazada son las 16:15 de
 * Colombia. Es la forma de no depender de la zona horaria del proceso.
 */

/** Colombia es UTC-5 todo el año: no tiene horario de verano. */
export const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

/** Próxima vez que son las `hora:minuto` en Colombia, como instante real. */
export function proximaCitaEnColombia(hora: number, minuto: number, desde: Date = new Date()): Date {
  const enColombia = new Date(desde.getTime() - DESFASE_COLOMBIA_MS);
  const cita = new Date(enColombia);
  cita.setUTCHours(hora, minuto, 0, 0);
  if (cita.getTime() <= enColombia.getTime()) {
    cita.setUTCDate(cita.getUTCDate() + 1);
  }
  return new Date(cita.getTime() + DESFASE_COLOMBIA_MS);
}

/** Si en Colombia ya pasaron las `hora:minuto` de hoy. */
export function yaPasoLaHoraEnColombia(hora: number, minuto: number, ahora: Date = new Date()): boolean {
  const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
  const minutosAhora = enColombia.getUTCHours() * 60 + enColombia.getUTCMinutes();
  return minutosAhora >= hora * 60 + minuto;
}
