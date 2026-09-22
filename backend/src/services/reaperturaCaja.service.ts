import { query, queryOne, withTransaction } from '../config/db.js';
import type { SessionUser } from '../types/index.js';
import { fechaHoyLocal } from '../utils/format.js';
import { tieneRol } from '../utils/roles.js';
import { audit } from './audit.service.js';
import { CAJA_EN_PROCESO, CAJA_FINALIZADA, cambiarEstadoCaja } from './cicloCaja.service.js';
import { fueraDeSuSede } from './jerarquia.service.js';
import { lideresQueAtienden, notificar } from './notificaciones.service.js';

/**
 * Reabrir una caja terminada: la técnica lo pide, el líder lo autoriza.
 *
 * Regla de la operación: la técnica **nunca reabre una caja por sí misma**. Ni
 * cambiando el estado a mano ni digitando un registro nuevo en una caja que
 * ya está terminada. Da igual si la terminó ella pulsando "terminé esta caja"
 * o si la dio por terminada el líder: para volver a trabajar en ella tiene
 * que pedirlo, y hasta que el líder lo autorice el software se lo impide con
 * un mensaje que dice justo eso.
 *
 * Como ninguna caja se cierra sola —queda abierta hasta que la técnica la dé
 * por terminada—, este caso aparece solo cuando ella misma o el líder la
 * cerraron y hace falta volver a ella. Lo que se gana es que el líder sabe
 * siempre qué caja terminada se está retomando y por quién.
 *
 * El flujo entero pasa por el software, sin llamadas ni chat:
 *
 * 1. La técnica, desde la caja cerrada, envía la solicitud. Solo puede
 *    pedirla quien tiene la caja asignada y solo si está terminada.
 * 2. Los líderes de la sede de la caja reciben el aviso **al instante**
 *    (`notificaciones.service.ts`): en la campana y, si están conectados, sin
 *    esperar a recargar nada.
 * 3. El líder aprueba o rechaza con un clic desde el aviso. Aprobar es
 *    reabrir: la caja queda EN PROCESO y firmada como reabierta por él, igual
 *    que si la hubiera reabierto a mano, así que la técnica puede corregir
 *    también sus registros de días anteriores mientras siga abierta.
 * 4. La técnica recibe el aviso, también al instante, de que la caja ya está
 *    disponible para editar, o de que no se autorizó.
 *
 * Una solicitud pendiente no se duplica: volver a pedirla devuelve la misma.
 * Y si el líder reabre la caja a mano mientras hay solicitudes pendientes,
 * quedan aprobadas y avisadas, porque es lo que se pedía.
 */

/** Código que devuelve el servidor cuando la técnica intenta reabrir por su cuenta. */
export const REAPERTURA_REQUIERE_LIDER = 'REAPERTURA_REQUIERE_LIDER';

export const MENSAJE_REAPERTURA_REQUIERE_LIDER =
  'Esta caja está terminada. Para volver a trabajar en ella necesitas la autorización del líder: pídela desde la caja y te avisaremos en cuanto esté disponible.';

export const SOLICITUD_PENDIENTE = 'PENDIENTE';
export const SOLICITUD_APROBADA = 'APROBADA';
export const SOLICITUD_RECHAZADA = 'RECHAZADA';

export type EstadoDeSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export const ESTADOS_DE_SOLICITUD: readonly EstadoDeSolicitud[] = [
  SOLICITUD_PENDIENTE,
  SOLICITUD_APROBADA,
  SOLICITUD_RECHAZADA,
];

export interface SolicitudReapertura {
  id: number;
  caja_id: number;
  caja_modulo: string;
  solicitante_id: number;
  /** "NOMBRE (CC)" de quien pide, el mismo formato con el que firma sus registros. */
  solicitante: string;
  /** Sede de la caja en el momento de pedir: es lo que decide qué líderes la ven. */
  sede: string | null;
  estado: EstadoDeSolicitud;
  creada_en: string;
  resuelta_en: string | null;
  resuelta_por: string | null;
}

/**
 * Lo que puede salir mal, con el código HTTP que le corresponde. El
 * controlador lo traduce a la respuesta; el servicio no sabe de HTTP.
 */
export class ErrorDeReapertura extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ErrorDeReapertura';
    this.status = status;
    this.code = code;
  }
}

/** El nombre con el que se firman los registros y las reaperturas: "NOMBRE (CC)". */
export function firmaDe(user: SessionUser): string {
  return `${user.nombre.toUpperCase()} (${user.cc})`;
}

async function solicitudPendienteDe(
  cajaId: number,
  solicitanteId: number,
): Promise<SolicitudReapertura | undefined> {
  return queryOne<SolicitudReapertura>(
    `SELECT * FROM solicitud_reapertura
      WHERE caja_id = ? AND solicitante_id = ? AND estado = '${SOLICITUD_PENDIENTE}'
      ORDER BY id DESC LIMIT 1`,
    [cajaId, solicitanteId],
  );
}

async function obtenerSolicitud(id: string | number): Promise<SolicitudReapertura> {
  const solicitud = await queryOne<SolicitudReapertura>(
    'SELECT * FROM solicitud_reapertura WHERE id = ?',
    [id],
  );
  if (!solicitud) throw new ErrorDeReapertura(404, 'La solicitud de reapertura no existe');
  return solicitud;
}

/** El líder atiende solo las solicitudes de las cajas de su sede; el administrador, todas. */
function comprobarSede(user: SessionUser, solicitud: SolicitudReapertura): void {
  if (fueraDeSuSede(user, solicitud.sede)) {
    throw new ErrorDeReapertura(403, 'Solo puede atender las solicitudes de las cajas de su sede');
  }
}

function yaResuelta(solicitud: SolicitudReapertura): ErrorDeReapertura {
  return new ErrorDeReapertura(
    409,
    solicitud.estado === SOLICITUD_APROBADA
      ? 'Esta solicitud ya fue aprobada'
      : 'Esta solicitud ya fue rechazada',
  );
}

export interface ResultadoDeSolicitud {
  solicitud: SolicitudReapertura;
  /** `false` si ya había una pendiente y se devolvió esa. */
  nueva: boolean;
  /** A cuántas personas se les avisó. */
  avisados: number;
}

/**
 * La técnica pide reabrir una caja terminada.
 *
 * Quien llama ya comprobó que la caja está asignada a esta persona. Aquí se
 * comprueba lo demás: que la caja exista y esté terminada, y que no haya ya
 * una solicitud pendiente de la misma persona sobre la misma caja.
 */
export async function crearSolicitud(
  user: SessionUser,
  cajaId: string | number,
): Promise<ResultadoDeSolicitud> {
  const caja = await queryOne<{
    id: number;
    caja_modulo: string;
    estado_caja: string | null;
    sede: string | null;
  }>(
    `SELECT mc.id, mc.caja_modulo, mc.estado_caja, sm.sede_submodulos AS sede
       FROM modulos_caja mc
       LEFT JOIN moduloscliente m ON m.id = mc.id_modulo_caja
       LEFT JOIN sub_modulos sm ON sm.id = m.id_submodulo
      WHERE mc.id = ?`,
    [cajaId],
  );
  if (!caja) throw new ErrorDeReapertura(404, 'Módulo de caja no encontrado');
  if (caja.estado_caja !== CAJA_FINALIZADA) {
    throw new ErrorDeReapertura(
      409,
      'La caja ya está abierta: puedes seguir digitando en ella sin pedir nada.',
      'CAJA_YA_ABIERTA',
    );
  }

  const pendiente = await solicitudPendienteDe(caja.id, user.id);
  if (pendiente) return { solicitud: pendiente, nueva: false, avisados: 0 };

  const solicitante = firmaDe(user);
  let solicitud: SolicitudReapertura;
  try {
    [solicitud] = await query<SolicitudReapertura>(
      `INSERT INTO solicitud_reapertura (caja_id, caja_modulo, solicitante_id, solicitante, sede)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
      [caja.id, caja.caja_modulo, user.id, solicitante, caja.sede],
    );
  } catch (error) {
    // Dos clics seguidos: el índice único deja pasar uno, y el otro encuentra
    // la solicitud que acaba de quedar. 23505 es unique_violation.
    if ((error as { code?: string }).code !== '23505') throw error;
    const repetida = await solicitudPendienteDe(caja.id, user.id);
    if (!repetida) throw error;
    return { solicitud: repetida, nueva: false, avisados: 0 };
  }

  const destinatarios = await lideresQueAtienden(caja.sede);
  const avisos = await notificar(destinatarios, {
    tipo: 'SOLICITUD_REAPERTURA',
    mensaje: `${solicitante} pide reabrir la caja ${caja.caja_modulo}`,
    caja_id: caja.id,
    caja_modulo: caja.caja_modulo,
    solicitud_id: solicitud.id,
  });

  void audit({
    entidad: 'solicitud_reapertura',
    entidadId: solicitud.id,
    accion: 'CREAR',
    detalle: `Caja ${caja.caja_modulo}: ${solicitante} pide reabrirla`,
    usuario: user,
  });

  return { solicitud, nueva: true, avisados: avisos.length };
}

/**
 * Reapertura por el líder o el administrador, venga de donde venga: de aprobar
 * una solicitud o de reabrir la caja a mano desde su pantalla.
 *
 * Además de abrir la caja firmada (`reabierta_por`, que es lo que autoriza a
 * la técnica a corregir lo de días anteriores), da por aprobadas todas las
 * solicitudes pendientes sobre ella y avisa a quien las hizo: la caja ya está
 * disponible. Los dos cambios van en la misma transacción para que no quede
 * una caja abierta con solicitudes todavía pendientes, ni al revés.
 *
 * Devuelve las solicitudes que quedaron aprobadas, que pueden ser ninguna.
 */
export async function reabrirCajaPorLider(
  user: SessionUser,
  cajaId: string | number,
): Promise<SolicitudReapertura[]> {
  const reapertura = { por: firmaDe(user), el: fechaHoyLocal() };

  const aprobadas = await withTransaction(async (conn) => {
    await cambiarEstadoCaja(
      async (sql, params) => (await conn.queryResult(sql, params)).affectedRows,
      cajaId,
      CAJA_EN_PROCESO,
      reapertura,
    );
    return conn.query<SolicitudReapertura>(
      `UPDATE solicitud_reapertura
          SET estado = '${SOLICITUD_APROBADA}', resuelta_en = now(), resuelta_por = ?, resuelta_por_id = ?
        WHERE caja_id = ? AND estado = '${SOLICITUD_PENDIENTE}'
        RETURNING *`,
      [reapertura.por, user.id, cajaId],
    );
  });

  for (const solicitud of aprobadas) {
    await notificar([solicitud.solicitante_id], {
      tipo: 'REAPERTURA_APROBADA',
      mensaje: `La caja ${solicitud.caja_modulo} ya está disponible para editar: la reabrió ${reapertura.por}`,
      caja_id: solicitud.caja_id,
      caja_modulo: solicitud.caja_modulo,
      solicitud_id: solicitud.id,
    });
  }
  return aprobadas;
}

/** El líder autoriza: la caja se reabre y la técnica se entera. */
export async function aprobarSolicitud(
  user: SessionUser,
  solicitudId: string | number,
): Promise<SolicitudReapertura> {
  const solicitud = await obtenerSolicitud(solicitudId);
  comprobarSede(user, solicitud);
  if (solicitud.estado !== SOLICITUD_PENDIENTE) throw yaResuelta(solicitud);

  const aprobadas = await reabrirCajaPorLider(user, solicitud.caja_id);
  void audit({
    entidad: 'modulos_caja',
    entidadId: solicitud.caja_id,
    accion: 'CAMBIAR_ESTADO',
    detalle: `Caja ${solicitud.caja_modulo} reabierta a petición de ${solicitud.solicitante}`,
    usuario: user,
  });
  return aprobadas.find((a) => a.id === solicitud.id) ?? { ...solicitud, estado: SOLICITUD_APROBADA };
}

/** El líder no autoriza: la caja sigue terminada y la técnica se entera. */
export async function rechazarSolicitud(
  user: SessionUser,
  solicitudId: string | number,
): Promise<SolicitudReapertura> {
  const existente = await obtenerSolicitud(solicitudId);
  comprobarSede(user, existente);
  if (existente.estado !== SOLICITUD_PENDIENTE) throw yaResuelta(existente);

  const quien = firmaDe(user);
  const [solicitud] = await query<SolicitudReapertura>(
    `UPDATE solicitud_reapertura
        SET estado = '${SOLICITUD_RECHAZADA}', resuelta_en = now(), resuelta_por = ?, resuelta_por_id = ?
      WHERE id = ? AND estado = '${SOLICITUD_PENDIENTE}'
      RETURNING *`,
    [quien, user.id, existente.id],
  );
  // Entre leerla y actualizarla otro líder pudo resolverla.
  if (!solicitud) throw new ErrorDeReapertura(409, 'Otra persona acaba de atender esta solicitud');

  await notificar([solicitud.solicitante_id], {
    tipo: 'REAPERTURA_RECHAZADA',
    mensaje: `${quien} no autorizó reabrir la caja ${solicitud.caja_modulo}`,
    caja_id: solicitud.caja_id,
    caja_modulo: solicitud.caja_modulo,
    solicitud_id: solicitud.id,
  });
  void audit({
    entidad: 'solicitud_reapertura',
    entidadId: solicitud.id,
    accion: 'CAMBIAR_ESTADO',
    detalle: `Caja ${solicitud.caja_modulo}: reapertura pedida por ${solicitud.solicitante} rechazada`,
    usuario: user,
  });
  return solicitud;
}

export interface FiltrosDeSolicitudes {
  estado?: EstadoDeSolicitud;
  cajaId?: string | number;
}

/**
 * Las solicitudes que esta persona puede ver: el administrador todas, el
 * líder las de las cajas de su sede, la técnica las suyas. Las pendientes
 * primero, que son las que piden algo.
 */
export async function listarSolicitudes(
  user: SessionUser,
  filtros: FiltrosDeSolicitudes = {},
): Promise<SolicitudReapertura[]> {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (tieneRol(user, 'ADMIN')) {
    // Todas.
  } else if (tieneRol(user, 'LIDER')) {
    condiciones.push('(s.sede = ? OR s.sede IS NULL)');
    params.push(user.sede);
  } else {
    condiciones.push('s.solicitante_id = ?');
    params.push(user.id);
  }
  if (filtros.estado) {
    condiciones.push('s.estado = ?');
    params.push(filtros.estado);
  }
  if (filtros.cajaId !== undefined) {
    condiciones.push('s.caja_id = ?');
    params.push(filtros.cajaId);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  return query<SolicitudReapertura>(
    `SELECT s.* FROM solicitud_reapertura s ${where}
      ORDER BY (s.estado = '${SOLICITUD_PENDIENTE}') DESC, s.creada_en DESC, s.id DESC
      LIMIT 200`,
    params,
  );
}
