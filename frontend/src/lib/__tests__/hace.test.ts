import { describe, expect, it } from 'vitest';
import { hace } from '../fechas';

/**
 * Tiempo relativo: `hace 2 horas`, `hace 6 días`.
 *
 * Lo usa la columna "Al día" del inventario, donde la pregunta real no es qué día
 * exactamente se leyó sino si eso está reciente. Una fecha con hora obliga a
 * restar mentalmente cada vez.
 *
 * Todas las comprobaciones fijan el "ahora" a mano: con la hora del sistema, las
 * pruebas dirían cosas distintas según cuándo se ejecuten.
 */

const AHORA = new Date('2026-09-16T21:00:00.000Z');

/** Un instante a N minutos de distancia del ahora fijado. */
function haceMinutos(minutos: number): Date {
  return new Date(AHORA.getTime() - minutos * 60_000);
}

describe('escalas de tiempo', () => {
  it('lo de hace segundos no se cuenta en minutos', () => {
    expect(hace(haceMinutos(0.5), AHORA)).toBe('hace un momento');
  });

  it('los minutos se dicen en minutos', () => {
    expect(hace(haceMinutos(5), AHORA)).toContain('5');
    expect(hace(haceMinutos(5), AHORA)).toContain('minuto');
  });

  it('las horas se dicen en horas', () => {
    const texto = hace(haceMinutos(120), AHORA);
    expect(texto).toContain('2');
    expect(texto).toContain('hora');
  });

  it('los días se dicen en días', () => {
    const texto = hace(haceMinutos(60 * 24 * 6), AHORA);
    expect(texto).toContain('6');
    expect(texto).toContain('día');
  });

  it('ayer se dice "ayer", no "hace 1 día"', () => {
    expect(hace(haceMinutos(60 * 24), AHORA)).toBe('ayer');
  });

  it('pasado un mes se cae a la fecha, que contar días deja de servir', () => {
    // Cinco semanas atrás: 12 de agosto de 2026.
    expect(hace(haceMinutos(60 * 24 * 35), AHORA)).toBe('12/08/2026');
  });
});

describe('casos que no deben romper la pantalla', () => {
  it('sin valor devuelve el guion, no "Invalid Date"', () => {
    expect(hace(null, AHORA)).toBe('—');
    expect(hace(undefined, AHORA)).toBe('—');
    expect(hace('', AHORA)).toBe('—');
  });

  it('un texto que no es fecha devuelve el guion', () => {
    expect(hace('N/A', AHORA)).toBe('—');
  });

  it('una marca en el futuro no dice "hace"', () => {
    // Puede pasar con el reloj del equipo desajustado respecto del servidor.
    const texto = hace(new Date(AHORA.getTime() + 2 * 3600_000), AHORA);
    expect(texto).not.toContain('hace');
  });

  it('acepta el texto que devuelve la base, no solo objetos Date', () => {
    expect(hace('2026-09-16T19:00:00', AHORA)).toContain('hora');
  });
});
