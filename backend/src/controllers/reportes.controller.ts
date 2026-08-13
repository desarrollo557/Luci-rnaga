import type { Request, Response } from 'express';
import { query } from '../config/db.js';

export interface FuidConEstado {
  id: number;
  fecha_del_dato: string | null;
  n_orden: number | null;
  codigo: string | null;
  entidad_remitente: string | null;
  entidad_productora: string | null;
  unidad_administrativa: string | null;
  oficina_productora: string | null;
  objeto: string | null;
  serie: string | null;
  subserie: string | null;
  numero_de_orden_interno: string | null;
  accionado_procesado: string | null;
  accionado_denunciante: string | null;
  identificacion: string | null;
  asunto: string | null;
  radicado: string | null;
  numero_doc: string | null;
  numero_doc_hasta: string | null;
  fecha_inicial: string | null;
  fecha_final: string | null;
  caja: string | null;
  upd: string | null;
  tomo: string | null;
  otro: string | null;
  caja_interna: string | null;
  folios: string | null;
  soporte: string | null;
  frecuencia: string | null;
  elaborado_por: string | null;
  nro_acta_transferible: string | null;
  fecha_transferencia: string | null;
  notas: string | null;
  sede: string | null;
  tiempo: string | null;
  estado_caja: string | null;
}

export async function fuidConEstadoCaja(_req: Request, res: Response): Promise<void> {
  const rows = await query<FuidConEstado>(
    `SELECT
      f.id, f.fecha_del_dato, f.n_orden, f.codigo, f.entidad_remitente, f.entidad_productora,
      f.unidad_administrativa, f.oficina_productora, f.objeto, f.serie, f.subserie,
      f.numero_de_orden_interno, f.accionado_procesado, f.accionado_denunciante, f.identificacion,
      f.asunto, f.radicado, f.numero_doc, f.numero_doc_hasta, f.fecha_inicial,
      f.fecha_final, f.caja, f.upd, f.tomo, f.otro, f.caja_interna, f.folios,
      f.soporte, f.frecuencia, f.elaborado_por, f.nro_acta_transferible,
      f.fecha_transferencia, f.notas, f.sede, f.tiempo,
      mc.estado_caja
    FROM fuiddatosreal f
    LEFT JOIN modulos_caja mc ON f.caja = mc.caja_modulo`,
  );
  res.json(rows);
}

export interface EstadisticasProduccion {
  total_fuids: number;
  total_cajas: number;
  cajas_en_proceso: number;
  cajas_finalizadas: number;
  fuids_aprobados: number;
  fuids_pendientes: number;
  cajas_con_fuids: number;
  cajas_sin_fuids: number;
  promedio_fuids_por_caja: number;
  total_modulos_cliente: number;
  total_usuarios: number;
  por_estado_caja: Array<{ estado: string; total: number }>;
  fuids_por_mes: Array<{ mes: string; total: number }>;
  fuids_por_sede: Array<{ sede: string; total: number }>;
  top_digitadores: Array<{ nombre: string; total: number }>;
  usuarios_por_rol: Array<{ rol: string; total: number }>;
}

/** Resumen agregado del negocio: todos los conteos se calculan con SQL real. */
export async function estadisticasProduccion(_req: Request, res: Response): Promise<void> {
  const [
    totalFuids,
    totalCajas,
    cajasEnProceso,
    cajasFinalizadas,
    fuidsAprobados,
    cajasConFuids,
    totalModulos,
    totalUsuarios,
    porEstadoCaja,
    fuidsPorMes,
    fuidsPorSede,
    topDigitadores,
    usuariosPorRol,
  ] = await Promise.all([
    query<{ n: number }>('SELECT COUNT(*) AS n FROM fuiddatosreal'),
    query<{ n: number }>('SELECT COUNT(*) AS n FROM modulos_caja'),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM modulos_caja WHERE estado_caja = 'EN PROCESO'"),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM modulos_caja WHERE estado_caja = 'FINALIZADO'"),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM fuiddatosreal WHERE historial_y_cambios = 'OK'"),
    query<{ n: number }>(
      "SELECT COUNT(DISTINCT caja) AS n FROM fuiddatosreal WHERE caja IS NOT NULL AND caja <> ''",
    ),
    query<{ n: number }>('SELECT COUNT(*) AS n FROM moduloscliente'),
    query<{ n: number }>('SELECT COUNT(*) AS n FROM users'),
    query<{ estado: string; total: number }>(
      `SELECT COALESCE(mc.estado_caja, 'SIN ESTADO') AS estado, COUNT(*) AS total
       FROM fuiddatosreal f
       LEFT JOIN modulos_caja mc ON f.caja = mc.caja_modulo
       GROUP BY mc.estado_caja
       ORDER BY total DESC`,
    ),
    query<{ mes: string; total: number }>(
      `SELECT DATE_FORMAT(f.fecha_del_dato, '%Y-%m') AS mes, COUNT(*) AS total
       FROM fuiddatosreal f
       WHERE f.fecha_del_dato IS NOT NULL
         AND CAST(f.fecha_del_dato AS CHAR) <> ''
       GROUP BY mes
       ORDER BY mes DESC
       LIMIT 6`,
    ),
    query<{ sede: string; total: number }>(
      `SELECT sede, COUNT(*) AS total
       FROM fuiddatosreal
       WHERE sede IS NOT NULL AND sede <> ''
       GROUP BY sede
       ORDER BY total DESC`,
    ),
    query<{ nombre: string; total: number }>(
      `SELECT elaborado_por AS nombre, COUNT(*) AS total
       FROM fuiddatosreal
       WHERE elaborado_por IS NOT NULL AND elaborado_por <> ''
       GROUP BY elaborado_por
       ORDER BY total DESC
       LIMIT 5`,
    ),
    query<{ rol: string; total: number }>(
      `SELECT rol, COUNT(*) AS total FROM users GROUP BY rol ORDER BY total DESC`,
    ),
  ]);

  const totalFuidsN = totalFuids[0]?.n ?? 0;
  const totalCajasN = totalCajas[0]?.n ?? 0;
  const cajasConFuidsN = cajasConFuids[0]?.n ?? 0;

  res.json({
    total_fuids: totalFuidsN,
    total_cajas: totalCajasN,
    cajas_en_proceso: cajasEnProceso[0]?.n ?? 0,
    cajas_finalizadas: cajasFinalizadas[0]?.n ?? 0,
    fuids_aprobados: fuidsAprobados[0]?.n ?? 0,
    fuids_pendientes: totalFuidsN - (fuidsAprobados[0]?.n ?? 0),
    cajas_con_fuids: cajasConFuidsN,
    cajas_sin_fuids: totalCajasN - cajasConFuidsN,
    promedio_fuids_por_caja: cajasConFuidsN > 0 ? Math.round((totalFuidsN / cajasConFuidsN) * 10) / 10 : 0,
    total_modulos_cliente: totalModulos[0]?.n ?? 0,
    total_usuarios: totalUsuarios[0]?.n ?? 0,
    por_estado_caja: porEstadoCaja,
    fuids_por_mes: fuidsPorMes,
    fuids_por_sede: fuidsPorSede,
    top_digitadores: topDigitadores,
    usuarios_por_rol: usuariosPorRol,
  } satisfies EstadisticasProduccion);
}
