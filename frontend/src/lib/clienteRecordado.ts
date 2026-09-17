/**
 * El cliente elegido en Clientes, recordado entre pantallas.
 *
 * Clientes es la puerta de todo lo demás: se elige un cliente, se entra en una
 * de sus actas, de ahí a una caja, y se vuelve. Antes cada vuelta a `/clientes`
 * arrancaba con el selector vacío y había que buscar otra vez al cliente en el
 * que se estaba trabajando. Es un clic de más en cada viaje, y en una jornada
 * son muchos viajes.
 *
 * Dos fuentes, por este orden:
 *
 * 1. La URL: `/clientes?cliente=5`. La pone el botón de volver de la vista de
 *    un acta, que sabe de qué cliente es el acta, y la mantiene al día la
 *    propia pantalla de Clientes cada vez que cambia el selector. Manda sobre lo
 *    recordado para que la vuelta sea exacta aunque se haya llegado al acta por
 *    otro camino (Mi Panel, un enlace pegado) y para que dos pestañas con
 *    clientes distintos no se pisen.
 * 2. Lo recordado en `localStorage`, por cuenta: cubre el menú lateral, que
 *    lleva a `/clientes` a secas, y una pestaña nueva.
 */

export const PARAMETRO_CLIENTE = 'cliente';

const PREFIJO_CLAVE = 'luciernaga.clientes.seleccionado';

/** Una clave por cuenta: quien entre después en el mismo navegador no hereda el cliente de otra persona. */
function claveDe(cc: string | null | undefined): string {
  return cc ? `${PREFIJO_CLAVE}:${cc}` : PREFIJO_CLAVE;
}

/** Un id de cliente válido (entero positivo), o `null`. */
export function idDeCliente(valor: unknown): number | null {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return numero > 0 ? numero : null;
}

/** El cliente que trae la URL, si lo trae. */
export function clienteDeUrl(search: URLSearchParams): number | null {
  return idDeCliente(search.get(PARAMETRO_CLIENTE));
}

export function leerClienteRecordado(cc: string | null | undefined): number | null {
  try {
    return idDeCliente(localStorage.getItem(claveDe(cc)));
  } catch {
    return null;
  }
}

/** Guarda la elección; con `null` la olvida, para que la próxima visita arranque como se dejó. */
export function recordarCliente(cc: string | null | undefined, clienteId: number | null): void {
  try {
    if (clienteId === null) localStorage.removeItem(claveDe(cc));
    else localStorage.setItem(claveDe(cc), String(clienteId));
  } catch {
    // Sin almacenamiento solo se pierde la comodidad de recordarlo.
  }
}

/** La ruta de Clientes con el cliente ya elegido, o a secas si no se conoce. */
export function rutaDeClientes(clienteId?: number | null): string {
  return clienteId ? `/clientes?${PARAMETRO_CLIENTE}=${clienteId}` : '/clientes';
}
