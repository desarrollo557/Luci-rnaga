/**
 * Tokens de visualización de datos.
 *
 * Los valores son variables CSS (`--chart-*`, definidas en index.css) en lugar de
 * hexadecimales fijos: así una misma serie cambia de tono al pasar a tema oscuro
 * sin que ningún gráfico tenga que enterarse. Se pueden usar igual en atributos
 * SVG (`fill`, `stroke`) y en `style`.
 *
 * La paleta categórica está validada con el verificador de la guía de dataviz
 * contra la superficie clara de los gráficos (#ffffff): banda de luminosidad,
 * piso de croma, separación bajo protanopía/deuteranopía (ΔE 9.1) y piso de
 * visión normal (ΔE 22.9) — todos PASS. La variante oscura aclara cada serie
 * manteniendo el mismo tono y orden para no romper esa separación.
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
  uno: 'var(--chart-serie-1)',
  /** Slot 2 — naranja. */
  dos: 'var(--chart-serie-2)',
  /** Slot 3 — aqua. Revisión aprobada. */
  tres: 'var(--chart-serie-3)',
  /** Slot 4 — ámbar. */
  cuatro: 'var(--chart-serie-4)',
} as const;

/** Orden fijo de asignación: nunca se cicla ni se generan tonos nuevos. */
export const SERIES_ORDEN = [SERIES.uno, SERIES.dos, SERIES.tres, SERIES.cuatro];

/** Escala de estado: significado reservado, siempre acompañada de icono o rótulo. */
export const ESTADO = {
  bueno: 'var(--chart-bueno)',
  advertencia: 'var(--chart-advertencia)',
  serio: 'var(--chart-serio)',
  critico: 'var(--chart-critico)',
} as const;

/** Cromo del gráfico. Alineado con la escala silver del tema de la aplicación. */
export const CHROME = {
  superficie: 'var(--chart-superficie)',
  tintaPrimaria: 'var(--chart-tinta-primaria)',
  tintaSecundaria: 'var(--chart-tinta-secundaria)',
  tintaTenue: 'var(--chart-tinta-tenue)',
  rejilla: 'var(--chart-rejilla)',
  ejes: 'var(--chart-ejes)',
  atenuado: 'var(--chart-atenuado)',
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
/**
 * `2026-09-18` → `18 sep`. Sin el año a propósito: la curva por día cubre unas
 * pocas semanas y repetir el año en treinta etiquetas solo estrecha el hueco
 * de cada una.
 */
export function etiquetaDia(iso: string): string {
  const [, mes, dia] = iso.split('-');
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const idx = Number(mes) - 1;
  if (!dia || idx < 0 || idx > 11) return iso;
  return `${Number(dia)} ${nombres[idx]}`;
}

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
