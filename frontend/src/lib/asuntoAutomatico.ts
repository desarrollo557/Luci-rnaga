import { esValorVacio } from '@/lib/camposVacios';
import type { FuidDato } from '@/types';

/**
 * Cómo se ofrece el asunto automático en la digitación.
 *
 * Una caja suele contener documentos del mismo asunto, así que el formulario lo
 * hereda del registro anterior y no hay nada que elegir. Pero hay cajas
 * mezcladas —en el archivo son la excepción, no la rareza— donde conviven dos,
 * tres o cinco asuntos, y ahí heredar uno solo obliga a borrarlo y volver a
 * teclear el otro en cada registro. Eso es el trabajo repetido más caro de esas
 * cajas, y lo que estas reglas evitan.
 *
 * Vive aparte del formulario para poder probarse sin montar la pantalla, como
 * el resto de las reglas de la interfaz.
 */

/**
 * Desde cuántos asuntos automáticos distintos la caja deja de ser de un solo
 * asunto y el campo pasa a ser un selector.
 *
 * Dos. Con uno solo no hay nada que elegir: el heredado ya es el bueno y el
 * campo de texto no estorba. Con dos ya hay que alternar entre ellos en cada
 * registro, que es justo lo que esto viene a ahorrar.
 */
export const ASUNTOS_PARA_SELECTOR = 2;

/**
 * Lo que se elige en el selector para escribir un asunto que la caja todavía no
 * tiene. No puede chocar con ninguno real: los asuntos se guardan en mayúsculas
 * y ninguno empieza por guión bajo.
 */
export const ASUNTO_NUEVO = '__ESCRIBIR_OTRO__';

/**
 * Los asuntos automáticos distintos que ya tiene la caja, en el orden en que
 * aparecieron.
 *
 * El orden es el de la digitación —por número de orden— y no el alfabético,
 * porque quien está digitando reconoce antes «el que venía usando» que una
 * lista ordenada por letra.
 *
 * El marcador `N/A` no cuenta: es como se guarda lo que nadie diligenció, no un
 * asunto que alguien pueda querer repetir. Tampoco se distinguen dos asuntos
 * que solo difieran en espacios de sobra.
 */
export function asuntosAutomaticosDe(registros: readonly FuidDato[]): string[] {
  const vistos = new Set<string>();
  const enOrden = [...registros].sort((uno, otro) => (uno.n_orden ?? 0) - (otro.n_orden ?? 0));
  for (const registro of enOrden) {
    const asunto = (registro.asunto_2 ?? '').trim();
    if (asunto && !esValorVacio(asunto)) vistos.add(asunto);
  }
  return [...vistos];
}

/**
 * Si el campo se ofrece como selector en vez de como campo de texto.
 *
 * Deja de serlo en cuanto se pide escribir uno nuevo: mientras dura ese
 * registro manda el campo de texto, y al guardarlo el asunto recién escrito ya
 * es uno de los de la caja y vuelve el selector con él dentro.
 */
export function seEligeDeLaLista(asuntos: readonly string[], escribiendoUnoNuevo: boolean): boolean {
  return !escribiendoUnoNuevo && asuntos.length >= ASUNTOS_PARA_SELECTOR;
}
