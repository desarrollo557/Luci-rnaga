/**
 * Búsqueda por texto sobre listas que ya están cargadas en la pantalla.
 *
 * Dos decisiones que la hacen útil de verdad y que no trae `includes` a secas:
 *
 * - **Los acentos no estorban.** Todo se guarda en mayúsculas, así que buscar
 *   "prorroga" tiene que encontrar "PRÓRROGA": quien escribe rápido no pone
 *   tildes, y un buscador que no perdona eso se abandona a la segunda vez.
 * - **Varias palabras son una condición conjunta, y en cualquier orden.**
 *   "contrato 2024" encuentra lo que lleva las dos cosas, aunque estén en
 *   campos distintos y separadas. Es lo que se espera al ir acotando: se añade
 *   una palabra y la lista se estrecha.
 */

/** Minúsculas y sin tildes, para comparar sin depender de cómo se escribió. */
export function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Las palabras de la consulta, ya normalizadas. Una consulta vacía no filtra. */
export function terminosDe(consulta: string): string[] {
  return normalizar(consulta).split(/\s+/).filter(Boolean);
}

/** Texto único y normalizado con todos los campos que se quieren buscar. */
export function textoBuscable(campos: readonly unknown[]): string {
  return campos.map(normalizar).join(' ');
}

/** `true` si el texto contiene todas las palabras buscadas. */
export function contieneTodos(texto: string, terminos: readonly string[]): boolean {
  return terminos.every((termino) => texto.includes(termino));
}

/**
 * Filtra una lista con los campos que decida quien llama.
 *
 * Sin consulta devuelve la misma lista, sin copiarla: filtrar por nada no debe
 * costar nada ni romper las comparaciones por referencia de React.
 */
export function filtrarPorTexto<T>(
  items: T[],
  consulta: string,
  camposDe: (item: T) => readonly unknown[],
): T[] {
  const terminos = terminosDe(consulta);
  if (terminos.length === 0) return items;
  return items.filter((item) => contieneTodos(textoBuscable(camposDe(item)), terminos));
}
