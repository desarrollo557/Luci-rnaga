import { queryOne } from '../config/db.js';
import type { SessionUser } from '../types/index.js';

/**
 * Jerarquía de gestión: ADMIN administra todo; LIDER solo lo que pertenece a su
 * sede (cliente → acta → caja); TECNICA y CALIDAD no crean, editan ni borran
 * estas entidades (lo bloquea el middleware isLiderOrAdmin en las rutas).
 */

export interface UbicacionSede {
  existe: boolean;
  sede: string | null;
}

export async function sedeDeCliente(id: string | number): Promise<UbicacionSede> {
  const fila = await queryOne<{ sede: string | null }>('SELECT sede_submodulos AS sede FROM sub_modulos WHERE id = ?', [id]);
  return { existe: Boolean(fila), sede: fila?.sede ?? null };
}

export async function sedeDeActa(id: string | number): Promise<UbicacionSede> {
  const fila = await queryOne<{ sede: string | null }>(
    `SELECT sm.sede_submodulos AS sede
     FROM moduloscliente m
     LEFT JOIN sub_modulos sm ON sm.id = m.id_submodulo
     WHERE m.id = ?`,
    [id],
  );
  return { existe: Boolean(fila), sede: fila?.sede ?? null };
}

export async function sedeDeCaja(id: string | number): Promise<UbicacionSede> {
  const fila = await queryOne<{ sede: string | null }>(
    `SELECT sm.sede_submodulos AS sede
     FROM modulos_caja mc
     LEFT JOIN moduloscliente m ON m.id = mc.id_modulo_caja
     LEFT JOIN sub_modulos sm ON sm.id = m.id_submodulo
     WHERE mc.id = ?`,
    [id],
  );
  return { existe: Boolean(fila), sede: fila?.sede ?? null };
}

/** True cuando un LIDER intenta gestionar algo que pertenece a otra sede. */
export function fueraDeSuSede(user: SessionUser | undefined, sede: string | null): boolean {
  return user?.rol === 'LIDER' && Boolean(sede) && sede !== user.sede;
}

/** True si el técnico o analista de calidad tiene la caja asignada. */
export async function tieneCajaAsignada(user: SessionUser, cajaId: string | number): Promise<boolean> {
  const tabla = user.rol === 'CALIDAD' ? 'asignacion_caja_calidad' : 'asignacion_caja_tecnica';
  const fila = await queryOne<{ id: number }>(`SELECT id FROM ${tabla} WHERE modulo_id = ? AND usuario_id = ? LIMIT 1`, [
    cajaId,
    user.id,
  ]);
  return Boolean(fila);
}
