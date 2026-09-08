import type { Request, Response } from 'express';
import { query, queryOne } from '../config/db.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js';
import type { Historial } from '../types/db.js';

export interface HistorialPage {
  data: Historial[];
  total: number;
  page: number;
  pageSize: number;
  tipos: string[];
  sedes: string[];
}

/**
 * El historial ronda las 46.000 filas: enviarlo completo bloqueaba el navegador
 * y obligaba a filtrar en cliente. Filtros y paginación se resuelven en SQL.
 */
export async function listHistorial(req: Request, res: Response): Promise<void> {
  const page = Math.max(0, Number(req.query.page) || 0);
  const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  const where: string[] = [];
  const params: unknown[] = [];

  const q = String(req.query.q ?? '').trim();
  if (q) {
    const like = `%${q}%`;
    where.push(
      `(caja LIKE ? OR upd LIKE ? OR CAST(id_dato AS CHAR) LIKE ? OR historial_cambios LIKE ?
        OR cambio_calidad LIKE ? OR sede_calidad LIKE ? OR tipo_cambio LIKE ?)`,
    );
    params.push(like, like, like, like, like, like, like);
  }

  const tipo = String(req.query.tipo ?? '').trim();
  if (tipo) {
    where.push('tipo_cambio = ?');
    params.push(tipo);
  }

  const sede = String(req.query.sede ?? '').trim();
  if (sede) {
    where.push('sede_calidad = ?');
    params.push(sede);
  }

  const desde = String(req.query.desde ?? '').trim();
  if (desde) {
    where.push('fecha_cambio >= ?');
    params.push(`${desde} 00:00:00`);
  }

  const hasta = String(req.query.hasta ?? '').trim();
  if (hasta) {
    where.push('fecha_cambio <= ?');
    params.push(`${hasta} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, totalRow, tipos, sedes] = await Promise.all([
    query<Historial>(
      `SELECT * FROM historial ${whereSql} ORDER BY fecha_cambio DESC, id_historial DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, page * pageSize],
    ),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM historial ${whereSql}`, params),
    query<{ v: string }>(
      "SELECT DISTINCT tipo_cambio AS v FROM historial WHERE tipo_cambio IS NOT NULL AND tipo_cambio <> '' ORDER BY v",
    ),
    query<{ v: string }>(
      "SELECT DISTINCT sede_calidad AS v FROM historial WHERE sede_calidad IS NOT NULL AND sede_calidad <> '' ORDER BY v",
    ),
  ]);

  res.json({
    data: rows,
    total: totalRow?.n ?? 0,
    page,
    pageSize,
    tipos: tipos.map((t) => t.v),
    sedes: sedes.map((s) => s.v),
  } satisfies HistorialPage);
}
