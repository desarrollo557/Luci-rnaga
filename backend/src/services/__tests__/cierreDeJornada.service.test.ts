import { describe, expect, it } from 'vitest';
import { proximaCita } from '../cierreDeJornada.service.js';

/**
 * La cita del cierre de jornada cae a las 12:05 de la noche de Colombia.
 *
 * El servidor corre en UTC, donde a las 7 de la tarde de Colombia ya es el día
 * siguiente. Si la hora se calculara con el reloj del proceso, la cita caería
 * cinco horas antes y cerraría cajas en las que todavía se está digitando.
 */

/** Un instante dado como hora de Colombia (UTC-5, sin horario de verano). */
const enColombia = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

describe('la cita del cierre de jornada cae a las 12:05 a. m. de Colombia', () => {
  it('a última hora de la tarde, la cita es la madrugada que viene', () => {
    expect(proximaCita(enColombia('2026-09-21', '17:30')).toISOString()).toBe(
      enColombia('2026-09-22', '00:05').toISOString(),
    );
  });

  it('a medianoche en punto todavía alcanza la de hoy', () => {
    expect(proximaCita(enColombia('2026-09-22', '00:00')).toISOString()).toBe(
      enColombia('2026-09-22', '00:05').toISOString(),
    );
  });

  it('justo a las 12:05 se va al día siguiente y no se repite', () => {
    expect(proximaCita(enColombia('2026-09-22', '00:05')).toISOString()).toBe(
      enColombia('2026-09-23', '00:05').toISOString(),
    );
  });

  it('la medianoche de UTC no se confunde con la de Colombia', () => {
    // A las 7:30 de la tarde en Colombia ya es mañana en UTC; la cita sigue
    // siendo la próxima madrugada de Colombia, no una que ya pasó.
    expect(proximaCita(enColombia('2026-09-21', '19:30')).toISOString()).toBe(
      enColombia('2026-09-22', '00:05').toISOString(),
    );
  });

  it('nunca devuelve un instante ya pasado', () => {
    const ahora = new Date();
    expect(proximaCita(ahora).getTime()).toBeGreaterThan(ahora.getTime());
  });
});
