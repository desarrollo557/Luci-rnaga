/**
 * Ciclo de vida de la caja: se abre al digitar en ella y se cierra solo cuando
 * quien la trabaja la da por terminada.
 *
 * Nace de una necesidad del seguimiento de inventario: saber en qué caja va
 * cada persona, cuáles terminó y cuál quedó a medias. Y de una regla de la
 * operación que se fijó después de probar lo contrario: **ninguna caja se
 * cierra sola**. Hubo una versión que deducía el cierre —guardar en otra caja
 * cerraba la anterior, y al cambiar de jornada se cerraban las que quedaban
 * abiertas— y se retiró: cerraba cajas a medias y obligaba a reabrirlas. Quien
 * sabe si una caja está terminada es quien la tiene en las manos.
 *
 * Así que el estado se mueve con dos cosas, y nada más:
 *
 * - **Guardar un registro en una caja la pone EN PROCESO** si estaba sin
 *   empezar. Eso sí se deduce, porque no es una decisión: digitar en una caja
 *   es trabajarla. A la técnica no le reabre una caja terminada
 *   (`fuiddatosreal.controller.ts` lo rechaza); al líder y al administrador
 *   sí, porque a ellos nadie tiene que autorizarlos.
 * - **Terminarla es un acto de la persona**: "terminé esta caja" en la
 *   digitación (`declararJornadaDeCaja`), o el cambio de estado a mano desde
 *   la vista de la caja. Una caja que quedó abierta el viernes sigue abierta
 *   el lunes, y eso es lo esperado: se continúa sin pedir nada.
 *
 * **La fecha de cierre no es el día en que se cierra, sino el del último
 * registro de la caja.** Una caja terminada el viernes que se cierra el lunes
 * pertenece al viernes. Sin esto, el trabajo del viernes aparecería en el lunes
 * y el informe de la semana saldría torcido. Y se atribuye a quien digitó ese
 * último registro, no a quien pulsa.
 *
 * **La reapertura por el líder abre además la corrección.** Cuando un líder o
 * administrador reabre una caja, a mano o aprobando la solicitud de la técnica
 * (`reaperturaCaja.service.ts`), queda escrito quién y qué día
 * (`reabierta_por`, `reabierta_el`) y la técnica puede corregir sus registros
 * de días anteriores en esa caja mientras siga abierta. Todo cierre borra la
 * marca.
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
 * número de caja, que está indexado, y que no cambia nada si la caja ya estaba
 * abierta, que es el caso normal.
 */

/**
 * Cómo se lanza cada consulta: con el pool o dentro de una transacción.
 * Devuelve cuántas filas cambió.
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
 * Cierre de una caja concreta: "terminé esta caja" o el cambio de estado a
 * mano. Es la única forma en que una caja se cierra.
 *
 * La fecha y la persona salen del último registro, no de quien pulsa ni del
 * día en que pulsa: el seguimiento tiene que atribuir esa caja a la jornada en
 * que se trabajó. Una caja sin registros se cierra con el día de hoy y sin
 * nadie a quien atribuirla. Y se borra la marca de reapertura, si la había:
 * el permiso de corregir dura lo que dura la caja abierta.
 */
export const SQL_CERRAR_CAJA = `
  UPDATE modulos_caja mc
     SET estado_caja = '${CAJA_FINALIZADA}',
         fecha_finalizacion = COALESCE(ultimo.fecha_del_dato, CURRENT_DATE),
         finalizada_por = ultimo.elaborado_por,
         reabierta_por = NULL,
         reabierta_el = NULL
    FROM modulos_caja objetivo
    LEFT JOIN LATERAL (${ULTIMO_REGISTRO.replace('$CAJA$', 'objetivo.caja_modulo')}) ultimo ON TRUE
   WHERE mc.id = objetivo.id
     AND objetivo.id = ?`;

/** Reapertura sin firma: la caja vuelve a estar en proceso y pierde su cierre. */
export const SQL_REABRIR_CAJA = `
  UPDATE modulos_caja
     SET estado_caja = '${CAJA_EN_PROCESO}',
         fecha_finalizacion = NULL,
         finalizada_por = NULL
   WHERE id = ?`;

/**
 * Lo que hay que hacer con la caja cada vez que se guarda un registro: dejarla
 * abierta. Nada más; ninguna otra caja se toca.
 *
 * Se llama dentro de la misma transacción que la inserción: si el registro no
 * llega a guardarse, el estado de la caja tampoco cambia.
 */
export async function registrarDigitacion(
  ejecutar: EjecutarSql,
  caja: string | null | undefined,
  autor: string | null | undefined,
): Promise<void> {
  if (!caja || !autor) return;
  await ejecutar(SQL_ABRIR_CAJA, [caja]);
}

/**
 * Reapertura por el líder o el administrador: además de abrir la caja, deja
 * escrito quién la reabrió y qué día. Es lo que autoriza a la técnica a
 * corregir sus registros de días anteriores en esa caja mientras siga abierta;
 * el cierre borra la marca y con ella el permiso. Reabrirla digitando no la
 * escribe: la puerta la abre el líder, no quien digita.
 */
export const SQL_REABRIR_CAJA_LIDER = `
  UPDATE modulos_caja
     SET estado_caja = '${CAJA_EN_PROCESO}',
         fecha_finalizacion = NULL,
         finalizada_por = NULL,
         reabierta_por = ?,
         reabierta_el = ?
   WHERE id = ?`;

/** Quién reabre la caja, para dejar constancia y abrir la corrección. */
export interface Reapertura {
  /** "NOMBRE (CC)" de quien reabre. */
  por: string;
  /** Día de la reapertura, en hora de Colombia. */
  el: string;
}

/**
 * Cambio de estado decidido por una persona: terminar la caja, o reabrirla.
 *
 * Con `reapertura`, la apertura queda firmada por el líder y autoriza la
 * corrección de registros anteriores; sin ella es la apertura corriente.
 */
export async function cambiarEstadoCaja(
  ejecutar: EjecutarSql,
  cajaId: string | number,
  estado: string,
  reapertura?: Reapertura,
): Promise<void> {
  if (estado === CAJA_FINALIZADA) {
    await ejecutar(SQL_CERRAR_CAJA, [cajaId]);
    return;
  }
  if (reapertura) {
    await ejecutar(SQL_REABRIR_CAJA_LIDER, [reapertura.por, reapertura.el, cajaId]);
    return;
  }
  await ejecutar(SQL_REABRIR_CAJA, [cajaId]);
}
