import { describe, expect, it } from 'vitest';
import {
  MINUTOS_DIGITANDO,
  MINUTOS_ESCRIBIENDO,
  MINUTOS_EN_LINEA,
  MINUTOS_INACTIVO,
  contarPresencias,
  duracionDeJornada,
  presenciaDe,
  ritmoPorHora,
} from '../presencia';

/**
 * En qué anda cada persona ahora mismo.
 *
 * La primera prueba de este archivo es la que importa y la que faltaba: quien
 * lleva treinta registros esa mañana no puede figurar como "sin actividad".
 * Eso se vio en pantalla, con la hora de su último registro en la misma fila,
 * y venía de mirar una sola señal. Guardar un registro también es estar dentro.
 */

const AHORA = new Date('2026-09-18T10:30:00-05:00');
const haceMinutos = (n: number) => new Date(AHORA.getTime() - n * 60_000).toISOString();

describe('presenciaDe', () => {
  it('quien acaba de guardar un registro cuenta como presente, aunque no haya marca de petición', () => {
    // Es el caso que se veía mal: 34 registros, hora de inicio a la vista, y la
    // fila decía que nunca había entrado.
    const presencia = presenciaDe({ ultimaActividad: null, ultimoRegistro: haceMinutos(2) }, AHORA);
    expect(presencia.estado).toBe('digitando');
    expect(presencia.etiqueta).not.toMatch(/nunca|sin actividad/i);
  });

  it('escribir ahora mismo pesa más que cualquier otra señal', () => {
    // Es la única prueba de que la persona trabaja y no de que dejó la pantalla
    // abierta: gana aunque el último registro sea de hace una hora.
    const presencia = presenciaDe(
      { ultimaActividad: haceMinutos(1), ultimaEscritura: haceMinutos(0.5), ultimoRegistro: haceMinutos(60) },
      AHORA,
    );
    expect(presencia).toMatchObject({ estado: 'escribiendo', etiqueta: 'Escribiendo', color: 'green' });
  });

  it('dejar de teclear baja el estado, no lo mantiene', () => {
    const deEscribir = (m: number) =>
      presenciaDe({ ultimaActividad: haceMinutos(1), ultimaEscritura: haceMinutos(m) }, AHORA).estado;
    expect(deEscribir(MINUTOS_ESCRIBIENDO - 0.5)).toBe('escribiendo');
    // Pasado el margen ya no consta que escriba, aunque siga conectado.
    expect(deEscribir(MINUTOS_ESCRIBIENDO + 1)).toBe('en-linea');
  });

  it('tener la página abierta no cuenta como escribir', () => {
    // El caso que motivó la señal: conectado, sin teclear y sin guardar nada.
    const presencia = presenciaDe({ ultimaActividad: haceMinutos(1), ultimaEscritura: null }, AHORA);
    expect(presencia.estado).not.toBe('escribiendo');
    expect(presencia.estado).toBe('en-linea');
  });

  it('distingue quien está produciendo de quien solo tiene el software abierto', () => {
    const digitando = presenciaDe({ ultimaActividad: haceMinutos(1), ultimoRegistro: haceMinutos(3) }, AHORA);
    expect(digitando).toMatchObject({ estado: 'digitando', color: 'green', detalle: null });

    // Mismo minuto de conexión, pero sin guardar nada desde hace rato.
    const abierto = presenciaDe({ ultimaActividad: haceMinutos(1), ultimoRegistro: haceMinutos(45) }, AHORA);
    // Ámbar es el color de lo que hay que mirar: dentro del software y parado.
    expect(abierto).toMatchObject({ estado: 'en-linea', color: 'amber' });
    expect(abierto.detalle).toMatch(/sin digitar/);
  });

  it('quien entró y todavía no ha guardado nada lo dice así', () => {
    const presencia = presenciaDe({ ultimaActividad: haceMinutos(1), ultimoRegistro: null }, AHORA);
    expect(presencia).toMatchObject({ estado: 'en-linea', detalle: 'sin digitar todavía' });
  });

  it('solo lo accionable lleva color; lo demás va en gris', () => {
    // Verde produce, ámbar hay que mirarlo, gris no está. Con dos ámbar o dos
    // verdes la tabla dejaría de decir de un vistazo dónde mirar.
    const color = (señales: Parameters<typeof presenciaDe>[0]) => presenciaDe(señales, AHORA).color;
    expect(color({ ultimoRegistro: haceMinutos(1) })).toBe('green');
    expect(color({ ultimaActividad: haceMinutos(1), ultimoRegistro: haceMinutos(60) })).toBe('amber');
    expect(color({ ultimaActividad: haceMinutos(12) })).toBe('gray');
    expect(color({ ultimaActividad: haceMinutos(600) })).toBe('gray');
    expect(color({})).toBe('gray');
  });

  it('las fronteras entre los cuatro estados', () => {
    const conRegistro = (m: number) => presenciaDe({ ultimoRegistro: haceMinutos(m) }, AHORA).estado;
    expect(conRegistro(MINUTOS_DIGITANDO - 1)).toBe('digitando');
    expect(conRegistro(MINUTOS_DIGITANDO + 1)).toBe('inactivo');

    const conPeticion = (m: number) => presenciaDe({ ultimaActividad: haceMinutos(m) }, AHORA).estado;
    expect(conPeticion(MINUTOS_EN_LINEA - 1)).toBe('en-linea');
    expect(conPeticion(MINUTOS_EN_LINEA + 1)).toBe('inactivo');
    expect(conPeticion(MINUTOS_INACTIVO + 1)).toBe('fuera');
  });

  it('gana la señal más reciente, venga de donde venga', () => {
    // La petición es vieja pero el registro es de hace un momento.
    expect(presenciaDe({ ultimaActividad: haceMinutos(120), ultimoRegistro: haceMinutos(2) }, AHORA).estado).toBe(
      'digitando',
    );
    // Y al revés: sin registros hoy, pero navegando por el software.
    expect(presenciaDe({ ultimaActividad: haceMinutos(2), ultimoRegistro: null }, AHORA).estado).toBe('en-linea');
  });

  it('sin ninguna señal, y solo entonces, se dice que no hay actividad', () => {
    expect(presenciaDe({}, AHORA)).toMatchObject({ estado: 'nunca', etiqueta: 'Sin actividad' });
    expect(presenciaDe({ ultimaActividad: null, ultimoRegistro: null }, AHORA).estado).toBe('nunca');
  });

  it('acepta la marca sin la T que pone PostgreSQL', () => {
    expect(presenciaDe({ ultimaActividad: '2026-09-18 10:28:00' }, new Date('2026-09-18T10:30:00')).estado).toBe(
      'en-linea',
    );
  });

  it('una marca ilegible no deja a nadie falsamente presente', () => {
    expect(presenciaDe({ ultimaActividad: 'no es una fecha' }, AHORA).estado).toBe('nunca');
  });

  it('se mide contra el reloj que se le pasa, no contra el del navegador', () => {
    const señales = { ultimaActividad: haceMinutos(2) };
    expect(presenciaDe(señales, AHORA).estado).toBe('en-linea');
    const relojAdelantado = new Date(AHORA.getTime() + 60 * 60_000);
    expect(presenciaDe(señales, relojAdelantado).estado).toBe('fuera');
  });
});

describe('contarPresencias', () => {
  it('reparte al equipo en sus estados', () => {
    const conteo = contarPresencias(
      [
        { ultimoRegistro: haceMinutos(1) },
        { ultimoRegistro: haceMinutos(3) },
        { ultimaActividad: haceMinutos(2), ultimoRegistro: haceMinutos(90) },
        { ultimaActividad: haceMinutos(12) },
        { ultimaActividad: haceMinutos(600) },
        {},
      ],
      AHORA,
    );
    expect(conteo).toEqual({ escribiendo: 0, digitando: 2, 'en-linea': 1, inactivo: 1, fuera: 1, nunca: 1 });
  });
});

describe('ritmoPorHora', () => {
  it('mide sobre el tiempo trabajado, no sobre el periodo consultado', () => {
    // Dos horas de trabajo y 60 registros son 30 por hora, aunque el periodo
    // consultado sea el día entero.
    expect(ritmoPorHora('2026-09-18T08:00:00-05:00', '2026-09-18T10:00:00-05:00', 60)).toBe(30);
  });

  it('no inventa cifras con muy poco trabajo', () => {
    expect(ritmoPorHora('2026-09-18T08:00:00-05:00', '2026-09-18T08:05:00-05:00', 5)).toBeNull();
    expect(ritmoPorHora('2026-09-18T08:00:00-05:00', '2026-09-18T10:00:00-05:00', 1)).toBeNull();
    expect(ritmoPorHora(null, null, 40)).toBeNull();
  });
});

describe('duracionDeJornada', () => {
  it('dice cuánto lleva trabajando en horas y minutos', () => {
    expect(duracionDeJornada('2026-09-18T08:00:00-05:00', '2026-09-18T11:45:00-05:00')).toBe('3 h 45 min');
    expect(duracionDeJornada('2026-09-18T08:00:00-05:00', '2026-09-18T10:00:00-05:00')).toBe('2 h');
    expect(duracionDeJornada('2026-09-18T08:00:00-05:00', '2026-09-18T08:20:00-05:00')).toBe('20 min');
  });

  it('sin trabajo, no hay jornada que contar', () => {
    expect(duracionDeJornada(null, null)).toBeNull();
    expect(duracionDeJornada('2026-09-18T08:00:00-05:00', '2026-09-18T08:00:00-05:00')).toBeNull();
  });
});
