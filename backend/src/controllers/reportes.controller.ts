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
  fuids_por_mes: Array<{ mes: string; total: number; aprobados: number }>;
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
    digitadores,
    usuariosPorRol,
    cajasPorEstado,
    avancePorSubmodulo,
    actividadReciente,
    totalActas,
    totalClientes,
  ] = await Promise.all([
    query<{ n: number }>('SELECT COUNT(*) AS n FROM fuiddatosreal'),
    query<{ n: number }>('SELECT COUNT(*) AS n FROM modulos_caja'),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM modulos_caja WHERE estado_caja = 'EN PROCESO'"),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM modulos_caja WHERE estado_caja = 'FINALIZADO'"),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM fuiddatosreal WHERE historial_y_cambios = 'OK'"),
    // Cajas registradas que tienen al menos un FUID (se cuenta sobre modulos_caja,
    // no sobre los códigos distintos de fuiddatosreal, para que cuadre con total_cajas).
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM modulos_caja mc
       WHERE EXISTS (SELECT 1 FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo)`,
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
    query<{ mes: string; total: number; aprobados: number }>(
      `SELECT mes, total, aprobados FROM (
         SELECT to_char(f.fecha_del_dato, 'YYYY-MM') AS mes,
                COUNT(*) AS total,
                SUM(CASE WHEN f.historial_y_cambios = 'OK' THEN 1 ELSE 0 END) AS aprobados
         FROM fuiddatosreal f
         WHERE f.fecha_del_dato IS NOT NULL
           AND CAST(f.fecha_del_dato AS CHAR) <> ''
         GROUP BY mes
         ORDER BY mes DESC
         LIMIT 12
       ) AS ultimos
       ORDER BY mes ASC`,
    ),
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
    // Actas y clientes registrados de verdad (antes se contaban números de acta
    // escritos a mano en los FUID, que no coinciden con las actas creadas).
    query<{ n: number }>('SELECT COUNT(*) AS n FROM moduloscliente'),
    query<{ n: number }>('SELECT COUNT(*) AS n FROM sub_modulos'),
  ]);

  const num = (v: unknown): number => Number(v ?? 0);

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
    por_estado_caja: porEstadoCaja.map((r) => ({ estado: r.estado, total: num(r.total) })),
    fuids_por_mes: fuidsPorMes.map((r) => ({
      mes: r.mes,
      total: num(r.total),
      aprobados: num(r.aprobados),
    })),
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
    total_actas: Number(totalActas[0]?.n ?? 0),
    total_clientes: Number(totalClientes[0]?.n ?? 0),
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
