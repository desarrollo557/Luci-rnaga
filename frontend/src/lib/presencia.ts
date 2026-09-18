import { hace } from '@/lib/fechas';

/**
 * En qué anda cada persona ahora mismo.
 *
 * Nace de una contradicción que se veía en pantalla: alguien con treinta
 * registros y su hora de inicio a la vista aparecía como "nunca ha entrado".
 * El motivo era mirar una sola señal, la marca que deja el middleware de
 * actividad, y esa marca está vacía para todo el trabajo anterior a que
 * existiera. **Guardar un registro también es estar dentro**, así que la
 * presencia se calcula con las dos señales: la última petición y el último
 * registro, lo que sea posterior.
 *
 * Y no son dos estados, sino varios, porque al líder le sirven cosas distintas:
 *
 * - *Escribiendo* es quien está pulsando teclas en el formulario ahora mismo.
 *   Es la única prueba de que trabaja y no de que dejó la pantalla abierta, y
 *   por eso va primera: la manda el propio formulario mientras se digita.
 * - *Digitando* es quien guardó un registro hace poco pero ahora no teclea.
 * - *En línea* es quien tiene el software abierto pero lleva rato sin guardar
 *   nada. Antes se confundía con el anterior, y es justo la diferencia entre un
 *   puesto trabajando y uno atascado.
 * - *Inactivo* es quien se levantó hace un momento y probablemente vuelve.
 * - *Fuera* es quien ya no está.
 *
 * El instante se compara contra el reloj del servidor, que llega en la misma
 * respuesta. Contra el del equipo que mira, un portátil desfasado dejaría a
 * todo el mundo fuera y el líder creería que no hay nadie trabajando.
 */

/**
 * Hasta cuándo un aviso de escritura significa que sigue tecleando.
 *
 * El formulario avisa cada medio minuto mientras se escribe, así que dos
 * minutos dan margen de sobra para una pausa normal entre campos sin que la
 * fila parpadee.
 */
export const MINUTOS_ESCRIBIENDO = 2;
/** Hasta cuándo un registro reciente significa que la persona está produciendo. */
export const MINUTOS_DIGITANDO = 10;
/** Hasta cuándo se considera que está delante de la pantalla. */
export const MINUTOS_EN_LINEA = 5;
/** A partir de cuándo se da por terminada su presencia. */
export const MINUTOS_INACTIVO = 30;

export type EstadoDePresencia = 'escribiendo' | 'digitando' | 'en-linea' | 'inactivo' | 'fuera' | 'nunca';

export interface Presencia {
  estado: EstadoDePresencia;
  etiqueta: string;
  color: 'green' | 'amber' | 'gray';
  /** Frase de apoyo, o `null` si la etiqueta ya lo dice todo. */
  detalle: string | null;
}

export interface SeñalesDePresencia {
  /** Última petición al servidor: demuestra que el software está abierto. */
  ultimaActividad?: string | null;
  /** Última tecla pulsada en el formulario: demuestra que está trabajando. */
  ultimaEscritura?: string | null;
  /** Último registro guardado. */
  ultimoRegistro?: string | null;
}

const MINUTO = 60_000;

/** Las marcas llegan de PostgreSQL con espacio en vez de T; ambas formas valen. */
function aInstante(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = new Date(valor.includes('T') ? valor : valor.replace(' ', 'T'));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

const minutosDesde = (instante: Date, ahora: Date) => (ahora.getTime() - instante.getTime()) / MINUTO;

export function presenciaDe(
  { ultimaActividad, ultimaEscritura, ultimoRegistro }: SeñalesDePresencia,
  ahora: Date,
): Presencia {
  const peticion = aInstante(ultimaActividad);
  const escritura = aInstante(ultimaEscritura);
  const registro = aInstante(ultimoRegistro);

  if (!peticion && !escritura && !registro) {
    return { estado: 'nunca', etiqueta: 'Sin actividad', color: 'gray', detalle: null };
  }

  /*
   * Lo primero, porque es la prueba más fuerte: hay teclas ahora mismo. Las
   * otras señales dicen que el software está abierto o que hubo trabajo hace
   * un rato; solo esta dice que la persona está escribiendo en este momento.
   */
  if (escritura && minutosDesde(escritura, ahora) < MINUTOS_ESCRIBIENDO) {
    return { estado: 'escribiendo', etiqueta: 'Escribiendo', color: 'green', detalle: null };
  }

  if (registro && minutosDesde(registro, ahora) < MINUTOS_DIGITANDO) {
    return { estado: 'digitando', etiqueta: 'Digitando', color: 'green', detalle: null };
  }

  // La prueba más reciente de que estuvo usando el software, venga de donde venga.
  const visto = [peticion, escritura, registro]
    .filter((i): i is Date => i !== null)
    .reduce((a, b) => (a > b ? a : b));
  const minutos = minutosDesde(visto, ahora);

  if (minutos < MINUTOS_EN_LINEA) {
    return {
      estado: 'en-linea',
      etiqueta: 'En línea',
      /*
       * Ámbar, y es el único ámbar: tener el software abierto sin guardar nada
       * es lo que el líder tiene que mirar. Los que no están, estén hace diez
       * minutos o hace cinco horas, van en gris; lo que los separa es la
       * etiqueta y el "hace cuánto", no el color.
       */
      color: 'amber',
      // Está en el software pero no guardando: decir desde cuándo es el dato útil.
      detalle: registro ? `sin digitar ${hace(registro, ahora)}` : 'sin digitar todavía',
    };
  }
  if (minutos < MINUTOS_INACTIVO) {
    return { estado: 'inactivo', etiqueta: 'Inactivo', color: 'gray', detalle: hace(visto, ahora) };
  }
  return { estado: 'fuera', etiqueta: 'Fuera', color: 'gray', detalle: hace(visto, ahora) };
}

/** Cuántas personas hay en cada estado, para el resumen de la cabecera. */
export function contarPresencias(
  señales: readonly SeñalesDePresencia[],
  ahora: Date,
): Record<EstadoDePresencia, number> {
  const conteo: Record<EstadoDePresencia, number> = {
    escribiendo: 0,
    digitando: 0,
    'en-linea': 0,
    inactivo: 0,
    fuera: 0,
    nunca: 0,
  };
  for (const señal of señales) conteo[presenciaDe(señal, ahora).estado] += 1;
  return conteo;
}

/**
 * Lo que rinde la persona por hora, sobre el tiempo que de verdad lleva
 * trabajando: de su primer registro al último.
 *
 * Se mide así y no sobre el periodo consultado porque quien entró a las once no
 * ha tenido toda la mañana. Con menos de un cuarto de hora no se devuelve nada:
 * dos registros seguidos darían cifras absurdas y comparables con nada.
 */
export function ritmoPorHora(
  primerRegistro: string | null | undefined,
  ultimoRegistro: string | null | undefined,
  registros: number,
): number | null {
  const inicio = aInstante(primerRegistro);
  const fin = aInstante(ultimoRegistro);
  if (!inicio || !fin || registros < 2) return null;
  const horas = (fin.getTime() - inicio.getTime()) / 3_600_000;
  if (horas < 0.25) return null;
  return Math.round(registros / horas);
}

/** Cuánto lleva trabajando, en horas y minutos. */
export function duracionDeJornada(
  primerRegistro: string | null | undefined,
  ultimoRegistro: string | null | undefined,
): string | null {
  const inicio = aInstante(primerRegistro);
  const fin = aInstante(ultimoRegistro);
  if (!inicio || !fin) return null;
  const minutos = Math.round((fin.getTime() - inicio.getTime()) / MINUTO);
  if (minutos < 1) return null;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
