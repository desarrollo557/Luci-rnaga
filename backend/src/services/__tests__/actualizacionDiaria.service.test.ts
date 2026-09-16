import { describe, expect, it } from 'vitest';
import { proximaCita, yaPasoLaHoraDeHoy } from '../actualizacionDiaria.service.js';

/**
 * La cita diaria que pone los inventarios al día a las 4:15 de la tarde, hora de
 * Colombia.
 *
 * Es aritmética de husos horarios, que es donde se cuelan los errores que nadie
 * ve hasta que la tarea se ejecuta a la hora equivocada. El servidor de
 * producción corre en UTC, así que las 16:15 de Colombia son las 21:15 UTC: todas
 * las comprobaciones se escriben con instantes UTC explícitos para que se lea qué
 * momento real es cada uno.
 */

/** Instante real a partir de una hora de Colombia, que es UTC-5 todo el año. */
function enColombia(texto: string): Date {
  return new Date(`${texto}-05:00`);
}

describe('la próxima cita cae a las 4:15 p. m. de Colombia', () => {
  it('a media mañana, la cita es hoy por la tarde', () => {
    const cita = proximaCita(enColombia('2026-09-16T09:00:00'));
    expect(cita.toISOString()).toBe('2026-09-16T21:15:00.000Z');
  });

  it('pasada la hora, la cita se va al día siguiente', () => {
    const cita = proximaCita(enColombia('2026-09-16T16:16:00'));
    expect(cita.toISOString()).toBe('2026-09-17T21:15:00.000Z');
  });

  it('justo a la hora, la cita también se va al día siguiente y no se repite', () => {
    const cita = proximaCita(enColombia('2026-09-16T16:15:00'));
    expect(cita.toISOString()).toBe('2026-09-17T21:15:00.000Z');
  });

  it('un minuto antes, todavía alcanza la de hoy', () => {
    const cita = proximaCita(enColombia('2026-09-16T16:14:00'));
    expect(cita.toISOString()).toBe('2026-09-16T21:15:00.000Z');
  });

  it('de madrugada en Colombia, cuando en UTC ya es el día siguiente', () => {
    // Las 11 de la noche del 16 en Colombia son las 4 de la mañana del 17 en UTC.
    // Si el cálculo se hiciera en UTC, la cita se iría un día de más.
    const cita = proximaCita(enColombia('2026-09-16T23:00:00'));
    expect(cita.toISOString()).toBe('2026-09-17T21:15:00.000Z');
  });

  it('cruza el fin de mes sin romperse', () => {
    const cita = proximaCita(enColombia('2026-09-30T18:00:00'));
    expect(cita.toISOString()).toBe('2026-10-01T21:15:00.000Z');
  });

  it('nunca devuelve un instante ya pasado', () => {
    for (const hora of ['00:00:00', '08:30:00', '16:15:00', '16:15:01', '23:59:59']) {
      const ahora = enColombia(`2026-09-16T${hora}`);
      expect(proximaCita(ahora).getTime()).toBeGreaterThan(ahora.getTime());
    }
  });

  it('la cita siempre está dentro de las próximas 24 horas', () => {
    const ahora = enColombia('2026-09-16T16:15:30');
    const dentroDeUnDia = ahora.getTime() + 24 * 60 * 60 * 1000;
    expect(proximaCita(ahora).getTime()).toBeLessThanOrEqual(dentroDeUnDia);
  });
});

describe('saber si la hora de hoy ya pasó, para recuperar la cita perdida', () => {
  it('por la mañana todavía no ha pasado', () => {
    expect(yaPasoLaHoraDeHoy(enColombia('2026-09-16T09:00:00'))).toBe(false);
  });

  it('un minuto antes tampoco', () => {
    expect(yaPasoLaHoraDeHoy(enColombia('2026-09-16T16:14:59'))).toBe(false);
  });

  it('a la hora en punto ya cuenta como pasada', () => {
    expect(yaPasoLaHoraDeHoy(enColombia('2026-09-16T16:15:00'))).toBe(true);
  });

  it('por la noche ha pasado', () => {
    expect(yaPasoLaHoraDeHoy(enColombia('2026-09-16T22:00:00'))).toBe(true);
  });

  it('la medianoche de Colombia no se confunde con la de UTC', () => {
    // 00:30 en Colombia son las 05:30 UTC del mismo día: la hora aún no ha
    // llegado, aunque en UTC ya hayan pasado de las 4 de la madrugada.
    expect(yaPasoLaHoraDeHoy(enColombia('2026-09-17T00:30:00'))).toBe(false);
  });
});
