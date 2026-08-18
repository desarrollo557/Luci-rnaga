import { query } from '../config/db.js';
import type { SessionUser } from '../types/index.js';

export type AuditAccion =
  | 'CREAR'
  | 'ACTUALIZAR'
  | 'ELIMINAR'
  | 'CAMBIAR_ESTADO'
  | 'ASIGNAR'
  | 'QUITAR'
  | 'MARCAR_OK'
  | 'SUBIR';

export interface AuditEntry {
  entidad: string;
  entidadId?: string | number | null;
  accion: AuditAccion;
  detalle: string;
  usuario?: SessionUser | null;
}

/** Inserta un evento de auditoría. Nunca debe romper la operación principal. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const usuario = entry.usuario
      ? `${entry.usuario.nombre} (${entry.usuario.rol ?? ''})`
      : 'Sistema';
    await query(
      `INSERT INTO auditoria (entidad, entidad_id, accion, detalle, usuario) VALUES (?, ?, ?, ?, ?)`,
      [entry.entidad, entry.entidadId != null ? String(entry.entidadId) : null, entry.accion, entry.detalle.slice(0, 500), usuario],
    );
  } catch (error) {
    console.error('[auditoria] No se pudo registrar el evento:', error);
  }
}