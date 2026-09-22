import { formatearFecha } from '@/lib/fechas';

/**
 * Cómo se cuenta el estado de una caja en la interfaz.
 *
 * Guardar un registro abre la caja; cerrarla es siempre una decisión de la
 * persona ("terminé esta caja"), nunca del servidor (ver
 * `cicloCaja.service.ts`): ninguna caja se cierra sola. Aquí solo se traduce
 * ese estado a algo que se entienda de un vistazo, y sobre todo se hace
 * visible lo que antes no se veía: que una caja viene de días anteriores y
 * sigue abierta.
 *
 * Vive aparte de las pantallas porque lo usan dos, la digitación y el panel de
 * la técnica, y tienen que decir exactamente lo mismo.
 */

export const CAJA_EN_PROCESO = 'EN PROCESO';
export const CAJA_FINALIZADA = 'FINALIZADO';

export interface EstadoDeCaja {
  etiqueta: string;
  color: 'amber' | 'green' | 'gray';
  /** Frase de apoyo, o `null` si la etiqueta ya lo dice todo. */
  detalle: string | null;
  /** La caja se empezó un día anterior y sigue abierta. */
  continuada: boolean;
}

export interface DatosDeCaja {
  estado: string | null | undefined;
  /** Cuántos registros lleva la caja. */
  registros?: number;
  /** Fecha del primer registro, para saber si viene de días anteriores. */
  desde?: string | null;
  /** Jornada a la que se atribuyó el cierre. */
  fechaFinalizacion?: string | null;
  /** Quién la reabrió a mano ("NOMBRE (CC)"), si es el caso. */
  reabiertaPor?: string | null;
}

/** El nombre sin la cédula que lleva pegada en la firma. */
const soloNombre = (firma: string) => firma.replace(/\s*\([^)]*\)\s*$/, '').trim() || firma;

const plural = (n: number, singular: string, plural_: string) =>
  `${n.toLocaleString('es-CO')} ${n === 1 ? singular : plural_}`;

export function estadoDeCaja(
  { estado, registros, desde, fechaFinalizacion, reabiertaPor }: DatosDeCaja,
  hoy: string,
): EstadoDeCaja {
  const conteo = typeof registros === 'number' ? plural(registros, 'registro', 'registros') : null;

  if (estado === CAJA_FINALIZADA) {
    return {
      etiqueta: 'Terminada',
      color: 'green',
      detalle: fechaFinalizacion ? `Terminada el ${formatearFecha(fechaFinalizacion)}` : conteo,
      continuada: false,
    };
  }

  if (estado === CAJA_EN_PROCESO) {
    // Que la caja venga de otro día es lo que de verdad hay que ver: significa
    // que quedó a medias y se está continuando.
    const continuada = Boolean(desde && desde < hoy);
    // Reabierta a mano por el líder: hay que verlo, porque es lo que permite
    // corregir lo de días anteriores, y dura solo mientras la caja siga abierta.
    if (reabiertaPor) {
      return {
        etiqueta: 'Reabierta',
        color: 'amber',
        detalle: `Reabierta por ${soloNombre(reabiertaPor)} para corregir registros${conteo ? ` · ${conteo}` : ''}`,
        continuada,
      };
    }
    return {
      etiqueta: 'En proceso',
      color: 'amber',
      detalle: continuada
        ? `Se continúa desde el ${formatearFecha(desde)}${conteo ? ` · ${conteo}` : ''}`
        : conteo,
      continuada,
    };
  }

  return { etiqueta: 'Sin empezar', color: 'gray', detalle: null, continuada: false };
}
