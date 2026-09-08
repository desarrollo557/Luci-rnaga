/**
 * Tokens de visualización de datos.
 *
 * La paleta categórica está validada con el verificador de la guía de dataviz
 * contra la superficie real de los gráficos (tarjetas blancas, #ffffff):
 * banda de luminosidad, piso de croma, separación bajo protanopía/deuteranopía
 * (ΔE 9.1) y piso de visión normal (ΔE 22.9) — todos PASS.
 *
 * Aviso del validador: sobre blanco, aqua (2.82:1) y ámbar (2.17:1) quedan por
 * debajo de 3:1. La regla de alivio obliga a etiquetas visibles, y por eso todos
 * los gráficos de este módulo rotulan sus valores directamente.
 *
 * El rojo de marca (--color-primary-600) NO se usa como color de serie: colisiona
 * con el rojo de estado "crítico". Se reserva para identidad de interfaz.
 */

export const SERIES = {
  /** Slot 1 — azul. Serie principal (volumen digitado). */
  uno: '#2a78d6',
  /** Slot 2 — naranja. */
  dos: '#eb6834',
  /** Slot 3 — aqua. Revisión aprobada. */
  tres: '#1baf7a',
  /** Slot 4 — ámbar. */
  cuatro: '#eda100',
} as const;

/** Orden fijo de asignación: nunca se cicla ni se generan tonos nuevos. */
export const SERIES_ORDEN = [SERIES.uno, SERIES.dos, SERIES.tres, SERIES.cuatro];

/** Escala de estado: significado reservado, siempre acompañada de icono o rótulo. */
export const ESTADO = {
  bueno: '#0ca30c',
  advertencia: '#fab219',
  serio: '#ec835a',
  critico: '#d03b3b',
} as const;

/** Cromo del gráfico. Alineado con la escala silver del tema de la aplicación. */
export const CHROME = {
  superficie: '#ffffff',
  tintaPrimaria: '#383d44',
  tintaSecundaria: '#5e6671',
  tintaTenue: '#929aa5',
  rejilla: '#edeef1',
  ejes: '#d9dce1',
  atenuado: '#d9dce1',
} as const;

/** Compacta cifras grandes para rótulos: 81.171 → 81,2 mil. */
export function compacto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString('es-CO');
}

export function conSeparador(n: number): string {
  return n.toLocaleString('es-CO');
}

/** '2025-06' → 'jun 25'. Etiqueta corta para el eje temporal. */
export function etiquetaMes(iso: string): string {
  const [anio, mes] = iso.split('-');
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const idx = Number(mes) - 1;
  if (!anio || idx < 0 || idx > 11) return iso;
  return `${nombres[idx]} ${anio.slice(2)}`;
}

/** Redondea el tope del eje Y a un número limpio (0 / 5.000 / 10.000). */
export function topeEjeY(max: number): number {
  if (max <= 0) return 1;
  const magnitud = 10 ** Math.floor(Math.log10(max));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    const candidato = magnitud * paso;
    if (candidato >= max) return candidato;
  }
  return magnitud * 10;
}
