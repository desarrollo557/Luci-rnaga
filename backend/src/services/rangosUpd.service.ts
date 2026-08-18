import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { pool, query, queryOne, queryResult } from '../config/db.js';
import type { RangoUpd, RangoUpdEstado, RangoUpdListRow } from '../types/db.js';
import type { AssignRangeDto, AvanceRow, NextUpdResult } from '../types/index.js';
import { formatUpd, toNumeric } from '../utils/updFormat.js';

type RangoUpdRow = RangoUpd & RowDataPacket;

/** Deriva el sub-módulo de una caja vía la cadena modulos_caja → moduloscliente → sub_modulos. */
export async function resolveSubModuloByCaja(caja: string): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    `SELECT sm.id FROM modulos_caja mc
     JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
     JOIN sub_modulos sm ON sm.id = mcl.id_submodulo
     WHERE mc.caja_modulo = ?`,
    [caja],
  );
  return row ? row.id : null;
}

/** Rangos activos del usuario+sub-módulo, el más antiguo primero (fecha_asignacion, id). */
export async function findActiveRanges(usuarioId: number, subModuloId: number): Promise<RangoUpd[]> {
  return query<RangoUpd>(
    `SELECT * FROM rangos_upd
     WHERE usuario_id = ? AND sub_modulo_id = ? AND estado = 'activo'
     ORDER BY fecha_asignacion, id`,
    [usuarioId, subModuloId],
  );
}

/** UPDs ya usados dentro de un rango (comparación numérica; ignora filas con LENGTH != 10). */
export async function findUsedUpds(rango: { upd_inicio: string; upd_fin: string }): Promise<number[]> {
  const rows = await query<{ n: number }>(
    `SELECT CAST(SUBSTRING(upd, 4) AS UNSIGNED) AS n FROM fuiddatosreal
     WHERE upd BETWEEN ? AND ? AND LENGTH(upd) = 10
     ORDER BY n`,
    [rango.upd_inicio, rango.upd_fin],
  );
  return rows.map((r) => r.n);
}

/** True si algún UPD del rango ya existe en fuiddatosreal (chequeo barato con LIMIT 1). */
export async function hasUsedUpds(rango: { upd_inicio: string; upd_fin: string }): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM fuiddatosreal
     WHERE upd BETWEEN ? AND ? AND LENGTH(upd) = 10
     LIMIT 1`,
    [rango.upd_inicio, rango.upd_fin],
  );
  return Boolean(row);
}

/** True si el UPD pertenece a un rango ACTIVO del usuario para el sub-módulo (membership de consumo). */
export async function membershipCheck(usuarioId: number, subModuloId: number, upd: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM rangos_upd
     WHERE usuario_id = ? AND sub_modulo_id = ? AND estado = 'activo'
       AND upd_inicio <= ? AND ? <= upd_fin
     LIMIT 1`,
    [usuarioId, subModuloId, upd, upd],
  );
  return Boolean(row);
}

/** Rangos activos del usuario+sub-módulo que se solapan con [inicio, fin]. */
export async function checkOverlap(
  usuarioId: number,
  subModuloId: number,
  inicio: string,
  fin: string,
): Promise<RangoUpd[]> {
  return query<RangoUpd>(
    `SELECT * FROM rangos_upd
     WHERE usuario_id = ? AND sub_modulo_id = ? AND estado = 'activo'
       AND upd_inicio <= ? AND upd_fin >= ?`,
    [usuarioId, subModuloId, fin, inicio],
  );
}

/** Marca un rango como agotado (UPDATE idempotente: solo si sigue activo). */
async function marcarAgotado(id: number): Promise<void> {
  await queryResult(
    `UPDATE rangos_upd SET estado = 'agotado', fecha_agotado = NOW()
     WHERE id = ? AND estado = 'activo'`,
    [id],
  );
}

/**
 * Resuelve el siguiente UPD libre: recorre los rangos activos del más antiguo al más
 * nuevo, salta los UPDs ya usados y devuelve el primer gap. Si un rango no tiene
 * valores libres lo marca como agotado y continúa con el siguiente. Devuelve null
 * cuando todos los rangos activos están agotados.
 */
export async function resolveNextUpd(usuarioId: number, subModuloId: number): Promise<NextUpdResult | null> {
  const rangos = await findActiveRanges(usuarioId, subModuloId);

  for (const rango of rangos) {
    const inicio = toNumeric(rango.upd_inicio);
    const fin = toNumeric(rango.upd_fin);
    const usados = new Set(await findUsedUpds(rango));

    let candidato = inicio;
    while (candidato <= fin) {
      if (!usados.has(candidato)) {
        return { upd: formatUpd(candidato), sub_modulo_id: subModuloId };
      }
      candidato += 1;
    }

    await marcarAgotado(rango.id);
  }

  return null;
}

export type AssignRangoError =
  | { code: 'USADOS'; message: string; used: string[] }
  | { code: 'SOLAPAMIENTO'; message: string; overlap: RangoUpd[] };

export type AssignRangoResult =
  | { ok: true; rango: RangoUpd }
  | { ok: false; status: 409; error: AssignRangoError };

/**
 * Asigna un rango en transacción: serializa asignaciones concurrentes del mismo
 * usuario+sub-módulo con SELECT ... FOR UPDATE, rechaza rangos con UPDs ya usados
 * o solapados con otro activo, y persiste el rango como activo.
 */
export async function assignRango(data: AssignRangeDto, asignadoPor: number): Promise<AssignRangoResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Serializa las asignaciones concurrentes del mismo usuario+sub-módulo.
    await conn.query(
      `SELECT id FROM rangos_upd
       WHERE usuario_id = ? AND sub_modulo_id = ? AND estado = 'activo'
       FOR UPDATE`,
      [data.usuario_id, data.sub_modulo_id],
    );

    if (await hasUsedUpds(data)) {
      const used = (await findUsedUpds(data)).map((n) => formatUpd(n));
      const resumen = used.slice(0, 10).join(', ');
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: {
          code: 'USADOS',
          message: `El rango contiene UPDs ya usados: ${resumen}${used.length > 10 ? '…' : ''}`,
          used,
        },
      };
    }

    const [overlap] = await conn.query<RangoUpdRow[]>(
      `SELECT * FROM rangos_upd
       WHERE usuario_id = ? AND sub_modulo_id = ? AND estado = 'activo'
         AND upd_inicio <= ? AND upd_fin >= ?`,
      [data.usuario_id, data.sub_modulo_id, data.upd_fin, data.upd_inicio],
    );
    if (overlap.length > 0) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: {
          code: 'SOLAPAMIENTO',
          message: 'El rango se solapa con un rango activo del mismo técnico y sub-módulo',
          overlap,
        },
      };
    }

    const [result] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO rangos_upd (usuario_id, sub_modulo_id, upd_inicio, upd_fin, estado, asignado_por)
       VALUES (?, ?, ?, ?, 'activo', ?)`,
      [data.usuario_id, data.sub_modulo_id, data.upd_inicio, data.upd_fin, asignadoPor],
    );

    const [rango] = await conn.query<RangoUpdRow[]>('SELECT * FROM rangos_upd WHERE id = ?', [result.insertId]);
    await conn.commit();
    return { ok: true, rango: rango[0] };
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    throw error;
  } finally {
    conn.release();
  }
}

export type RevocarRangoResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; message: string };

/** Revoca un rango activo. 404 si no existe; 409 si ya no está activo. */
export async function revocarRango(id: number): Promise<RevocarRangoResult> {
  const rango = await queryOne<RangoUpd>('SELECT id, estado FROM rangos_upd WHERE id = ?', [id]);
  if (!rango) {
    return { ok: false, status: 404, message: 'El rango no existe' };
  }
  if (rango.estado !== 'activo') {
    return { ok: false, status: 409, message: 'El rango ya no está activo' };
  }
  await queryResult(
    `UPDATE rangos_upd SET estado = 'revocado', fecha_revocacion = NOW()
     WHERE id = ? AND estado = 'activo'`,
    [id],
  );
  return { ok: true };
}

/** Filtro de estado para el listado: un estado concreto o 'all' (sin filtro). */
export type RangoUpdEstadoFiltro = RangoUpdEstado | 'all';

/**
 * Lista rangos con el nombre del técnico (JOIN users) y el código/entidad del
 * sub-módulo (JOIN sub_modulos). LIDER ve solo sus asignaciones (asignado_por);
 * ADMIN ve todas (sin filtro). Filtros opcionales: sub_modulo_id y estado
 * ('activo' | 'agotado' | 'revocado' | 'all'). Orden: fecha_asignacion DESC.
 */
export async function listarRangos(
  asignadoPor: number | undefined,
  subModuloId: number | undefined,
  estado: RangoUpdEstadoFiltro = 'all',
): Promise<RangoUpdListRow[]> {
  const params: unknown[] = [];
  let filtroSql = '';
  if (asignadoPor !== undefined) {
    filtroSql += ' AND r.asignado_por = ?';
    params.push(asignadoPor);
  }
  if (subModuloId !== undefined) {
    filtroSql += ' AND r.sub_modulo_id = ?';
    params.push(subModuloId);
  }
  if (estado !== 'all') {
    filtroSql += ' AND r.estado = ?';
    params.push(estado);
  }

  return query<RangoUpdListRow>(
    `SELECT r.id, r.usuario_id, u.nombre AS tecnico_nombre,
            r.sub_modulo_id, sm.codigo AS sub_modulo_codigo, sm.entidad_remitente AS sub_modulo_entidad,
            r.upd_inicio, r.upd_fin, r.estado, r.asignado_por,
            r.fecha_asignacion, r.fecha_agotado, r.fecha_revocacion
     FROM rangos_upd r
     JOIN users u ON u.id = r.usuario_id
     JOIN sub_modulos sm ON sm.id = r.sub_modulo_id
     WHERE 1 = 1${filtroSql}
     ORDER BY r.fecha_asignacion DESC, r.id DESC`,
    params,
  );
}

export interface AvanceFiltro {
  asignado_por: number | null;
  sub_modulo_id: number | null;
}

export interface AvanceRangosResult {
  por_tecnico: AvanceRow[];
  filtro: AvanceFiltro;
}

/**
 * Avance por técnico sobre rangos vigentes (activo + agotado, excluye revocados):
 * total asignado = Σ tamaños numéricos; finalizadas = COUNT(DISTINCT upd) en
 * fuiddatosreal dentro de esos rangos; pendientes = max(0, total − finalizadas);
 * porcentaje = round(finalizadas/total) con guard 0-safe.
 * LIDER ve solo sus asignaciones (asignado_por); ADMIN ve todas (sin filtro).
 */
export async function avanceRangosUpd(
  asignadoPor: number | undefined,
  subModuloId: number | undefined,
): Promise<AvanceRangosResult> {
  const params: unknown[] = [];
  let filtroSql = '';
  if (asignadoPor !== undefined) {
    filtroSql += ' AND r.asignado_por = ?';
    params.push(asignadoPor);
  }
  if (subModuloId !== undefined) {
    filtroSql += ' AND r.sub_modulo_id = ?';
    params.push(subModuloId);
  }

  const rangos = await query<{ usuario_id: number; nombre: string; upd_inicio: string; upd_fin: string }>(
    `SELECT r.usuario_id, u.nombre, r.upd_inicio, r.upd_fin
     FROM rangos_upd r
     JOIN users u ON u.id = r.usuario_id
     WHERE r.estado IN ('activo', 'agotado')${filtroSql}
     ORDER BY r.usuario_id`,
    params,
  );

  const finalizadas = await query<{ usuario_id: number; total: number }>(
    `SELECT r.usuario_id, COUNT(DISTINCT f.upd) AS total
     FROM rangos_upd r
     JOIN fuiddatosreal f
       ON f.upd BETWEEN r.upd_inicio AND r.upd_fin AND LENGTH(f.upd) = 10
     WHERE r.estado IN ('activo', 'agotado')${filtroSql}
     GROUP BY r.usuario_id`,
    params,
  );
  const finalizadasPorUsuario = new Map(finalizadas.map((f) => [f.usuario_id, f.total]));

  const acumulado = new Map<number, { nombre: string; total: number }>();
  for (const r of rangos) {
    const total = toNumeric(r.upd_fin) - toNumeric(r.upd_inicio) + 1;
    const prev = acumulado.get(r.usuario_id);
    if (prev) {
      prev.total += total;
    } else {
      acumulado.set(r.usuario_id, { nombre: r.nombre, total });
    }
  }

  const por_tecnico: AvanceRow[] = [...acumulado.entries()]
    .map(([usuario_id, { nombre, total }]) => {
      const finalizadas = finalizadasPorUsuario.get(usuario_id) ?? 0;
      const pendientes = Math.max(0, total - finalizadas);
      const porcentaje = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
      return { usuario_id, nombre, total_asignadas: total, finalizadas, pendientes, porcentaje };
    })
    .sort((a, b) => a.usuario_id - b.usuario_id);

  return {
    por_tecnico,
    filtro: { asignado_por: asignadoPor ?? null, sub_modulo_id: subModuloId ?? null },
  };
}

/**
 * Avance de un técnico específico (para el perfil TECNICA).
 * Igual lógica que avanceRangosUpd pero filtrado por usuario_id del técnico.
 */
export async function avanceTecnica(
  usuarioId: number,
  subModuloId: number | undefined,
): Promise<AvanceRangosResult> {
  const params: unknown[] = [usuarioId];
  let filtroSql = ' AND r.usuario_id = ?';
  if (subModuloId !== undefined) {
    filtroSql += ' AND r.sub_modulo_id = ?';
    params.push(subModuloId);
  }

  const rangos = await query<{ usuario_id: number; nombre: string; upd_inicio: string; upd_fin: string }>(
    `SELECT r.usuario_id, u.nombre, r.upd_inicio, r.upd_fin
     FROM rangos_upd r
     JOIN users u ON u.id = r.usuario_id
     WHERE r.estado IN ('activo', 'agotado')${filtroSql}
     ORDER BY r.usuario_id`,
    params,
  );

  const finalizadas = await query<{ usuario_id: number; total: number }>(
    `SELECT r.usuario_id, COUNT(DISTINCT f.upd) AS total
     FROM rangos_upd r
     JOIN fuiddatosreal f
       ON f.upd BETWEEN r.upd_inicio AND r.upd_fin AND LENGTH(f.upd) = 10
     WHERE r.estado IN ('activo', 'agotado')${filtroSql}
     GROUP BY r.usuario_id`,
    params,
  );
  const finalizadasPorUsuario = new Map(finalizadas.map((f) => [f.usuario_id, f.total]));

  const acumulado = new Map<number, { nombre: string; total: number }>();
  for (const r of rangos) {
    const total = toNumeric(r.upd_fin) - toNumeric(r.upd_inicio) + 1;
    const prev = acumulado.get(r.usuario_id);
    if (prev) {
      prev.total += total;
    } else {
      acumulado.set(r.usuario_id, { nombre: r.nombre, total });
    }
  }

  const por_tecnico: AvanceRow[] = [...acumulado.entries()]
    .map(([usuario_id, { nombre, total }]) => {
      const finalizadas = finalizadasPorUsuario.get(usuario_id) ?? 0;
      const pendientes = Math.max(0, total - finalizadas);
      const porcentaje = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
      return { usuario_id, nombre, total_asignadas: total, finalizadas, pendientes, porcentaje };
    })
    .sort((a, b) => a.usuario_id - b.usuario_id);

  return {
    por_tecnico,
    filtro: { asignado_por: null, sub_modulo_id: subModuloId ?? null },
  };
}