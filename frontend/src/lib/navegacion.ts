/**
 * A dónde vuelve el botón "atrás" de una vista de caja.
 *
 * La jerarquía del software es Cliente → Acta → Caja → Digitación/Revisión,
 * pero las dos últimas vistas cuelgan de rutas planas (`/cajas/:id/datos` y
 * `/cajas/:id/revision`) que por sí solas no dicen de qué acta vienen. Antes el
 * retorno salía únicamente de `location.state`, y donde ese dato no llegaba
 * —entrar por el enlace directo, abrir la URL a mano, llegar desde Mi Panel— el
 * botón caía en `/clientes`: decía "Volver a Cajas" y saltaba dos niveles de
 * golpe hasta la lista de clientes.
 *
 * Ahora el destino se resuelve en dos pasos: la vista de la que se vino, si se
 * conoce, y si no, el acta de la propia caja, que se deriva del dato y está
 * disponible siempre. Solo si la caja no tiene acta se cae a `/clientes`.
 */

/** Caja mínima para resolver el retorno: `id_modulo_caja` es el id de su acta. */
export interface CajaConActa {
  id_modulo_caja?: number | null;
}

export interface Retorno {
  /** Ruta de destino. */
  to: string;
  /** Texto del botón, que nombra a dónde lleva de verdad. */
  label: string;
}

const ETIQUETAS: Array<[RegExp, string]> = [
  [/^\/mi-panel$/, 'Volver a Mi Panel'],
  [/^\/clientes$/, 'Volver a Clientes'],
  [/^\/clientes\/[^/]+\/actas$/, 'Volver al acta'],
  [/^\/clientes\/[^/]+\/actas\/[^/]+\/cajas$/, 'Volver a la caja'],
];

/** Nombre de la vista a la que lleva una ruta interna. */
export function etiquetaDeRuta(ruta: string): string {
  return ETIQUETAS.find(([patron]) => patron.test(ruta))?.[1] ?? 'Volver';
}

/**
 * Ruta interna de la que se vino, o `null`.
 *
 * Solo se acepta una ruta propia de la aplicación: `//otro-sitio` y las URL
 * absolutas se descartan para que el state de navegación no pueda mandar a
 * nadie fuera.
 */
export function origenInterno(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  return from;
}

/** Vista del acta a la que pertenece la caja. */
export function rutaDelActa(caja: CajaConActa | undefined | null): string | null {
  const acta = caja?.id_modulo_caja;
  return acta ? `/clientes/${acta}/actas` : null;
}

/** Retorno de una vista de caja: de dónde se vino o, si no consta, su acta. */
export function retornoDeCaja(state: unknown, caja: CajaConActa | undefined | null): Retorno {
  const destino = origenInterno(state) ?? rutaDelActa(caja) ?? '/clientes';
  return { to: destino, label: etiquetaDeRuta(destino) };
}
