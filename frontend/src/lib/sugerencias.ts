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

/**
 * Cuántos registros trae la lista de la caja de una vez.
 *
 * Es el tope por omisión del servidor (`listFuid`). Importa aquí porque las
 * sugerencias salen de esos registros: mientras la caja quepa entera —la más
 * grande de la base lleva 247— lo que hay en pantalla es todo lo que hay, y no
 * hace falta preguntar nada.
 */
export const TOPE_DE_LA_LISTA = 500;

/** Los campos del FUID de los que se guardan sugerencias, con su valor por registro. */
type RegistroConCampos = Record<string, unknown>;

/**
 * Lo ya escrito en la caja, campo por campo, sacado de los registros que la
 * pantalla ya tiene.
 *
 * Antes cada tecla salía a preguntarle al servidor: 300 ms de espera para no
 * disparar una consulta por letra, más la consulta contra Supabase, que sola
 * tarda unos 70 ms. Medio segundo largo desde que se deja de teclear hasta que
 * aparece algo, y el gesto que esto tiene que servir es «tres letras, Tab».
 *
 * Los registros de la caja ya están cargados para pintar la tabla de abajo, así
 * que las sugerencias salen de ahí: sin red, sin espera y sin una petición por
 * cada letra de cada campo.
 */
export function sugerenciasDeLosRegistros(
  registros: readonly RegistroConCampos[],
  campos: readonly string[],
): Record<string, string[]> {
  const porCampo = new Map<string, Set<string>>(campos.map((campo) => [campo, new Set()]));
  for (const registro of registros) {
    for (const campo of campos) {
      const valor = String(registro[campo] ?? '').trim();
      if (valor && valor.toUpperCase() !== 'N/A') porCampo.get(campo)?.add(valor);
    }
  }
  const mapa: Record<string, string[]> = {};
  for (const [campo, valores] of porCampo) mapa[campo] = [...valores].sort((a, b) => a.localeCompare(b, 'es'));
  return mapa;
}

/** Cuántas sugerencias se ofrecen: las mismas ocho que devolvía el servidor. */
const CUANTAS_SE_OFRECEN = 8;

/** Las de la caja que empiezan por lo tecleado, sin distinguir mayúsculas. */
export function filtrarPorInicio(valores: readonly string[], escrito: string): string[] {
  const texto = escrito.trim().toUpperCase();
  if (!texto) return [];
  return valores.filter((valor) => valor.toUpperCase().startsWith(texto)).slice(0, CUANTAS_SE_OFRECEN);
}
