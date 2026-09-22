import type { Response } from 'express';
import { query, queryResult } from '../config/db.js';

/**
 * Avisos dentro del software, entregados al instante.
 *
 * Nacen de la reapertura de cajas por solicitud: la técnica pide reabrir una
 * caja terminada, el líder tiene que enterarse **en ese momento** —no cuando
 * recargue la pantalla— y la técnica tiene que saber, también al momento,
 * cuándo la caja ya está disponible. Un aviso que llega tarde es una persona
 * parada esperando.
 *
 * Dos piezas, y las dos hacen falta:
 *
 * - **La tabla `notificacion`** guarda cada aviso para quien lo recibe. Es lo
 *   que hace que nada se pierda: si el líder no estaba conectado cuando llegó
 *   la solicitud, la encuentra en su campana al entrar.
 * - **La conexión abierta** (`text/event-stream`, SSE) es lo que lo hace
 *   inmediato. Cada pestaña con sesión mantiene una petición abierta y el
 *   servidor le escribe cada aviso nuevo en cuanto se guarda. El navegador se
 *   reconecta solo si la conexión se cae, y la pantalla la cierra cuando no
 *   está en primer plano, que es lo mismo que ya hacían las consultas
 *   periódicas para no mantener despierto el servicio sin motivo.
 *
 * Por qué eventos del servidor y no WebSocket: aquí el dato viaja en un solo
 * sentido, del servidor a la pantalla, y SSE va sobre HTTP normal, con la
 * misma cookie de sesión y los mismos proxies, sin protocolo nuevo que
 * configurar en Render ni en Vite.
 *
 * Las conexiones se guardan en memoria, en este proceso. Con una sola
 * instancia del servidor, que es como se despliega, eso es todo lo que hace
 * falta. Si algún día hubiera varias, un aviso creado en una no llegaría a
 * las conexiones de otra: para entonces habría que pasarlo por la base
 * (LISTEN/NOTIFY) o por un intermediario. La lista persistida seguiría
 * completa igual, porque la pantalla también la consulta al reconectar.
 */

export type TipoDeNotificacion =
  | 'SOLICITUD_REAPERTURA'
  | 'REAPERTURA_APROBADA'
  | 'REAPERTURA_RECHAZADA';

export interface Notificacion {
  id: number;
  usuario_id: number;
  tipo: TipoDeNotificacion;
  mensaje: string;
  caja_id: number | null;
  caja_modulo: string | null;
  solicitud_id: number | null;
  creada_en: string;
  leida_en: string | null;
}

export interface NuevaNotificacion {
  tipo: TipoDeNotificacion;
  mensaje: string;
  caja_id?: number | null;
  caja_modulo?: string | null;
  solicitud_id?: number | null;
}

/**
 * Cada cuánto se escribe un latido por cada conexión abierta. Es un comentario
 * SSE, que el navegador ignora; sirve para que ningún proxy dé la conexión por
 * muerta y la corte por inactividad.
 */
export const LATIDO_MS = 25_000;

/** Cuántos avisos se devuelven en la lista: los últimos, que es lo que se mira. */
export const LIMITE_DE_AVISOS = 50;

const suscriptores = new Map<number, Set<Response>>();

/**
 * Registra una conexión abierta de esta persona y devuelve cómo soltarla.
 *
 * Una persona puede tener varias pestañas: cada una es una conexión, y el
 * aviso se escribe en todas.
 */
export function suscribir(usuarioId: number, res: Response): () => void {
  let conexiones = suscriptores.get(usuarioId);
  if (!conexiones) {
    conexiones = new Set();
    suscriptores.set(usuarioId, conexiones);
  }
  const propias = conexiones;
  propias.add(res);
  return () => {
    propias.delete(res);
    if (propias.size === 0 && suscriptores.get(usuarioId) === propias) suscriptores.delete(usuarioId);
  };
}

/** Cuántas conexiones hay abiertas, de una persona o de todas. Para las pruebas. */
export function conexionesAbiertas(usuarioId?: number): number {
  if (usuarioId !== undefined) return suscriptores.get(usuarioId)?.size ?? 0;
  let total = 0;
  for (const conexiones of suscriptores.values()) total += conexiones.size;
  return total;
}

/** Un evento SSE: nombre y carga en JSON, terminado por la línea en blanco. */
export function escribirEvento(res: Response, evento: string, datos: unknown): void {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
}

function entregar(notificacion: Notificacion): void {
  const conexiones = suscriptores.get(notificacion.usuario_id);
  if (!conexiones) return;
  for (const res of conexiones) {
    try {
      escribirEvento(res, 'notificacion', notificacion);
    } catch (error) {
      // Una conexión rota no puede estorbar a las demás ni a quien avisa.
      console.error('[notificaciones] No se pudo escribir en una conexión abierta:', error);
    }
  }
}

/**
 * Guarda el aviso para cada destinatario y se lo entrega a quien esté
 * conectado. Devuelve lo guardado, ya con su id y su fecha.
 */
export async function notificar(destinatarios: number[], aviso: NuevaNotificacion): Promise<Notificacion[]> {
  const unicos = [...new Set(destinatarios)];
  if (unicos.length === 0) return [];
  const filas = await query<Notificacion>(
    `INSERT INTO notificacion (usuario_id, tipo, mensaje, caja_id, caja_modulo, solicitud_id)
     VALUES ?
     RETURNING *`,
    [
      unicos.map((usuarioId) => [
        usuarioId,
        aviso.tipo,
        aviso.mensaje.slice(0, 500),
        aviso.caja_id ?? null,
        aviso.caja_modulo ?? null,
        aviso.solicitud_id ?? null,
      ]),
    ],
  );
  for (const fila of filas) entregar(fila);
  return filas;
}

/**
 * A quién le llega una solicitud de reapertura: a los líderes de la sede de la
 * caja. Si la sede no tiene ninguno, a los administradores, para que la
 * solicitud no se quede sin nadie que la vea.
 */
export async function lideresQueAtienden(sede: string | null): Promise<number[]> {
  const lideres = await query<{ id: number }>(
    `SELECT id FROM users
      WHERE (rol = 'LIDER' OR rol_secundario = 'LIDER')
        AND (?::text IS NULL OR sede = ?)
      ORDER BY id`,
    [sede, sede],
  );
  if (lideres.length > 0) return lideres.map((fila) => fila.id);
  const administradores = await query<{ id: number }>(
    `SELECT id FROM users WHERE rol = 'ADMIN' OR rol_secundario = 'ADMIN' ORDER BY id`,
  );
  return administradores.map((fila) => fila.id);
}

/** Los últimos avisos de una persona y cuántos le quedan sin leer. */
export async function listarNotificaciones(
  usuarioId: number,
): Promise<{ notificaciones: Notificacion[]; sin_leer: number }> {
  const notificaciones = await query<Notificacion>(
    `SELECT * FROM notificacion
      WHERE usuario_id = ?
      ORDER BY creada_en DESC, id DESC
      LIMIT ?`,
    [usuarioId, LIMITE_DE_AVISOS],
  );
  const [conteo] = await query<{ n: number | string }>(
    'SELECT COUNT(*) AS n FROM notificacion WHERE usuario_id = ? AND leida_en IS NULL',
    [usuarioId],
  );
  return { notificaciones, sin_leer: Number(conteo?.n ?? 0) };
}

/**
 * Marca como leídos los avisos indicados, o todos los de la persona si no se
 * indica ninguno. Solo los propios: el id de otro no se toca.
 */
export async function marcarLeidas(usuarioId: number, ids?: number[]): Promise<number> {
  if (ids && ids.length === 0) return 0;
  const resultado = ids
    ? await queryResult(
        'UPDATE notificacion SET leida_en = now() WHERE usuario_id = ? AND leida_en IS NULL AND id IN (?)',
        [usuarioId, ids],
      )
    : await queryResult('UPDATE notificacion SET leida_en = now() WHERE usuario_id = ? AND leida_en IS NULL', [
        usuarioId,
      ]);
  return resultado.affectedRows;
}
