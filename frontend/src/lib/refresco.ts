/**
 * Refresco en caliente de los módulos que muestran trabajo compartido.
 *
 * El problema: una técnica digita un registro y quien tiene abierto Inventario o
 * Producción no lo ve hasta que recarga la página. Dentro de una misma pestaña se
 * resuelve invalidando al guardar, pero el trabajo del resto del equipo entra sin
 * que esta pestaña se entere de nada.
 *
 * Por qué se consulta cada tanto y no se recibe un aviso del servidor: una
 * conexión abierta permanentemente —SSE o WebSocket— mantendría despierto el
 * servicio de Render, que está en el plan gratuito y se duerme a los 15 minutos
 * sin tráfico, consumiendo las horas del mes mucho más rápido. Además añade
 * gestión de reconexiones para acortar unos segundos una espera que aquí no le
 * cuesta nada a nadie. Si algún día el servicio pasa a un plan de pago y hace
 * falta que sea instantáneo, este es el sitio por donde empezar.
 *
 * Las consultas periódicas **se detienen cuando la pestaña no está en primer
 * plano**: es el comportamiento por defecto de TanStack Query, y es lo que evita
 * que una pestaña olvidada siga pidiendo datos toda la tarde. Al volver a ella,
 * `refetchOnWindowFocus` ya trae lo último de inmediato.
 */

/**
 * Cada cuánto se vuelve a preguntar por los datos que cambian solos.
 *
 * Quince segundos es el punto en el que el cambio se siente inmediato sin que la
 * pestaña se convierta en una fuente de tráfico. Sube este número si el servicio
 * empieza a quedarse corto de horas; bájalo si hace falta que se note antes.
 */
export const INTERVALO_REFRESCO_MS = 15_000;

/**
 * Cada cuánto debe refrescarse una consulta, para poner en `refetchInterval`:
 *
 * ```ts
 * useQuery({ queryKey: ['inventario'], queryFn: …, refetchInterval: intervaloRefresco() })
 * ```
 *
 * `activo` lo apaga cuando lo que se mira no puede haber cambiado, por ejemplo
 * un diálogo cerrado: preguntar por datos que nadie está viendo es tráfico
 * regalado. Devuelve `undefined`, no `false`, porque los dos apagan el intervalo
 * y `undefined` encaja mejor en una propiedad opcional.
 *
 * Se devuelve el número en vez de un objeto de opciones para extender sobre la
 * consulta: al extenderlo, TypeScript perdía el tipo de los datos y `data`
 * acababa siendo un objeto vacío en las pantallas que lo usaban.
 *
 * No hace falta tocar `refetchIntervalInBackground`: su valor por defecto ya
 * detiene las consultas cuando la pestaña no está en primer plano, que es
 * justo lo que se quiere.
 */
export function intervaloRefresco(activo = true): number | undefined {
  return activo ? INTERVALO_REFRESCO_MS : undefined;
}
