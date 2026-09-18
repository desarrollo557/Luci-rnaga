import { describe, expect, it } from 'vitest';
import { REGISTROS_MINIMOS_PARA_RITMO, destacadosDe, soloConectadas } from '../destacados';

/**
 * Quién se destaca y quién está de verdad conectado.
 *
 * Lo que se comprueba es que las dos formas de destacar no se pisen: quien más
 * lleva hecho casi siempre es quien lleva más horas, y quien entra tarde puede
 * ir más rápido que nadie y quedar el último por total. Si el cálculo mezclara
 * las dos cosas, el líder felicitaría siempre al que madruga.
 */

const AHORA = new Date('2026-09-18T11:00:00-05:00');
const hora = (h: number, m = 0) =>
  new Date(`2026-09-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`).toISOString();
const haceMinutos = (n: number) => new Date(AHORA.getTime() - n * 60_000).toISOString();

/** Alguien que empezó a las 8 y sigue escribiendo, con los registros que se digan. */
const persona = (nombre: string, registros: number, desde: number, hasta: number) => ({
  nombre,
  registros,
  primerRegistro: hora(desde),
  ultimoRegistro: hora(hasta),
  ultimaEscritura: haceMinutos(1),
});

describe('destacadosDe', () => {
  it('separa a quien más lleva hecho de quien va más rápido', () => {
    const madrugador = persona('ANA', 90, 6, 11); // 5 horas, 18 por hora
    const veloz = persona('BETO', 60, 10, 11); //    1 hora, 60 por hora

    const { porVolumen, porRitmo } = destacadosDe([madrugador, veloz], AHORA);
    expect(porVolumen?.persona.nombre).toBe('ANA');
    expect(porVolumen?.valor).toBe(90);
    expect(porRitmo?.persona.nombre).toBe('BETO');
    expect(porRitmo?.valor).toBe(60);
  });

  it('un arranque corto no gana el ritmo con cifras infladas', () => {
    // Tres registros en diez minutos darían dieciocho por hora sostenidos, que
    // no se sostienen; hace falta trabajo suficiente para comparar.
    const recienLlegado = { ...persona('CARO', REGISTROS_MINIMOS_PARA_RITMO - 1, 10, 11) };
    const constante = persona('DANI', 40, 8, 11);

    const { porRitmo } = destacadosDe([recienLlegado, constante], AHORA);
    expect(porRitmo?.persona.nombre).toBe('DANI');
  });

  it('sin nadie produciendo no se inventa un destacado', () => {
    const { porVolumen, porRitmo } = destacadosDe(
      [{ nombre: 'ANA', registros: 0, ultimaActividad: haceMinutos(1) }],
      AHORA,
    );
    expect(porVolumen).toBeNull();
    expect(porRitmo).toBeNull();
  });

  it('señala a quien está conectado sin producir', () => {
    const trabajando = persona('ANA', 40, 8, 11);
    const parado = { nombre: 'BETO', registros: 5, ultimaActividad: haceMinutos(1), ultimoRegistro: haceMinutos(90) };
    const fuera = { nombre: 'CARO', registros: 0, ultimaActividad: haceMinutos(600) };

    const { detenidos } = destacadosDe([trabajando, parado, fuera], AHORA);
    expect(detenidos.map((p) => p.nombre)).toEqual(['BETO']);
  });
});

describe('soloConectadas', () => {
  it('deja fuera a quien no está, que es casi toda la lista de usuarios', () => {
    const personas = [
      { nombre: 'ESCRIBE', ultimaEscritura: haceMinutos(1) },
      { nombre: 'GUARDÓ', ultimoRegistro: haceMinutos(4) },
      { nombre: 'ABIERTO', ultimaActividad: haceMinutos(2), ultimoRegistro: haceMinutos(90) },
      { nombre: 'LEVANTADO', ultimaActividad: haceMinutos(12) },
      { nombre: 'SE FUE', ultimaActividad: haceMinutos(600) },
      { nombre: 'NUNCA ENTRÓ' },
    ];
    expect(soloConectadas(personas, AHORA).map((p) => p.nombre)).toEqual([
      'ESCRIBE',
      'GUARDÓ',
      'ABIERTO',
      'LEVANTADO',
    ]);
  });

  it('los ordena por lo activos que están', () => {
    const personas = [
      { nombre: 'LEVANTADO', ultimaActividad: haceMinutos(12) },
      { nombre: 'ESCRIBE', ultimaEscritura: haceMinutos(1) },
      { nombre: 'ABIERTO', ultimaActividad: haceMinutos(2), ultimoRegistro: haceMinutos(90) },
    ];
    expect(soloConectadas(personas, AHORA).map((p) => p.nombre)).toEqual([
      'ESCRIBE',
      'ABIERTO',
      'LEVANTADO',
    ]);
  });

  it('con el equipo entero fuera devuelve la lista vacía, no todos', () => {
    const sinSeñales = [
      { nombre: 'ANA', ultimaActividad: null },
      { nombre: 'BETO', ultimaActividad: null },
    ];
    expect(soloConectadas(sinSeñales, AHORA)).toEqual([]);
  });
});
