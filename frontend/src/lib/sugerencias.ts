/**
 * Completar un campo con lo que ya se escribió en la caja, pulsando Tab.
 *
 * En una caja con varios valores distintos en la misma columna —hay cajas con
 * veintinueve asuntos automáticos en treinta registros— el campo no se hereda,
 * se reconoce: se teclean dos o tres letras y el resto ya está escrito en algún
 * registro anterior. Esto es lo que permite traerlo sin soltar el teclado ni
 * bajar por la lista del navegador.
 *
 * Tab y no Enter: en un formulario Enter guarda, y aquí el gesto es el de
 * seguir llenando. Además Tab ya lleva a la casilla siguiente, así que el
 * mismo golpe completa el campo y avanza, que es como se digita de corrido.
 */

/**
 * La sugerencia con la que se completaría lo escrito, o `null` si no hay nada
 * que completar.
 *
 * Se compara sin mayúsculas porque los valores se guardan en mayúsculas y quien
 * digita los escribe como le salen. Devuelve la primera que empieza por lo
 * tecleado —llegan ordenadas del servidor—, y nada cuando lo escrito ya es esa
 * sugerencia: completar algo que ya está completo sería una pulsación perdida.
 */
export function completarConSugerencia(
  escrito: string,
  sugerencias: readonly string[] | undefined,
): string | null {
  const texto = escrito.trim().toUpperCase();
  if (!texto || !sugerencias?.length) return null;
  const encontrada = sugerencias.find((sugerencia) => sugerencia.trim().toUpperCase().startsWith(texto));
  if (!encontrada) return null;
  return encontrada.trim().toUpperCase() === texto ? null : encontrada;
}

/** Hasta dónde se enseña la sugerencia en la pista de debajo del campo. */
const LARGO_DE_LA_PISTA = 32;

/**
 * La pista que se muestra bajo el campo: qué va a poner Tab.
 *
 * Sin ella, el atajo no existe para quien no lo sepa de antemano. Se recorta
 * porque el formulario es una cuadrícula apretada y una pista de tres renglones
 * mueve la fila entera.
 */
export function pistaDeCompletado(sugerencia: string | null): string | undefined {
  if (!sugerencia) return undefined;
  const corta =
    sugerencia.length > LARGO_DE_LA_PISTA ? `${sugerencia.slice(0, LARGO_DE_LA_PISTA - 1)}…` : sugerencia;
  return `Tab completa: ${corta}`;
}
