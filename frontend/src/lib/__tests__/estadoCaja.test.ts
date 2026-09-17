import { describe, expect, it } from 'vitest';
import { CAJA_EN_PROCESO, CAJA_FINALIZADA, estadoDeCaja } from '../estadoCaja';

/**
 * Lo que la interfaz dice del estado de una caja.
 *
 * Importa una cosa por encima de las demás: que se vea cuándo una caja viene de
 * días anteriores. Ese es el caso que antes no existía en pantalla y el que
 * explica por qué el trabajo de hoy empieza a media caja.
 */

const HOY = '2026-09-16';

describe('estadoDeCaja', () => {
  it('avisa de que la caja se está continuando de otro día', () => {
    const estado = estadoDeCaja(
      { estado: CAJA_EN_PROCESO, registros: 23, desde: '2026-09-15' },
      HOY,
    );
    expect(estado.etiqueta).toBe('En proceso');
    expect(estado.color).toBe('amber');
    expect(estado.continuada).toBe(true);
    expect(estado.detalle).toMatch(/se continúa desde/i);
    expect(estado.detalle).toContain('23 registros');
  });

  it('una caja empezada hoy no se presenta como continuada', () => {
    const estado = estadoDeCaja({ estado: CAJA_EN_PROCESO, registros: 4, desde: HOY }, HOY);
    expect(estado.continuada).toBe(false);
    expect(estado.detalle).toBe('4 registros');
  });

  it('la caja terminada dice a qué jornada se atribuyó', () => {
    const estado = estadoDeCaja(
      { estado: CAJA_FINALIZADA, registros: 40, fechaFinalizacion: '2026-09-15' },
      HOY,
    );
    expect(estado.etiqueta).toBe('Terminada');
    expect(estado.color).toBe('green');
    expect(estado.detalle).toMatch(/terminada el/i);
    expect(estado.continuada).toBe(false);
  });

  it('una caja sin empezar se ve como tal', () => {
    const estado = estadoDeCaja({ estado: null }, HOY);
    expect(estado.etiqueta).toBe('Sin empezar');
    expect(estado.color).toBe('gray');
    expect(estado.detalle).toBeNull();
  });

  it('un solo registro va en singular', () => {
    expect(estadoDeCaja({ estado: CAJA_EN_PROCESO, registros: 1, desde: HOY }, HOY).detalle).toBe('1 registro');
  });

  it('sin saber los registros no inventa un conteo', () => {
    expect(estadoDeCaja({ estado: CAJA_EN_PROCESO, desde: HOY }, HOY).detalle).toBeNull();
  });
});
