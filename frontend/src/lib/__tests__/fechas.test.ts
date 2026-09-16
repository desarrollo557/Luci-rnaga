import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIN_FECHA,
  aFechaISO,
  fechaHoyLocal,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
} from '../fechas';

/**
 * Todo el software muestra la hora de Colombia, en formato de 12 horas.
 *
 * Las marcas de tiempo llegan de la base ya en hora de Colombia y sin zona
 * (`2026-09-16 08:21:36.123456`); lo que el servidor genera con
 * `toISOString()` llega en UTC con `Z`. Las dos tienen que verse igual: como
 * la hora que marca el reloj de la oficina. Y una fecha documental
 * (`2026-09-16`) nunca puede retroceder un día por pasar por UTC.
 */
describe('formatearFechaHora', () => {
  it('muestra una marca de la base tal cual, en 12 horas', () => {
    expect(formatearFechaHora('2026-09-16 08:21:36.123456')).toBe('16/09/2026 8:21 a. m.');
    expect(formatearFechaHora('2026-09-16T15:40:00')).toBe('16/09/2026 3:40 p. m.');
  });

  it('convierte a Colombia lo que viene en UTC', () => {
    // 13:21 UTC son las 08:21 en Bogotá.
    expect(formatearFechaHora('2026-09-16T13:21:36.000Z')).toBe('16/09/2026 8:21 a. m.');
    // 02:30 UTC del 17 todavía es el 16 a las 9:30 de la noche en Bogotá.
    expect(formatearFechaHora('2026-09-17T02:30:00Z')).toBe('16/09/2026 9:30 p. m.');
  });

  it('respeta un desplazamiento explícito', () => {
    expect(formatearFechaHora('2026-09-16T08:21:00-05:00')).toBe('16/09/2026 8:21 a. m.');
  });

  it('acepta un Date o milisegundos', () => {
    const instante = new Date('2026-09-16T13:21:00Z');
    expect(formatearFechaHora(instante)).toBe('16/09/2026 8:21 a. m.');
    expect(formatearFechaHora(instante.getTime())).toBe('16/09/2026 8:21 a. m.');
  });

  it('mediodía y medianoche se escriben como 12', () => {
    expect(formatearFechaHora('2026-09-16 12:05:00')).toBe('16/09/2026 12:05 p. m.');
    expect(formatearFechaHora('2026-09-16 00:05:00')).toBe('16/09/2026 12:05 a. m.');
  });

  it('sin valor o con un valor que no es fecha muestra el guion', () => {
    expect(formatearFechaHora(null)).toBe(SIN_FECHA);
    expect(formatearFechaHora(undefined)).toBe(SIN_FECHA);
    expect(formatearFechaHora('')).toBe(SIN_FECHA);
    expect(formatearFechaHora('no es una fecha')).toBe(SIN_FECHA);
  });
});

describe('formatearFecha', () => {
  it('una fecha documental se muestra tal cual, sin retroceder un día', () => {
    expect(formatearFecha('2026-09-16')).toBe('16/09/2026');
    expect(formatearFecha('1950-01-01')).toBe('01/01/1950');
  });

  it('de una marca de tiempo toma el día en Colombia', () => {
    expect(formatearFecha('2026-09-16 23:59:00')).toBe('16/09/2026');
    expect(formatearFecha('2026-09-17T02:30:00Z')).toBe('16/09/2026');
  });

  it('sin valor muestra el guion', () => {
    expect(formatearFecha(null)).toBe(SIN_FECHA);
    expect(formatearFecha('')).toBe(SIN_FECHA);
  });
});

describe('formatearHora', () => {
  it('da la hora de Colombia en 12 horas', () => {
    expect(formatearHora('2026-09-16T13:21:00Z')).toBe('8:21 a. m.');
    expect(formatearHora('2026-09-16 17:05:00')).toBe('5:05 p. m.');
  });
});

describe('aFechaISO', () => {
  it('deja pasar una fecha documental y toma el día de Colombia de una marca', () => {
    expect(aFechaISO('2026-09-16')).toBe('2026-09-16');
    expect(aFechaISO('2026-09-17T02:30:00Z')).toBe('2026-09-16');
    expect(aFechaISO(null)).toBe('');
  });
});

describe('fechaHoyLocal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('es el día de Colombia aunque en UTC ya sea mañana', () => {
    // 01:00 UTC del 17 son las 8 de la noche del 16 en Bogotá.
    vi.setSystemTime(new Date('2026-09-17T01:00:00Z'));
    expect(fechaHoyLocal()).toBe('2026-09-16');
  });

  it('tiene el formato YYYY-MM-DD', () => {
    vi.setSystemTime(new Date('2026-03-05T15:00:00Z'));
    expect(fechaHoyLocal()).toBe('2026-03-05');
  });
});
