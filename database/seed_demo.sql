-- Datos de DEMOSTRACIÓN para recorrer el flujo completo del sistema.
-- Script idempotente: puede ejecutarse varias veces sin duplicar.
--
-- QUÉ HACE Y QUÉ NO:
--   * NO inventa registros FUID: ya hay 81.000 reales importados de schema.sql.
--   * Las cifras de `inventario` se DERIVAN de esos datos reales (cajas, registros,
--     rango de cajas, fechas), así que el previsualizador muestra números verdaderos.
--   * Los únicos valores estimados son el reparto por tipo de caja (X200/X300/X400/NC),
--     porque el FUID no guarda esa información. Van marcados como demo.
--
-- CÓMO REVERTIR: database/seed_demo_revertir.sql borra los inventarios por
-- código de cliente. Se firma con el nombre del líder (no con una marca técnica)
-- porque esa columna es visible en pantalla durante la demostración.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Inventario por cliente (pantalla /inventario)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO inventario (
  CODIGO_DEL_CLIENTE, CLIENTE, No_ACTA, FECHA_TRANSFERENCIA,
  X200, X300, X400, NC, TOTAL_CAJAS, ANEXOS,
  FECHA_ENTREGA_CUSTODIA, FUNCIONARIO, ESTADO_DEL_INVENTARIO,
  CAJAS_PROCESADAS, CAJA_INICIAR, CAJ_FIN, REGISTROS_PROCESADOS,
  FECHA_ENTREGA, INICIO_INVENTARIO, FIN_INVENTARIO, ESTADO_ENTREGA,
  MES_ENTREGA_PACA, USUARIO_ACTUALIZACION
)
SELECT
  d.codigo,
  TRIM(d.cliente),
  d.acta,
  d.fecha_trans,
  -- Reparto por tipo de caja: estimación de demostración (el FUID no lo registra).
  ROUND(d.cajas * 0.60),
  ROUND(d.cajas * 0.25),
  ROUND(d.cajas * 0.10),
  GREATEST(d.cajas - ROUND(d.cajas * 0.60) - ROUND(d.cajas * 0.25) - ROUND(d.cajas * 0.10), 0),
  d.cajas,
  CONCAT(d.cajas_con_fuid, ' cajas con inventario documental'),
  d.hasta,
  d.funcionario,
  CASE
    WHEN d.registros = 0 THEN 'PENDIENTE'
    WHEN d.aprobados >= d.registros * 0.8 THEN 'FINALIZADO'
    WHEN d.aprobados > 0 THEN 'EN PROCESO'
    ELSE 'PENDIENTE'
  END,
  d.cajas_con_fuid,
  d.caja_ini,
  d.caja_fin,
  d.registros,
  d.hasta,
  d.desde,
  d.hasta,
  CASE WHEN d.aprobados >= d.registros * 0.8 THEN 'ENTREGADO' ELSE 'EN PROCESO' END,
  UPPER(DATE_FORMAT(d.hasta, '%M %Y')),
  d.funcionario
FROM (
  SELECT
    mcl.codigo,
    MAX(mcl.entidad_remitente)              AS cliente,
    MAX(mcl.acta_transferencia_modulo)      AS acta,
    MAX(mcl.fecha_trans_modulo)             AS fecha_trans,
    COUNT(DISTINCT mc.caja_modulo)          AS cajas,
    COUNT(DISTINCT f.caja)                  AS cajas_con_fuid,
    COUNT(f.id)                             AS registros,
    SUM(CASE WHEN f.historial_y_cambios = 'OK' THEN 1 ELSE 0 END) AS aprobados,
    MIN(mc.caja_modulo)                     AS caja_ini,
    MAX(mc.caja_modulo)                     AS caja_fin,
    MIN(f.fecha_del_dato)                   AS desde,
    MAX(f.fecha_del_dato)                   AS hasta,
    (SELECT nombre FROM users WHERE rol = 'LIDER' ORDER BY id LIMIT 1) AS funcionario
  FROM moduloscliente mcl
  JOIN modulos_caja mc   ON mc.id_modulo_caja = mcl.id
  LEFT JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
  GROUP BY mcl.codigo
  HAVING registros > 0
) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM inventario i WHERE i.CODIGO_DEL_CLIENTE = d.codigo
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Consecutivo UPD de los técnicos (flujo de digitación)
--    Se toma el último UPD que cada técnico ya digitó en cada caja, para que el
--    formulario abra con el siguiente puesto en lugar de pedir el número inicial.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE asignacion_caja_tecnica act
JOIN modulos_caja mc ON mc.id = act.modulo_id
JOIN users u         ON u.id = act.usuario_id
JOIN (
  SELECT caja, elaborado_por, MIN(upd) AS primer_upd, MAX(upd) AS ultimo_upd
  FROM fuiddatosreal
  WHERE upd REGEXP '^UPD[0-9]{7}$' AND elaborado_por IS NOT NULL AND elaborado_por <> ''
  GROUP BY caja, elaborado_por
) AS reales
  ON reales.caja = mc.caja_modulo
 AND reales.elaborado_por LIKE CONCAT(u.nombre, '%')
SET act.upd_inicio = reales.primer_upd,
    act.ultimo_upd = reales.ultimo_upd
WHERE act.upd_inicio IS NULL AND act.ultimo_upd IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cobertura del rol CALIDAD (pantalla de revisión)
--    Sin asignaciones, quien revisa entra a una lista vacía. La jerarquía tiene
--    tres niveles y cada uno apunta a una tabla distinta:
--      asignacion_calidad  -> sub_modulos
--      modulo_calidad      -> moduloscliente
--      asignacion_caja_calidad -> modulos_caja
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 Nivel submódulo
INSERT INTO asignacion_calidad (modulo_id, usuario_id)
SELECT sm.id, u.id
FROM sub_modulos sm
CROSS JOIN (SELECT id FROM users WHERE rol = 'CALIDAD') AS u
WHERE NOT EXISTS (
  SELECT 1 FROM asignacion_calidad ac WHERE ac.modulo_id = sm.id AND ac.usuario_id = u.id
);

-- 3.2 Nivel módulo cliente (solo los que tienen registros digitados)
INSERT INTO modulo_calidad (modulo_id, usuario_id)
SELECT mcl.id, u.id
FROM moduloscliente mcl
CROSS JOIN (SELECT id FROM users WHERE rol = 'CALIDAD') AS u
WHERE EXISTS (
  SELECT 1 FROM modulos_caja mc
  JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
  WHERE mc.id_modulo_caja = mcl.id
)
AND NOT EXISTS (
  SELECT 1 FROM modulo_calidad mq WHERE mq.modulo_id = mcl.id AND mq.usuario_id = u.id
);

-- 3.3 Nivel caja: se limita a cajas con registros para no crear miles de filas.
INSERT INTO asignacion_caja_calidad (modulo_id, usuario_id)
SELECT mc.id, u.id
FROM modulos_caja mc
CROSS JOIN (SELECT id FROM users WHERE rol = 'CALIDAD') AS u
WHERE EXISTS (SELECT 1 FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo)
AND NOT EXISTS (
  SELECT 1 FROM asignacion_caja_calidad acc WHERE acc.modulo_id = mc.id AND acc.usuario_id = u.id
)
LIMIT 800;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Completa inventarios creados a mano que quedaron con campos vacíos,
--    rellenando SOLO lo que esté en NULL con las cifras reales del cliente.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE inventario i
JOIN (
  SELECT mcl.codigo,
         COUNT(DISTINCT mc.caja_modulo) AS cajas,
         COUNT(DISTINCT f.caja)         AS cajas_con_fuid,
         COUNT(f.id)                    AS registros,
         MIN(mc.caja_modulo)            AS caja_ini,
         MAX(mc.caja_modulo)            AS caja_fin,
         MIN(f.fecha_del_dato)          AS desde,
         MAX(f.fecha_del_dato)          AS hasta
  FROM moduloscliente mcl
  JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
  LEFT JOIN fuiddatosreal f ON f.caja = mc.caja_modulo
  GROUP BY mcl.codigo
) d ON d.codigo = i.CODIGO_DEL_CLIENTE
SET i.CAJAS_PROCESADAS     = COALESCE(i.CAJAS_PROCESADAS, d.cajas_con_fuid),
    i.REGISTROS_PROCESADOS = COALESCE(i.REGISTROS_PROCESADOS, d.registros),
    i.CAJA_INICIAR         = COALESCE(NULLIF(i.CAJA_INICIAR, ''), d.caja_ini),
    i.CAJ_FIN              = COALESCE(NULLIF(i.CAJ_FIN, ''), d.caja_fin),
    i.INICIO_INVENTARIO    = COALESCE(i.INICIO_INVENTARIO, d.desde),
    i.FIN_INVENTARIO       = COALESCE(i.FIN_INVENTARIO, d.hasta),
    i.FUNCIONARIO          = COALESCE(NULLIF(i.FUNCIONARIO, ''),
                                      (SELECT nombre FROM users WHERE rol='LIDER' ORDER BY id LIMIT 1));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Variedad de estados para el recorrido de la demostración.
--    El estado del inventario es un campo OPERATIVO que marca el líder, no un
--    cálculo: aquí se cierran los dos clientes con mayor porcentaje revisado
--    para que la pantalla muestre los tres estados posibles.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE inventario
SET ESTADO_DEL_INVENTARIO = 'FINALIZADO',
    ESTADO_ENTREGA = 'ENTREGADO'
WHERE CODIGO_DEL_CLIENTE IN ('085', '113');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Coherencia: si un inventario quedó con menos cajas totales de las que ya
--    tiene procesadas (típico de un registro creado a mano antes de conocer el
--    volumen real), se ajusta al conteo real de cajas del cliente.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE inventario i
JOIN (
  SELECT mcl.codigo, COUNT(DISTINCT mc.caja_modulo) AS cajas
  FROM moduloscliente mcl
  JOIN modulos_caja mc ON mc.id_modulo_caja = mcl.id
  GROUP BY mcl.codigo
) d ON d.codigo = i.CODIGO_DEL_CLIENTE
SET i.TOTAL_CAJAS = d.cajas,
    i.X200 = ROUND(d.cajas * 0.60),
    i.X300 = ROUND(d.cajas * 0.25),
    i.X400 = ROUND(d.cajas * 0.10),
    i.NC   = GREATEST(d.cajas - ROUND(d.cajas * 0.60) - ROUND(d.cajas * 0.25) - ROUND(d.cajas * 0.10), 0)
WHERE i.TOTAL_CAJAS IS NULL OR i.TOTAL_CAJAS < i.CAJAS_PROCESADAS;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Cajas para el técnico de demostración.
--    Los FUID ya existentes llevan el nombre del técnico que los digitó, así que
--    el contador "FUIDs creados" del panel sigue midiendo su trabajo real; estas
--    cajas sirven para digitar en vivo durante la presentación.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id, upd_inicio, ultimo_upd)
SELECT mc.id, u.id, NULL, NULL
FROM modulos_caja mc
JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
CROSS JOIN (SELECT id FROM users WHERE nombre LIKE 'DEV %' AND rol = 'TECNICA' LIMIT 1) AS u
WHERE mcl.codigo = '113'
AND NOT EXISTS (
  SELECT 1 FROM asignacion_caja_tecnica a WHERE a.modulo_id = mc.id AND a.usuario_id = u.id
);
