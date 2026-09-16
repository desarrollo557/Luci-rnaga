/**
 * Fechas y horas de Luciérnaga: una sola zona y una sola forma de mostrarlas.
 *
 * Todas las sedes operan en Colombia, así que el software habla siempre en la
 * hora de Bogotá (UTC-5, sin horario de verano). La base guarda las marcas de
 * tiempo ya en esa hora —el backend fija la zona de cada conexión— y aquí solo
 * se les da forma: día/mes/año y hora de 12 horas con a. m. / p. m., que es
 * como la lee la gente ("las 8 de la mañana"), no en formato de 24 horas.
 *
 * Lo que llega de la API viene de tres formas y las tres se aceptan:
 *
 *   - `YYYY-MM-DD HH:MM:SS[.ffffff]` o `YYYY-MM-DDTHH:MM:SS`, sin zona: es la
 *     hora de Colombia tal cual está guardada. No se pasa por `new Date()` a
 *     secas porque el navegador la interpretaría en su propia zona.
 *   - ISO con `Z` o con desplazamiento (lo que el servidor produce con
 *     `toISOString()`): es un instante absoluto y se convierte a Colombia.
 *   - `YYYY-MM-DD` a secas es una fecha documental, sin hora: se muestra tal
 *     cual, sin pasar por `Date`, porque `new Date('2026-09-16')` es la
 *     medianoche UTC y en Colombia todavía es el día anterior.
 */
export const ZONA_HORARIA = 'America/Bogota';

/** Colombia no cambia de hora en el año: el desplazamiento es fijo. */
const DESPLAZAMIENTO = '-05:00';

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FECHA_Y_HORA = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const CON_ZONA = /(Z|[+-]\d{2}:?\d{2})$/;

/** Cómo se muestra un valor que no hay o que no se puede interpretar. */
export const SIN_FECHA = '—';

type Entrada = string | number | Date | null | undefined;

/** El instante que representa el valor, o null si no se puede interpretar. */
function aInstante(valor: Entrada): Date | null {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date || typeof valor === 'number') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const texto = String(valor).trim();
  const local = FECHA_Y_HORA.exec(texto);
  if (local) return new Date(`${local[1]}T${local[2]}:${local[3] ?? '00'}${DESPLAZAMIENTO}`);
  if (SOLO_FECHA.test(texto)) return new Date(`${texto}T00:00:00${DESPLAZAMIENTO}`);
  if (CON_ZONA.test(texto)) {
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

interface Componentes {
  anio: string;
  mes: string;
  dia: string;
  hora: number;
  minuto: string;
}

const partesEnColombia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Año, mes, día, hora y minuto del instante, vistos desde Colombia. */
function componentes(instante: Date): Componentes {
  const partes: Record<string, string> = {};
  for (const parte of partesEnColombia.formatToParts(instante)) partes[parte.type] = parte.value;
  return {
    anio: partes.year,
    mes: partes.month,
    dia: partes.day,
    hora: Number(partes.hour),
    minuto: partes.minute,
  };
}

/** Hora de 12 horas con su periodo: `8:21 a. m.`, `12:05 p. m.`, `12:05 a. m.` */
function horaDoce(hora: number, minuto: string): string {
  const periodo = hora < 12 ? 'a. m.' : 'p. m.';
  const h = hora % 12 === 0 ? 12 : hora % 12;
  return `${h}:${minuto} ${periodo}`;
}

/** Fecha de hoy en Colombia como `YYYY-MM-DD`, para formularios y nombres de archivo. */
export function fechaHoyLocal(): string {
  const { anio, mes, dia } = componentes(new Date());
  return `${anio}-${mes}-${dia}`;
}

/** El valor como `YYYY-MM-DD` en Colombia, o cadena vacía si no hay fecha. */
export function aFechaISO(valor: Entrada): string {
  if (typeof valor === 'string' && SOLO_FECHA.test(valor.trim())) return valor.trim();
  const instante = aInstante(valor);
  if (!instante) return '';
  const { anio, mes, dia } = componentes(instante);
  return `${anio}-${mes}-${dia}`;
}

/** `16/09/2026`. Una fecha documental se muestra tal cual, sin desplazarla. */
export function formatearFecha(valor: Entrada): string {
  if (typeof valor === 'string') {
    const soloFecha = SOLO_FECHA.exec(valor.trim());
    if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  }
  const instante = aInstante(valor);
  if (!instante) return SIN_FECHA;
  const { anio, mes, dia } = componentes(instante);
  return `${dia}/${mes}/${anio}`;
}

/** `8:21 a. m.`, en hora de Colombia. */
export function formatearHora(valor: Entrada): string {
  const instante = aInstante(valor);
  if (!instante) return SIN_FECHA;
  const { hora, minuto } = componentes(instante);
  return horaDoce(hora, minuto);
}

/** `16/09/2026 8:21 a. m.`, en hora de Colombia. */
export function formatearFechaHora(valor: Entrada): string {
  const instante = aInstante(valor);
  if (!instante) return SIN_FECHA;
  const { anio, mes, dia, hora, minuto } = componentes(instante);
  return `${dia}/${mes}/${anio} ${horaDoce(hora, minuto)}`;
}

/**
 * `hace 2 horas`, `hace 6 días`, `ayer`.
 *
 * Para marcas de tiempo cuya pregunta real es "¿esto está reciente?" y no "¿qué
 * día exactamente?". Una fecha con hora obliga a restar mentalmente; esto
 * responde de una vez. Pasadas cuatro semanas deja de tener sentido contar días y
 * se cae a la fecha completa.
 *
 * Se apoya en `Intl.RelativeTimeFormat`, que ya conjuga en español, en vez de
 * armar los plurales a mano.
 */
const RELATIVO = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });

export function hace(valor: Entrada, ahora: Date = new Date()): string {
  const instante = aInstante(valor);
  if (!instante) return SIN_FECHA;

  const segundos = Math.round((instante.getTime() - ahora.getTime()) / 1000);
  const absoluto = Math.abs(segundos);

  if (absoluto < 60) return 'hace un momento';
  if (absoluto < 3600) return RELATIVO.format(Math.round(segundos / 60), 'minute');
  if (absoluto < 86400) return RELATIVO.format(Math.round(segundos / 3600), 'hour');
  if (absoluto < 2419200) return RELATIVO.format(Math.round(segundos / 86400), 'day');
  return formatearFecha(instante);
}
