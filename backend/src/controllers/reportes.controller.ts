import type { Request, Response } from 'express';
import { query, queryOne } from '../config/db.js';
import { audit } from '../services/audit.service.js';
import { fechaHoyLocal } from '../utils/format.js';
import {
  construirSeguimientoInventario,
  seguimientoFilename,
  type FilaSeguimiento,
} from '../services/seguimientoInventario.service.js';

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

export interface ResumenCajasAgrupado {
  caja_inicial: string;
  caja_fin: string;
  upd_inicio: string | null;
  upd_fin: string | null;
  cajas_encontradas: number;
  total_registros: number;
}

/** Genera resumen agrupado por rangos de cajas (Vista Tabla del manual) */
export async function resumenCajasAgrupado(_req: Request, res: Response): Promise<void> {
  const rows = await query<ResumenCajasAgrupado>(`
    SELECT
      MIN(mc.caja_modulo) AS caja_inicial,
      MAX(mc.caja_modulo) AS caja_fin,
      MIN(f.upd) AS upd_inicio,
      MAX(f.upd) AS upd_fin,
      COUNT(DISTINCT f.caja) AS cajas_encontradas,
      COUNT(*) AS total_registros
    FROM fuiddatosreal f
    LEFT JOIN modulos_caja mc ON f.caja = mc.caja_modulo
    WHERE f.caja IS NOT NULL AND f.caja <> ''
    GROUP BY mc.id_modulo_caja
    ORDER BY caja_inicial
  `);
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
  /** Actas de transferencia registradas (filas de moduloscliente). */
  total_actas: number;
  /** Clientes registrados (filas de sub_modulos). */
  total_clientes: number;
  por_estado_caja: Array<{ estado: string; total: number }>;
  /** Los últimos 12 meses con registros, del más antiguo al más reciente. */
  fuids_por_mes: Array<{ mes: string; total: number; aprobados: number }>;
  /** Los últimos 30 días con registros, del más antiguo al más reciente. */
  fuids_por_dia: Array<{ dia: string; total: number; aprobados: number }>;
  fuids_por_sede: Array<{ sede: string; total: number }>;
  /** Todos los digitadores con registros, sin límite; rol y sede solo si existen como usuario. */
  digitadores: Array<{
    nombre: string;
    cc: string | null;
    rol: string | null;
    sede: string | null;
    total: number;
    aprobados: number;
    cajas: number;
    ultimo_registro: string | null;
  }>;
  usuarios_por_rol: Array<{ rol: string; total: number }>;
  cajas_por_estado: Array<{ estado: string; total: number }>;
  avance_por_submodulo: Array<{ submodulo: string; entidad: string; total: number; aprobados: number }>;
  actividad_reciente: Array<{ dia: string; total: number }>;
  /** Momento en que se calcularon las cifras (ISO). */
  generado_en: string;
}

/** Un punto de la curva de digitación, con la granularidad a la que pertenece. */
interface PuntoDeSerie {
  granularidad: 'mes' | 'dia';
  /** `AAAA-MM` para el mes, `AAAA-MM-DD` para el día. */
  etiqueta: string;
  total: number;
  aprobados: number;
}

/** Cuántos meses y cuántos días de historia se dibujan en la curva. */
const MESES_EN_LA_CURVA = 12;
const DIAS_EN_LA_CURVA = 30;

/**
 * La curva de digitación, por mes y por día, en una sola consulta.
 *
 * Son dos preguntas distintas sobre lo mismo. Por mes se ve si el trabajo
 * crece o se estanca a lo largo del año; por día se ve la semana concreta:
 * qué días rindieron, cuáles se cayeron y si lo de hoy va como lo de ayer. Un
 * mes es un promedio de veinte jornadas y esconde las dos cosas.
 *
 * Van juntas y no en dos consultas porque el recorrido de `fuiddatosreal` es
 * el mismo y esta pantalla se refresca sola: lo caro no es agrupar dos veces,
 * es leer la tabla dos veces y ocupar dos conexiones del pooler para ello.
 *
 * Se cuentan los últimos ${MESES_EN_LA_CURVA} meses y los últimos
 * ${DIAS_EN_LA_CURVA} días **con registros**, no naturales: un fin de semana
 * sin digitar no gasta un hueco de la curva.
 */
const SQL_SERIE_DIGITACION = `
  WITH digitado AS (
    SELECT f.fecha_del_dato AS fecha,
           (f.historial_y_cambios = 'OK') AS aprobado
      FROM fuiddatosreal f
     WHERE f.fecha_del_dato IS NOT NULL
  ),
  por_mes AS (
    SELECT to_char(fecha, 'YYYY-MM') AS etiqueta,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE aprobado) AS aprobados
      FROM digitado
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT ${MESES_EN_LA_CURVA}
  ),
  por_dia AS (
    SELECT to_char(fecha, 'YYYY-MM-DD') AS etiqueta,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE aprobado) AS aprobados
      FROM digitado
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT ${DIAS_EN_LA_CURVA}
  )
  SELECT 'mes' AS granularidad, etiqueta, total, aprobados FROM por_mes
  UNION ALL
  SELECT 'dia' AS granularidad, etiqueta, total, aprobados FROM por_dia
  ORDER BY granularidad, etiqueta ASC`;

/** Las cifras sueltas de la cabecera, todas en una sola ida a la base. */
interface Conteos {
  total_fuids: number;
  fuids_aprobados: number;
  total_cajas: number;
  cajas_en_proceso: number;
  cajas_finalizadas: number;
  cajas_con_fuids: number;
  total_actas: number;
  total_clientes: number;
  total_usuarios: number;
}

/**
 * Los nueve conteos de la cabecera en una consulta.
 *
 * Antes eran diez consultas sueltas dentro del mismo `Promise.all` —dos de
 * ellas idénticas, contando `moduloscliente` dos veces—, y esta pantalla se
 * refresca sola cada quince segundos. Cada consulta ocupa una conexión del
 * pooler mientras dura, y ese cupo se comparte con el servicio desplegado: el
 * pico de esta sola pantalla era lo que dejaba a la base sin sesiones libres.
 *
 * Agrupadas por tabla, además, se recorre `fuiddatosreal` una vez en lugar de
 * dos y `modulos_caja` una en lugar de cuatro. `COUNT(*) FILTER (WHERE …)` es
 * lo que permite sacar varios conteos de un mismo recorrido.
 */
const SQL_CONTEOS = `
  WITH fuids AS (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE historial_y_cambios = 'OK') AS aprobados
    FROM fuiddatosreal
  ),
  cajas AS (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE estado_caja = 'EN PROCESO') AS en_proceso,
           COUNT(*) FILTER (WHERE estado_caja = 'FINALIZADO') AS finalizadas,
           -- Cajas registradas con al menos un FUID. Se cuenta sobre
           -- modulos_caja, y no sobre los códigos distintos de fuiddatosreal,
           -- para que cuadre con total_cajas.
           COUNT(*) FILTER (
             WHERE EXISTS (SELECT 1 FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo)
           ) AS con_fuids
    FROM modulos_caja mc
  )
  SELECT f.total AS total_fuids,
         f.aprobados AS fuids_aprobados,
         c.total AS total_cajas,
         c.en_proceso AS cajas_en_proceso,
         c.finalizadas AS cajas_finalizadas,
         c.con_fuids AS cajas_con_fuids,
         -- Actas y clientes registrados de verdad: antes se contaban números de
         -- acta escritos a mano en los FUID, que no coinciden con los creados.
         (SELECT COUNT(*) FROM moduloscliente) AS total_actas,
         (SELECT COUNT(*) FROM sub_modulos) AS total_clientes,
         (SELECT COUNT(*) FROM users) AS total_usuarios
  FROM fuids f, cajas c`;

/** Resumen agregado del negocio: todos los conteos se calculan con SQL real. */
export async function estadisticasProduccion(_req: Request, res: Response): Promise<void> {
  const [
    conteos,
    porEstadoCaja,
    serieDigitacion,
    fuidsPorSede,
    digitadores,
    usuariosPorRol,
    cajasPorEstado,
    avancePorSubmodulo,
    actividadReciente,
  ] = await Promise.all([
    queryOne<Conteos>(SQL_CONTEOS),
    query<{ estado: string; total: number }>(
      `SELECT COALESCE(mc.estado_caja, 'SIN ESTADO') AS estado, COUNT(*) AS total
       FROM fuiddatosreal f
       LEFT JOIN modulos_caja mc ON f.caja = mc.caja_modulo
       GROUP BY mc.estado_caja
       ORDER BY total DESC`,
    ),
    query<PuntoDeSerie>(SQL_SERIE_DIGITACION),
    query<{ sede: string; total: number }>(
      `SELECT sede, COUNT(*) AS total
       FROM fuiddatosreal
       WHERE sede IS NOT NULL AND sede <> ''
       GROUP BY sede
       ORDER BY total DESC`,
    ),
    // Todos los digitadores (elaborado_por tiene el formato "NOMBRE (CC)"); se cruza
    // con users por la cédula para traer rol y sede cuando la persona sigue registrada.
    query<{
      nombre: string;
      cc: string | null;
      rol: string | null;
      sede: string | null;
      total: number;
      aprobados: number;
      cajas: number;
      ultimo_registro: string | null;
    }>(
      `SELECT f.elaborado_por AS nombre,
              substring(f.elaborado_por from '[(]([^)]*)[)]') AS cc,
              MAX(u.rol) AS rol,
              MAX(u.sede) AS sede,
              COUNT(*) AS total,
              SUM(CASE WHEN f.historial_y_cambios = 'OK' THEN 1 ELSE 0 END) AS aprobados,
              COUNT(DISTINCT f.caja) AS cajas,
              MAX(f.fecha_del_dato) AS ultimo_registro
       FROM fuiddatosreal f
       LEFT JOIN users u ON u.cc = substring(f.elaborado_por from '[(]([^)]*)[)]')
       WHERE f.elaborado_por IS NOT NULL AND f.elaborado_por <> ''
       GROUP BY f.elaborado_por
       ORDER BY total DESC`,
    ),
    query<{ rol: string; total: number }>(
      `SELECT rol, COUNT(*) AS total FROM users GROUP BY rol ORDER BY total DESC`,
    ),
    query<{ estado: string; total: number }>(
      `SELECT COALESCE(NULLIF(estado_caja, ''), 'SIN ESTADO') AS estado, COUNT(*) AS total
       FROM modulos_caja
       GROUP BY estado
       ORDER BY total DESC`,
    ),
    query<{ submodulo: string; entidad: string; total: number; aprobados: number }>(
      `SELECT sm.codigo AS submodulo,
              sm.entidad_remitente AS entidad,
              COUNT(f.id) AS total,
              SUM(CASE WHEN f.historial_y_cambios = 'OK' THEN 1 ELSE 0 END) AS aprobados
       FROM sub_modulos sm
       JOIN moduloscliente mcl ON mcl.id_submodulo = sm.id
       JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
       JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
       GROUP BY sm.id, sm.codigo, sm.entidad_remitente
       ORDER BY total DESC
       LIMIT 8`,
    ),
    query<{ dia: string; total: number }>(
      `SELECT dia, total FROM (
         SELECT to_char(fecha_cambio, 'YYYY-MM-DD') AS dia, COUNT(*) AS total
         FROM historial
         WHERE fecha_cambio IS NOT NULL
         GROUP BY dia
         ORDER BY dia DESC
         LIMIT 30
       ) AS ultimos
       ORDER BY dia ASC`,
    ),
  ]);

  const num = (v: unknown): number => Number(v ?? 0);

  const totalFuidsN = num(conteos?.total_fuids);
  const totalCajasN = num(conteos?.total_cajas);
  const cajasConFuidsN = num(conteos?.cajas_con_fuids);
  const totalActasN = num(conteos?.total_actas);

  res.json({
    total_fuids: totalFuidsN,
    total_cajas: totalCajasN,
    cajas_en_proceso: num(conteos?.cajas_en_proceso),
    cajas_finalizadas: num(conteos?.cajas_finalizadas),
    fuids_aprobados: num(conteos?.fuids_aprobados),
    fuids_pendientes: totalFuidsN - num(conteos?.fuids_aprobados),
    cajas_con_fuids: cajasConFuidsN,
    cajas_sin_fuids: totalCajasN - cajasConFuidsN,
    promedio_fuids_por_caja: cajasConFuidsN > 0 ? Math.round((totalFuidsN / cajasConFuidsN) * 10) / 10 : 0,
    total_modulos_cliente: totalActasN,
    total_usuarios: num(conteos?.total_usuarios),
    por_estado_caja: porEstadoCaja.map((r) => ({ estado: r.estado, total: num(r.total) })),
    fuids_por_mes: serieDigitacion
      .filter((r) => r.granularidad === 'mes')
      .map((r) => ({ mes: r.etiqueta, total: num(r.total), aprobados: num(r.aprobados) })),
    fuids_por_dia: serieDigitacion
      .filter((r) => r.granularidad === 'dia')
      .map((r) => ({ dia: r.etiqueta, total: num(r.total), aprobados: num(r.aprobados) })),
    fuids_por_sede: fuidsPorSede.map((r) => ({ sede: r.sede, total: num(r.total) })),
    digitadores: digitadores.map((r) => ({
      nombre: r.nombre,
      cc: r.cc && r.cc !== r.nombre ? r.cc : null,
      rol: r.rol ?? null,
      sede: r.sede ?? null,
      total: num(r.total),
      aprobados: num(r.aprobados),
      cajas: num(r.cajas),
      ultimo_registro: r.ultimo_registro ?? null,
    })),
    usuarios_por_rol: usuariosPorRol.map((r) => ({ rol: r.rol, total: num(r.total) })),
    total_actas: totalActasN,
    total_clientes: num(conteos?.total_clientes),
    cajas_por_estado: cajasPorEstado.map((r) => ({ estado: r.estado, total: num(r.total) })),
    avance_por_submodulo: avancePorSubmodulo.map((r) => ({
      submodulo: r.submodulo,
      entidad: (r.entidad ?? '').trim(),
      total: num(r.total),
      aprobados: num(r.aprobados),
    })),
    actividad_reciente: actividadReciente.map((r) => ({ dia: r.dia, total: num(r.total) })),
    generado_en: new Date().toISOString(),
  } satisfies EstadisticasProduccion);
}

export interface DiaDeDigitador {
  dia: string;
  registros: number;
  cajas: number;
}

export interface DigitadorDeCliente {
  nombre: string;
  cc: string | null;
  rol: string | null;
  sede: string | null;
  registros: number;
  cajas: string[];
  primer_dia: string;
  ultimo_dia: string;
  por_dia: DiaDeDigitador[];
}

/** Una caja del cliente, con lo que se ha digitado en ella. */
export interface CajaDeCliente {
  caja: string;
  estado: string | null;
  acta: string | null;
  registros: number;
  aprobados: number;
  ultimo_dia: string | null;
  personas: string[];
}

export interface ClienteConDetalle {
  codigo: string;
  cliente: string;
  /** Actas de transferencia registradas al cliente. */
  actas: number;
  cajas: number;
  cajas_finalizadas: number;
  cajas_en_proceso: number;
  /** Cajas creadas en las que todavía no se ha digitado nada. */
  cajas_sin_registros: number;
  registros: number;
  aprobados: number;
  pendientes: number;
  digitadores: DigitadorDeCliente[];
  detalle_cajas: CajaDeCliente[];
}

/**
 * Producción con nombre y apellido: quién digitó, en qué caja y qué día, dentro
 * de cada cliente.
 *
 * El resumen general dice cuánto se produjo, pero no deja ver lo que pasa de
 * verdad en un cliente: dos personas trabajando a la vez en cajas distintas, o
 * una que lleva tres días sin tocar la suya. Eso solo se ve bajando al detalle,
 * y es lo que devuelve esto.
 *
 * Una sola consulta trae las filas al nivel más fino —cliente, digitador, día y
 * caja— y el agrupado se arma aquí: agregarlo en SQL obligaría a tres consultas
 * y a repetir los mismos JOIN.
 */
export async function produccionDetallada(req: Request, res: Response): Promise<void> {
  const desde = String(req.query.desde ?? '').trim();
  const hasta = String(req.query.hasta ?? '').trim();

  const persona = String(req.query.persona ?? '').trim();

  const where: string[] = ["f.elaborado_por IS NOT NULL", "f.elaborado_por <> ''"];
  const params: unknown[] = [];
  if (desde) { where.push('f.fecha_del_dato >= ?'); params.push(desde); }
  if (hasta) { where.push('f.fecha_del_dato <= ?'); params.push(hasta); }
  // El filtro por persona se aplica en la consulta y no al pintar: así las
  // cifras del cliente son las de esa persona, no las del total con la lista
  // recortada.
  if (persona) { where.push('f.elaborado_por = ?'); params.push(persona); }

  const filas = await query<{
    codigo: string | null;
    cliente: string | null;
    digitador: string;
    cc: string | null;
    rol: string | null;
    sede: string | null;
    dia: string | null;
    caja: string | null;
    registros: number;
  }>(
    `SELECT s.codigo AS codigo,
            s.entidad_remitente AS cliente,
            f.elaborado_por AS digitador,
            substring(f.elaborado_por from '[(]([^)]*)[)]') AS cc,
            MAX(u.rol) AS rol,
            MAX(u.sede) AS sede,
            f.fecha_del_dato AS dia,
            f.caja AS caja,
            COUNT(*) AS registros
     FROM fuiddatosreal f
     JOIN modulos_caja mc ON mc.caja_modulo = f.caja
     JOIN moduloscliente m ON m.id = mc.id_modulo_caja
     JOIN sub_modulos s ON s.id = m.id_submodulo
     LEFT JOIN users u ON u.cc = substring(f.elaborado_por from '[(]([^)]*)[)]')
     WHERE ${where.join(' AND ')}
     GROUP BY s.codigo, s.entidad_remitente, f.elaborado_por, f.fecha_del_dato, f.caja
     ORDER BY s.codigo, f.elaborado_por, f.fecha_del_dato DESC`,
    params,
  );

  const clientes = new Map<string, ClienteConDetalle>();
  const digitadores = new Map<string, DigitadorDeCliente>();
  const dias = new Map<string, Map<string, { registros: number; cajas: Set<string> }>>();
  const cajasPorCliente = new Map<string, Set<string>>();
  const cajasPorDigitador = new Map<string, Set<string>>();

  for (const f of filas) {
    const codigo = f.codigo ?? 'Sin código';
    const claveDigitador = `${codigo}|${f.digitador}`;
    const registros = Number(f.registros);

    if (!clientes.has(codigo)) {
      clientes.set(codigo, {
        codigo,
        cliente: f.cliente ?? 'Sin nombre',
        actas: 0,
        cajas: 0,
        cajas_finalizadas: 0,
        cajas_en_proceso: 0,
        cajas_sin_registros: 0,
        registros: 0,
        aprobados: 0,
        pendientes: 0,
        digitadores: [],
        detalle_cajas: [],
      });
      cajasPorCliente.set(codigo, new Set());
    }
    const cliente = clientes.get(codigo)!;
    cliente.registros += registros;
    if (f.caja) cajasPorCliente.get(codigo)!.add(f.caja);

    if (!digitadores.has(claveDigitador)) {
      digitadores.set(claveDigitador, {
        nombre: f.digitador,
        cc: f.cc,
        rol: f.rol,
        sede: f.sede,
        registros: 0,
        cajas: [],
        primer_dia: f.dia ?? '',
        ultimo_dia: f.dia ?? '',
        por_dia: [],
      });
      cajasPorDigitador.set(claveDigitador, new Set());
      dias.set(claveDigitador, new Map());
      cliente.digitadores.push(digitadores.get(claveDigitador)!);
    }
    const digitador = digitadores.get(claveDigitador)!;
    digitador.registros += registros;
    if (f.caja) cajasPorDigitador.get(claveDigitador)!.add(f.caja);
    if (f.dia) {
      if (!digitador.primer_dia || f.dia < digitador.primer_dia) digitador.primer_dia = f.dia;
      if (!digitador.ultimo_dia || f.dia > digitador.ultimo_dia) digitador.ultimo_dia = f.dia;
      const porDia = dias.get(claveDigitador)!;
      const actual = porDia.get(f.dia) ?? { registros: 0, cajas: new Set<string>() };
      actual.registros += registros;
      if (f.caja) actual.cajas.add(f.caja);
      porDia.set(f.dia, actual);
    }
  }

  for (const [clave, digitador] of digitadores) {
    digitador.cajas = [...(cajasPorDigitador.get(clave) ?? [])].sort();
    digitador.por_dia = [...(dias.get(clave) ?? [])]
      .map(([dia, v]) => ({ dia, registros: v.registros, cajas: v.cajas.size }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
  }
  for (const [, cliente] of clientes) {
    cliente.digitadores.sort((a, b) => b.registros - a.registros);
  }

  /*
   * Las cajas se piden aparte y con LEFT JOIN: una caja recién creada, sin
   * registros todavía, no aparece en la consulta de digitación, y es justo la
   * que hay que ver para saber cuánto falta.
   */
  /*
   * Los filtros van dentro del LEFT JOIN, no en un WHERE: en el WHERE
   * descartarían las cajas sin registros, que son precisamente las que hay que
   * seguir viendo para saber lo que falta.
   */
  const condicionesCaja = [
    desde ? 'AND f.fecha_del_dato >= ?' : '',
    hasta ? 'AND f.fecha_del_dato <= ?' : '',
    persona ? 'AND f.elaborado_por = ?' : '',
  ].filter(Boolean).join(' ');
  const paramsCaja = [desde, hasta, persona].filter(Boolean);

  const cajas = await query<{
    codigo: string | null;
    cliente: string | null;
    caja: string;
    estado: string | null;
    acta: string | null;
    registros: number;
    aprobados: number;
    ultimo_dia: string | null;
    personas: string | null;
  }>(
    `SELECT s.codigo AS codigo,
            s.entidad_remitente AS cliente,
            mc.caja_modulo AS caja,
            mc.estado_caja AS estado,
            m.acta_transferencia_modulo AS acta,
            COUNT(f.id) AS registros,
            SUM(CASE WHEN f.historial_y_cambios = 'OK' THEN 1 ELSE 0 END) AS aprobados,
            MAX(f.fecha_del_dato) AS ultimo_dia,
            string_agg(DISTINCT f.elaborado_por, ' | ') AS personas
     FROM modulos_caja mc
     JOIN moduloscliente m ON m.id = mc.id_modulo_caja
     JOIN sub_modulos s ON s.id = m.id_submodulo
     LEFT JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
       ${condicionesCaja}
     GROUP BY s.codigo, s.entidad_remitente, mc.caja_modulo, mc.estado_caja, m.acta_transferencia_modulo
     ORDER BY s.codigo, mc.caja_modulo`,
    paramsCaja,
  );

  const actasPorCliente = await query<{ codigo: string | null; actas: number }>(
    `SELECT s.codigo AS codigo, COUNT(DISTINCT m.id) AS actas
     FROM moduloscliente m
     JOIN sub_modulos s ON s.id = m.id_submodulo
     GROUP BY s.codigo`,
  );

  for (const c of cajas) {
    const codigo = c.codigo ?? 'Sin código';
    if (!clientes.has(codigo)) {
      // Cliente con cajas pero sin digitación todavía: también cuenta.
      clientes.set(codigo, {
        codigo,
        cliente: c.cliente ?? 'Sin nombre',
        actas: 0,
        cajas: 0,
        cajas_finalizadas: 0,
        cajas_en_proceso: 0,
        cajas_sin_registros: 0,
        registros: 0,
        aprobados: 0,
        pendientes: 0,
        digitadores: [],
        detalle_cajas: [],
      });
    }
    const cliente = clientes.get(codigo)!;
    const registros = Number(c.registros);
    const aprobados = Number(c.aprobados ?? 0);

    cliente.cajas += 1;
    if ((c.estado ?? '').toUpperCase() === 'FINALIZADO') cliente.cajas_finalizadas += 1;
    else cliente.cajas_en_proceso += 1;
    if (registros === 0) cliente.cajas_sin_registros += 1;
    cliente.aprobados += aprobados;

    cliente.detalle_cajas.push({
      caja: c.caja,
      estado: c.estado,
      acta: c.acta,
      registros,
      aprobados,
      ultimo_dia: c.ultimo_dia,
      personas: (c.personas ?? '').split(' | ').filter(Boolean),
    });
  }

  for (const acta of actasPorCliente) {
    const cliente = clientes.get(acta.codigo ?? 'Sin código');
    if (cliente) cliente.actas = Number(acta.actas);
  }

  for (const [, cliente] of clientes) {
    cliente.pendientes = cliente.registros - cliente.aprobados;
  }

  res.json([...clientes.values()].sort((a, b) => b.registros - a.registros));
}

/**
 * Seguimiento de inventario, en el formato oficial F-PSD-IDA-001.
 *
 * Una fila por jornada, cliente, colaborador y acta: el rango de cajas que tocó,
 * el rango de UPD que consumió y cuántos registros sacó. Es el reporte de avance
 * que hasta ahora se llenaba a mano.
 *
 * Sobre los números de caja y de UPD: el formato los pide como cifras, no como
 * los códigos completos. Una caja es `051C002406` y en el seguimiento va 2406; un
 * UPD es `UPD1040018` y va 1040018. Se extraen con una expresión regular que
 * además **descarta lo que no tenga la forma esperada**: un `N/A` o un código a
 * medias dejaría la columna en blanco en lugar de tumbar la consulta con un error
 * de conversión.
 *
 * Las tres columnas de caja responden a tres preguntas distintas:
 *
 * - **#CAJA_INI** y **#CAJ_FIN** son la primera y la última caja que se tocaron
 *   ese día, en orden cronológico de digitación y no por número. Quien lee el
 *   informe quiere saber por dónde empezó y dónde se quedó, y eso no siempre
 *   coincide con el menor y el mayor número de caja.
 * - **TOT_CAJ** son las cajas que **quedaron terminadas** esa jornada, no las
 *   que se tocaron. Una caja que se trabaja lunes y martes se contaba antes los
 *   dos días, así que el total del periodo salía inflado; ahora cuenta una vez,
 *   el día en que se cerró. La suma de la columna es producción real.
 *
 * Que una caja quedara a medias se lee sin ninguna columna nueva: la caja que
 * sigue abierta aparece como caja final de un día y como caja inicial del
 * siguiente. Cuándo se cierra una caja y por qué está en `cicloCaja.service.ts`.
 *
 * **Una caja pertenece a la jornada de su último registro**, y eso se deduce de
 * los propios registros, no de ningún estado guardado en la caja. Es una
 * decisión deliberada y costó un fallo aprenderla: contar con el estado dejaba
 * fuera todo lo digitado antes de que ese estado existiera, y el informe salía
 * con cero cajas terminadas en jornadas en las que se habían terminado varias.
 * Deducirlo de los registros vale para todo el histórico sin tocar un solo dato,
 * y no le pide a nadie que marque nada.
 *
 * El cierre cae en una sola jornada porque se exigen las dos cosas a la vez: el
 * día del último registro y su autor. Si dos técnicas tocaron la misma caja el
 * mismo día, la caja cuenta para quien digitó el último registro, no para las dos.
 *
 * La contrapartida: una caja que queda a medias al acabar el día cuenta ese día
 * y se mueve al siguiente en cuanto se retoma. El total de un periodo ya cerrado
 * siempre es exacto; solo el día en curso puede ir por delante, y como mucho por
 * la caja que se está trabajando.
 *
 * **Los JOIN son LEFT a propósito.** Con JOIN interno, un registro cuya caja no
 * tenga fila en `modulos_caja` —cosa corriente entre los registros heredados de
 * la base antigua— desaparecía del informe sin dejar rastro, y el seguimiento
 * salía casi vacío sin que nada avisara. Ahora el registro aparece igual, con el
 * código de cliente en blanco si no se pudo averiguar: el documento es de
 * productividad, y una jornada de trabajo cuenta aunque falte su ficha de caja.
 *
 * El número de acta se toma del propio registro FUID, que es lo que escribió
 * quien digitó, y solo si viene vacío se cae al del acta relacionada. Se
 * escribe como lo pide el seguimiento, "ACTA 122-2026": el número y el año en
 * que se creó el acta, con guion. Es el único documento donde va así; el
 * inventario del cliente lleva el número tal cual está guardado.
 */
/** El número de caja que pide el formato: de `051C002406` sale 2406. */
const NUMERO_DE_CAJA = `NULLIF(substring(f.caja from '^[0-9]{3}C([0-9]{6})$'), '')::int`;

/**
 * A partir de qué salto se considera que la técnica cambió de lista de UPD.
 *
 * Por debajo es un número salteado dentro de la misma lista, que pasa a diario y
 * no dice nada; por encima son números de otra serie. Si en la operación las
 * listas nuevas llegaran a arrancar más cerca, este es el valor que hay que
 * bajar.
 */
const SALTO_DE_LISTA = 50;

/** El número del UPD que pide el formato: de `UPD2950001` sale 2950001. */
const NUMERO_DE_UPD = `NULLIF(substring(f.upd from '^UPD([0-9]{7})$'), '')::int`;

/** El número de acta: el del registro y, si viene vacío, el del acta relacionada. */
const NUMERO_DE_ACTA = `COALESCE(NULLIF(f.nro_acta_transferible, 'N/A'), mcl.acta_transferencia_modulo)`;

/** El año del acta: el de su creación y, si no lo tiene, el de la transferencia. */
const AÑO_DEL_ACTA = `EXTRACT(YEAR FROM COALESCE(mcl.created_at, mcl.fecha_trans_modulo))::int::text`;

/**
 * La consulta del seguimiento, con el filtro de la petición ya dentro.
 *
 * Se arma con una función y no como texto suelto porque el filtro va en el
 * interior: la consulta agrupa en dos pasos y el `WHERE` tiene que aplicarse
 * antes de agrupar, no después.
 */
export function consultaSeguimiento(where: string): string {
  return `
  WITH base AS (
    SELECT f.fecha_del_dato AS fecha,
           mcl.codigo       AS codigo_cliente,
           f.elaborado_por  AS colaborador,
           /*
            * "ACTA 122-2026": el número y el año del acta, con guion. Un registro
            * heredado sin ficha de caja no tiene acta relacionada y sale sin año.
            */
           CASE
             WHEN ${NUMERO_DE_ACTA} IS NULL THEN NULL
             WHEN ${AÑO_DEL_ACTA} IS NULL THEN 'ACTA ' || ${NUMERO_DE_ACTA}
             ELSE 'ACTA ' || ${NUMERO_DE_ACTA} || '-' || ${AÑO_DEL_ACTA}
           END AS acta,
           f.caja,
           f.created_at,
           f.id,
           ${NUMERO_DE_CAJA} AS num_caja,
           ${NUMERO_DE_UPD}  AS num_upd,
           /*
            * Este registro es el último de su caja, es decir, el que la da por
            * terminada. Se marca por identificador y no por fecha y autor: así
            * queda marcado exactamente uno por caja, y la caja cuenta en una
            * sola fila del informe aunque la jornada se parta en varios tramos.
            */
           (f.id = cierre.id_cierre) AS cierra_la_caja
    FROM fuiddatosreal f
    LEFT JOIN modulos_caja mc ON mc.caja_modulo = f.caja
    LEFT JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
    LEFT JOIN (
      SELECT DISTINCT ON (caja) caja, id AS id_cierre
        FROM fuiddatosreal
       ORDER BY caja, created_at DESC NULLS LAST, id DESC
    ) cierre ON cierre.caja = f.caja
    WHERE ${where}
  ),
  /*
   * Tramos de UPD dentro de una misma jornada.
   *
   * Cuando a una técnica se le acaba la lista de UPD y le asignan otra, sigue
   * digitando en la misma caja pero con números que empiezan en otro sitio. Con
   * una sola fila por jornada eso desaparecía del informe: se publicaba el menor
   * y el mayor, y un salto de cien mil quedaba dentro de un rango que daba a
   * entender que se habían usado cien mil UPD. Ahora cada lista sale en su
   * propia fila, con su propio rango, y el cambio se ve.
   *
   * Un hueco pequeño NO abre un tramo. Saltarse un número pasa a diario —un UPD
   * que se repetía, uno que se borró después— y partir la fila por eso llenaría
   * el informe de renglones que no cuentan nada. Lo que se quiere ver es el
   * cambio de lista, y eso se reconoce porque el número da un salto grande:
   * de ahí el umbral de ${SALTO_DE_LISTA}.
   *
   * Los registros cuyo UPD no tiene la forma esperada van al final y se quedan
   * con el último tramo: no hay número con el que situarlos, y darles fila
   * propia sería inventarse una lista que nadie usó.
   */
  marcas AS (
    SELECT b.*,
           CASE
             WHEN b.num_upd - LAG(b.num_upd) OVER (
                    PARTITION BY b.fecha, b.codigo_cliente, b.colaborador, b.acta
                    ORDER BY b.num_upd
                  ) > ${SALTO_DE_LISTA} THEN 1
             ELSE 0
           END AS abre_tramo
      FROM base b
  ),
  tramos AS (
    SELECT m.*,
           SUM(m.abre_tramo) OVER (
             PARTITION BY m.fecha, m.codigo_cliente, m.colaborador, m.acta
             ORDER BY m.num_upd
             ROWS UNBOUNDED PRECEDING
           ) AS tramo
      FROM marcas m
  )
  SELECT fecha,
         codigo_cliente,
         /*
          * Primera y última caja en orden real de digitación. Los registros
          * heredados de la base antigua no traen "created_at", así que van
          * primero, que es donde les corresponde por antigüedad, y el
          * identificador desempata.
          */
         (array_agg(num_caja ORDER BY created_at ASC NULLS FIRST, id ASC) FILTER (WHERE num_caja IS NOT NULL))[1] AS caja_ini,
         (array_agg(num_caja ORDER BY created_at DESC NULLS LAST, id DESC) FILTER (WHERE num_caja IS NOT NULL))[1] AS caja_fin,
         COUNT(*) FILTER (WHERE cierra_la_caja) AS total_cajas,
         MIN(num_upd)  AS upd_ini,
         MAX(num_upd)  AS upd_fin,
         COUNT(*)      AS total_registros,
         colaborador,
         acta
    FROM tramos
   GROUP BY fecha, codigo_cliente, colaborador, acta, tramo
   ORDER BY fecha, codigo_cliente, colaborador, MIN(num_upd) NULLS LAST`;
}


/**
 * Filtros del seguimiento, compartidos por el resumen y la descarga para que los
 * dos cuenten exactamente lo mismo.
 *
 * Sin exigir colaborador. Antes se pedía `elaborado_por IS NOT NULL`, y eso
 * borraba del informe toda la producción heredada de la base antigua, que no lo
 * trae. El seguimiento tiene que llevar todo lo digitado: si no se sabe quién lo
 * hizo, la columna va en blanco y la jornada se cuenta igual.
 */
function filtrosSeguimiento(req: Request): {
  where: string;
  params: unknown[];
  desde: string;
  hasta: string;
  persona: string;
} {
  const desde = String(req.query.desde ?? '').trim();
  const hasta = String(req.query.hasta ?? '').trim();
  const persona = String(req.query.persona ?? '').trim();
  const condiciones: string[] = ['TRUE'];
  const params: unknown[] = [];
  if (desde) {
    condiciones.push('f.fecha_del_dato >= ?');
    params.push(desde);
  }
  if (hasta) {
    condiciones.push('f.fecha_del_dato <= ?');
    params.push(hasta);
  }
  if (persona) {
    condiciones.push('f.elaborado_por = ?');
    params.push(persona);
  }
  return { where: condiciones.join(' AND '), params, desde, hasta, persona };
}

/**
 * `GET /seguimiento-inventario/resumen?desde=&hasta=&persona=`
 *
 * Cuántas jornadas y cuántos registros va a llevar el documento. La pantalla lo
 * pide antes de generar para poder decir "armando el formato con 1.245
 * jornadas" en vez de un "generando…" mudo: es una etapa real del proceso, no
 * un mensaje puesto a tiempo.
 */
export async function resumenSeguimientoInventario(req: Request, res: Response): Promise<void> {
  const { where, params } = filtrosSeguimiento(req);
  const [fila] = await query<{ jornadas: number | string; registros: number | string }>(
    `SELECT COUNT(*) AS jornadas, COALESCE(SUM(t.total_registros), 0) AS registros
     FROM (${consultaSeguimiento(where)}) t`,
    params,
  );
  res.json({ jornadas: Number(fila?.jornadas ?? 0), registros: Number(fila?.registros ?? 0) });
}

/** `GET /seguimiento-inventario/excel?desde=&hasta=&persona=` */
export async function descargarSeguimientoInventario(req: Request, res: Response): Promise<void> {
  const { where, params, desde, hasta } = filtrosSeguimiento(req);

  const filas = await query<FilaSeguimiento>(consultaSeguimiento(where), params);

  if (filas.length === 0) {
    /*
     * Si no salió nada, el aviso dice si es porque no hay registros o porque los
     * filtros los dejaron todos fuera. Un "no hay datos" a secas obliga a quien
     * lo lee a adivinar cuál de las dos cosas pasó.
     */
    const [total] = await query<{ total: number }>('SELECT COUNT(*) AS total FROM fuiddatosreal');
    const registros = total?.total ?? 0;
    res.status(404).json({
      error:
        registros === 0
          ? 'Todavía no hay registros digitados para armar el seguimiento'
          : `Ningún registro encaja con esos filtros. Hay ${registros.toLocaleString('es-CO')} registros digitados en total.`,
    });
    return;
  }

  const buffer = await construirSeguimientoInventario(filas);
  const nombre = seguimientoFilename(desde || null, hasta || null, fechaHoyLocal());

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // `filename*` va con el nombre codificado: algunos navegadores cortan la
  // descarga si llegan caracteres sin codificar.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nombre.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  );
  /*
   * Cuántas jornadas lleva el documento. La pantalla lo dice al terminar, para
   * que quien descarga sepa si trae lo que esperaba sin abrir el archivo: un
   * seguimiento que sale con dos filas cuando deberían ser mil es un problema
   * que conviene ver en el momento, no al entregarlo.
   */
  res.setHeader('X-Total-Jornadas', String(filas.length));
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Jornadas, Content-Disposition');
  res.send(buffer);

  void audit({
    entidad: 'reportes',
    entidadId: 'seguimiento-inventario',
    accion: 'DESCARGAR',
    detalle: `Seguimiento de inventario${desde || hasta ? ` (${desde || 'inicio'} a ${hasta || 'hoy'})` : ''} con ${filas.length} jornadas`,
    usuario: req.session.user,
  });
}
