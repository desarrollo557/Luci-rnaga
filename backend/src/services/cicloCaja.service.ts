/**
 * Ciclo de vida de la caja: se abre al digitar en ella y se cierra sola cuando
 * quien la tenía pasa a otra.
 *
 * Nace de una necesidad del seguimiento de inventario: saber cuántas cajas
 * terminó de verdad cada persona cada día, y cuál quedó a medias para
 * continuarla al día siguiente. La respuesta no podía costar clics. Este es un
 * software operativo y pedirle a quien digita que además marque el final de
 * cada caja es trabajo que nadie hace de forma fiable: se olvida, y entonces el
 * informe miente.
 *
 * Así que el estado **se deduce de lo que la persona ya hace**:
 *
 * - Guardar un registro en una caja la pone EN PROCESO. Si estaba cerrada, se
 *   reabre: alguien volvió a trabajarla.
 * - Guardar un registro en **otra** caja cierra la anterior, porque en esta
 *   operación se trabaja una caja a la vez y empezar la siguiente demuestra que
 *   la anterior acabó.
 * - La única caja que queda abierta es aquella en la que se está trabajando.
 *   Eso es exactamente "la continúo mañana", y no cuesta ninguna acción.
 *
 * Dos decisiones que sostienen todo lo demás:
 *
 * **La fecha de cierre no es el día en que se cierra, sino el del último
 * registro de la caja.** Una caja terminada el viernes que se cierra el lunes,
 * cuando su dueña abre la siguiente, pertenece al viernes. Sin esto, el trabajo
 * del viernes aparecería en el lunes y el informe de la semana saldría torcido.
 *
 * **Solo cierra la caja quien digitó su último registro.** Dos técnicas pueden
 * compartir caja; si una pasa a otra y la otra sigue dentro, la caja no se
 * cierra. El cierre lo provoca quien la tenía en las manos.
 *
 * La deducción se corrige sola: si alguien vuelve a digitar en una caja cerrada,
 * esta se reabre y volverá a cerrarse con la fecha nueva.
 *
 * **Para qué sirve este estado y para qué no.** Sirve para la pantalla: saber en
 * qué caja va cada quien, avisar de que una viene de días anteriores y ofrecer
 * retomarla. **No** sirve para contar producción, y el seguimiento de inventario
 * no lo usa: ese deduce a qué jornada pertenece cada caja del último registro de
 * la caja, porque así también cuenta bien todo lo que se digitó antes de que
 * este estado existiera. Fiarlo al estado guardado dejaba el histórico en cero.
 *
 * **Coste en el camino de digitación.** Guardar un registro es la operación más
 * repetida del software, así que aquí se hace lo mínimo: una actualización por
 * número de caja, que está indexado. La pasada de cierre, que es la cara, solo
 * corre cuando la caja acaba de abrirse, es decir cuando la persona cambió de
 * caja. Mientras sigue en la misma —el caso normal, decenas de veces seguidas—
 * no se ejecuta.
 */

/**
 * Cómo se lanza cada consulta: con el pool o dentro de una transacción.
 *
 * Devuelve cuántas filas cambió, que es lo que permite saltarse la pasada de
 * cierre cuando la persona sigue en la misma caja.
 */
export type EjecutarSql = (sql: string, params: unknown[]) => Promise<number>;

export const CAJA_EN_PROCESO = 'EN PROCESO';
export const CAJA_FINALIZADA = 'FINALIZADO';

/**
 * El último registro de una caja, que es quien decide a qué jornada pertenece.
 *
 * `created_at` ordena de verdad el trabajo; los registros heredados de la base
 * antigua no lo tienen, y por eso van primero (son los más viejos) con el `id`
 * como desempate.
 */
const ULTIMO_REGISTRO = `
  SELECT f.fecha_del_dato, f.elaborado_por
    FROM fuiddatosreal f
   WHERE f.caja = $CAJA$
   ORDER BY f.created_at DESC NULLS LAST, f.id DESC
   LIMIT 1`;

/** Abre la caja en la que se acaba de digitar. No hace nada si ya estaba abierta. */
export const SQL_ABRIR_CAJA = `
  UPDATE modulos_caja
     SET estado_caja = '${CAJA_EN_PROCESO}',
         fecha_finalizacion = NULL,
         finalizada_por = NULL
   WHERE caja_modulo = ?
     AND estado_caja IS DISTINCT FROM '${CAJA_EN_PROCESO}'`;

/**
 * Cierra las cajas que esta persona tenía abiertas y ya no está trabajando.
 *
 * Parte de las cajas abiertas, que son pocas, y de cada una mira su último
 * registro. Se cierran solo aquellas cuyo último registro es de esta persona:
 * las de otras se quedan como están.
 */
export const SQL_CERRAR_OTRAS_CAJAS = `
  UPDATE modulos_caja mc
     SET estado_caja = '${CAJA_FINALIZADA}',
         fecha_finalizacion = ultimo.fecha_del_dato,
         finalizada_por = ultimo.elaborado_por
    FROM modulos_caja abierta
    CROSS JOIN LATERAL (${ULTIMO_REGISTRO.replace('$CAJA$', 'abierta.caja_modulo')}) ultimo
   WHERE mc.id = abierta.id
     AND abierta.estado_caja = '${CAJA_EN_PROCESO}'
     AND abierta.caja_modulo <> ?
     AND ultimo.elaborado_por = ?
     AND ultimo.fecha_del_dato IS NOT NULL`;

/**
 * Cierre a mano de una caja concreta, para el botón de cambiar estado.
 *
 * La fecha y la persona salen igualmente del último registro, no de quien pulsa
 * ni del día en que pulsa: el seguimiento tiene que atribuir esa caja a la
 * jornada en que se trabajó. Una caja sin registros se cierra con el día de hoy
 * y sin nadie a quien atribuirla.
 */
export const SQL_CERRAR_CAJA = `
  UPDATE modulos_caja mc
     SET estado_caja = '${CAJA_FINALIZADA}',
         fecha_finalizacion = COALESCE(ultimo.fecha_del_dato, CURRENT_DATE),
         finalizada_por = ultimo.elaborado_por
    FROM modulos_caja objetivo
    LEFT JOIN LATERAL (${ULTIMO_REGISTRO.replace('$CAJA$', 'objetivo.caja_modulo')}) ultimo ON TRUE
   WHERE mc.id = objetivo.id
     AND objetivo.id = ?`;

/** Reapertura a mano: la caja vuelve a estar en proceso y pierde su cierre. */
export const SQL_REABRIR_CAJA = `
  UPDATE modulos_caja
     SET estado_caja = '${CAJA_EN_PROCESO}',
         fecha_finalizacion = NULL,
         finalizada_por = NULL
   WHERE id = ?`;

/**
 * Lo que hay que hacer con las cajas cada vez que se guarda un registro.
 *
 * Se llama dentro de la misma transacción que la inserción: si el registro no
 * llega a guardarse, el estado de las cajas tampoco cambia.
 */
export async function registrarDigitacion(
  ejecutar: EjecutarSql,
  caja: string | null | undefined,
  autor: string | null | undefined,
): Promise<void> {
  if (!caja || !autor) return;
  const seAbrio = await ejecutar(SQL_ABRIR_CAJA, [caja]);
  /*
   * Si la caja ya estaba abierta, la persona sigue donde estaba y no hay nada
   * que cerrar. Saltarse la pasada aquí es lo que mantiene ligero el guardado.
   *
   * Queda un caso raro sin cubrir: cambiar a una caja que otra persona ya tenía
   * abierta deja la anterior marcada como abierta. Solo afecta a lo que se ve en
   * pantalla, no a lo que cuenta el informe, y se corrige en cuanto esa caja se
   * cierre o se retome.
   */
  if (seAbrio > 0) await ejecutar(SQL_CERRAR_OTRAS_CAJAS, [caja, autor]);
}

/** Cambio de estado a mano desde la pantalla de la caja. */
export async function cambiarEstadoCaja(
  ejecutar: EjecutarSql,
  cajaId: string | number,
  estado: string,
): Promise<void> {
  await ejecutar(estado === CAJA_FINALIZADA ? SQL_CERRAR_CAJA : SQL_REABRIR_CAJA, [cajaId]);
}
