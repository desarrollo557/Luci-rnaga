import { useCallback, useRef } from 'react';
import { reportesApi } from '@/lib/api';

/**
 * Avisa al servidor de que esta persona está escribiendo de verdad.
 *
 * Tener el software abierto no es trabajar. El panel del líder sabía si alguien
 * estaba conectado y si había guardado algo, pero no si en este momento está
 * llenando el formulario o lo dejó abierto y se fue. Esta es la señal que lo
 * distingue: sale de las teclas, no de la pantalla.
 *
 * **Una petición cada medio minuto como mucho.** Se dispara con cada pulsación,
 * y digitar son cientos por minuto: mandarlas todas convertiría el formulario
 * más usado del sistema en una fuente de tráfico. Con medio minuto de margen, la
 * pantalla del líder se entera igual y el coste es una petición mínima.
 *
 * **Nunca estorba a quien digita.** No espera la respuesta y se traga los
 * errores: si el aviso falla, lo que se pierde es un color en una tabla.
 */

/** Cada cuánto se vuelve a avisar mientras la persona sigue escribiendo. */
export const SEGUNDOS_ENTRE_LATIDOS = 30;

export function useLatidoDeEscritura(caja: string) {
  const ultimoEnvio = useRef(0);

  return useCallback(() => {
    const ahora = Date.now();
    if (ahora - ultimoEnvio.current < SEGUNDOS_ENTRE_LATIDOS * 1000) return;
    ultimoEnvio.current = ahora;
    void reportesApi.escribiendo(caja).catch(() => {
      // Vuelve a intentarse con la siguiente tecla pasado el medio minuto.
      ultimoEnvio.current = 0;
    });
  }, [caja]);
}
