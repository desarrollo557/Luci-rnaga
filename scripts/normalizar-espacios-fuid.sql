-- ============================================================================
-- Normalización de espacios en los datos YA GUARDADOS de `fuiddatosreal`.
--
-- NO SE EJECUTA SOLO. Este archivo queda listo a propósito, sin correr, porque
-- toca datos de producción. Léelo entero antes de aplicarlo.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ
-- ---------------------------------------------------------------------------
-- Hasta ahora el middleware `mayusculas` solo hacía `toUpperCase()`, así que
-- 'OFICIO ' y 'OFICIO' entraban como valores distintos. Sobre el volcado de
-- producción (81.171 registros) el recuento es este:
--
--   espacio al inicio o al final     espacios dobles internos
--     entidad_remitente   37.463       asunto                4.710
--     asunto_2            11.768       historial_y_cambios   2.343
--     asunto              11.078       objeto                   63
--     oficina_productora   4.922       caja_interna              2
--     asunto_3             3.645       notas                     1
--     entidad_productora   3.662       asunto_3                  1
--     notas                3.545
--     objeto                 567
--     numero_doc             507
--     numero_doc_hasta       302
--     tomo                   252
--     unidad_administrativa  128
--     caja_interna            91
--     serie                   36
--     folios                  12
--     codigo                  10
--     subserie                 1
--
-- Eso parte en dos el autocompletado, las agrupaciones por serie/subserie y los
-- totales de los reportes. El middleware ya corrige lo que entra de aquí en
-- adelante; este script arregla lo que quedó guardado antes.
--
-- ---------------------------------------------------------------------------
-- CÓMO APLICARLO
-- ---------------------------------------------------------------------------
--   1. Respalda la base. `database/limpiar_bd.ps1` hace un respaldo antes de
--      vaciar; aquí basta con un mysqldump de la tabla:
--        mysqldump -u root -p fuiddatosluci fuiddatosreal > respaldo_fuid.sql
--   2. Ejecuta primero el bloque de VERIFICACIÓN PREVIA y anota los números.
--   3. Ejecuta el bloque de NORMALIZACIÓN dentro de la transacción.
--   4. Vuelve a ejecutar la verificación: todos los conteos deben quedar en 0.
--   5. Si algo no cuadra, ROLLBACK antes del COMMIT.
--
-- Requiere MySQL 8 por REGEXP_REPLACE. Es idempotente: pasarlo dos veces no
-- cambia nada la segunda vez.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN PREVIA — cuántos valores están sucios hoy
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  SUM(entidad_remitente     <> TRIM(entidad_remitente))     AS entidad_remitente,
  SUM(entidad_productora    <> TRIM(entidad_productora))    AS entidad_productora,
  SUM(unidad_administrativa <> TRIM(unidad_administrativa)) AS unidad_administrativa,
  SUM(oficina_productora    <> TRIM(oficina_productora))    AS oficina_productora,
  SUM(objeto                <> TRIM(objeto))                AS objeto,
  SUM(serie                 <> TRIM(serie))                 AS serie,
  SUM(subserie              <> TRIM(subserie))              AS subserie,
  SUM(asunto                <> TRIM(asunto))                AS asunto,
  SUM(asunto_2              <> TRIM(asunto_2))              AS asunto_2,
  SUM(asunto_3              <> TRIM(asunto_3))              AS asunto_3,
  SUM(notas                 <> TRIM(notas))                 AS notas,
  SUM(tomo                  <> TRIM(tomo))                  AS tomo,
  SUM(folios                <> TRIM(folios))                AS folios,
  SUM(caja_interna          <> TRIM(caja_interna))          AS caja_interna,
  SUM(codigo                <> TRIM(codigo))                AS codigo,
  SUM(numero_doc            <> TRIM(numero_doc))            AS numero_doc,
  SUM(numero_doc_hasta      <> TRIM(numero_doc_hasta))      AS numero_doc_hasta
FROM fuiddatosreal;

-- Cuántos arrastran además espacios dobles internos.
SELECT
  SUM(asunto              REGEXP '[[:space:]]{2,}') AS asunto,
  SUM(historial_y_cambios REGEXP '[[:space:]]{2,}') AS historial_y_cambios,
  SUM(objeto              REGEXP '[[:space:]]{2,}') AS objeto,
  SUM(caja_interna        REGEXP '[[:space:]]{2,}') AS caja_interna,
  SUM(notas               REGEXP '[[:space:]]{2,}') AS notas,
  SUM(asunto_3            REGEXP '[[:space:]]{2,}') AS asunto_3
FROM fuiddatosreal;


-- ─────────────────────────────────────────────────────────────────────────────
-- NORMALIZACIÓN — recorta extremos y colapsa espacios internos
--
-- Es exactamente lo que hace `cleanUpper()` en el backend, menos el paso de
-- mayúsculas: los registros históricos ya están en mayúsculas y forzarlo aquí
-- solo alargaría la operación sin cambiar nada.
--
-- Se hace en una sola sentencia por tabla para no recorrer 81.171 filas una vez
-- por columna. La condición del WHERE deja fuera las filas que ya están limpias.
-- ─────────────────────────────────────────────────────────────────────────────
START TRANSACTION;

UPDATE fuiddatosreal
SET
  entidad_remitente     = TRIM(REGEXP_REPLACE(entidad_remitente,     '[[:space:]]+', ' ')),
  entidad_productora    = TRIM(REGEXP_REPLACE(entidad_productora,    '[[:space:]]+', ' ')),
  unidad_administrativa = TRIM(REGEXP_REPLACE(unidad_administrativa, '[[:space:]]+', ' ')),
  oficina_productora    = TRIM(REGEXP_REPLACE(oficina_productora,    '[[:space:]]+', ' ')),
  objeto                = TRIM(REGEXP_REPLACE(objeto,                '[[:space:]]+', ' ')),
  serie                 = TRIM(REGEXP_REPLACE(serie,                 '[[:space:]]+', ' ')),
  subserie              = TRIM(REGEXP_REPLACE(subserie,              '[[:space:]]+', ' ')),
  asunto                = TRIM(REGEXP_REPLACE(asunto,                '[[:space:]]+', ' ')),
  asunto_2              = TRIM(REGEXP_REPLACE(asunto_2,              '[[:space:]]+', ' ')),
  asunto_3              = TRIM(REGEXP_REPLACE(asunto_3,              '[[:space:]]+', ' ')),
  notas                 = TRIM(REGEXP_REPLACE(notas,                 '[[:space:]]+', ' ')),
  tomo                  = TRIM(REGEXP_REPLACE(tomo,                  '[[:space:]]+', ' ')),
  folios                = TRIM(REGEXP_REPLACE(folios,                '[[:space:]]+', ' ')),
  caja_interna          = TRIM(REGEXP_REPLACE(caja_interna,          '[[:space:]]+', ' ')),
  codigo                = TRIM(REGEXP_REPLACE(codigo,                '[[:space:]]+', ' ')),
  numero_doc            = TRIM(REGEXP_REPLACE(numero_doc,            '[[:space:]]+', ' ')),
  numero_doc_hasta      = TRIM(REGEXP_REPLACE(numero_doc_hasta,      '[[:space:]]+', ' ')),
  radicado              = TRIM(REGEXP_REPLACE(radicado,              '[[:space:]]+', ' ')),
  identificacion        = TRIM(REGEXP_REPLACE(identificacion,        '[[:space:]]+', ' ')),
  accionado_procesado   = TRIM(REGEXP_REPLACE(accionado_procesado,   '[[:space:]]+', ' ')),
  accionado_denunciante = TRIM(REGEXP_REPLACE(accionado_denunciante, '[[:space:]]+', ' ')),
  numero_de_orden_interno = TRIM(REGEXP_REPLACE(numero_de_orden_interno, '[[:space:]]+', ' ')),
  nro_acta_transferible = TRIM(REGEXP_REPLACE(nro_acta_transferible, '[[:space:]]+', ' ')),
  elaborado_por         = TRIM(REGEXP_REPLACE(elaborado_por,         '[[:space:]]+', ' ')),
  cambio_calidad        = TRIM(REGEXP_REPLACE(cambio_calidad,        '[[:space:]]+', ' ')),
  historial_y_cambios   = TRIM(REGEXP_REPLACE(historial_y_cambios,   '[[:space:]]+', ' '))
WHERE
  entidad_remitente     <> TRIM(REGEXP_REPLACE(entidad_remitente,     '[[:space:]]+', ' '))
  OR entidad_productora    <> TRIM(REGEXP_REPLACE(entidad_productora,    '[[:space:]]+', ' '))
  OR unidad_administrativa <> TRIM(REGEXP_REPLACE(unidad_administrativa, '[[:space:]]+', ' '))
  OR oficina_productora    <> TRIM(REGEXP_REPLACE(oficina_productora,    '[[:space:]]+', ' '))
  OR objeto                <> TRIM(REGEXP_REPLACE(objeto,                '[[:space:]]+', ' '))
  OR serie                 <> TRIM(REGEXP_REPLACE(serie,                 '[[:space:]]+', ' '))
  OR subserie              <> TRIM(REGEXP_REPLACE(subserie,              '[[:space:]]+', ' '))
  OR asunto                <> TRIM(REGEXP_REPLACE(asunto,                '[[:space:]]+', ' '))
  OR asunto_2              <> TRIM(REGEXP_REPLACE(asunto_2,              '[[:space:]]+', ' '))
  OR asunto_3              <> TRIM(REGEXP_REPLACE(asunto_3,              '[[:space:]]+', ' '))
  OR notas                 <> TRIM(REGEXP_REPLACE(notas,                 '[[:space:]]+', ' '))
  OR tomo                  <> TRIM(REGEXP_REPLACE(tomo,                  '[[:space:]]+', ' '))
  OR folios                <> TRIM(REGEXP_REPLACE(folios,                '[[:space:]]+', ' '))
  OR caja_interna          <> TRIM(REGEXP_REPLACE(caja_interna,          '[[:space:]]+', ' '))
  OR codigo                <> TRIM(REGEXP_REPLACE(codigo,                '[[:space:]]+', ' '))
  OR numero_doc            <> TRIM(REGEXP_REPLACE(numero_doc,            '[[:space:]]+', ' '))
  OR numero_doc_hasta      <> TRIM(REGEXP_REPLACE(numero_doc_hasta,      '[[:space:]]+', ' '))
  OR radicado              <> TRIM(REGEXP_REPLACE(radicado,              '[[:space:]]+', ' '))
  OR identificacion        <> TRIM(REGEXP_REPLACE(identificacion,        '[[:space:]]+', ' '))
  OR accionado_procesado   <> TRIM(REGEXP_REPLACE(accionado_procesado,   '[[:space:]]+', ' '))
  OR accionado_denunciante <> TRIM(REGEXP_REPLACE(accionado_denunciante, '[[:space:]]+', ' '))
  OR numero_de_orden_interno <> TRIM(REGEXP_REPLACE(numero_de_orden_interno, '[[:space:]]+', ' '))
  OR nro_acta_transferible <> TRIM(REGEXP_REPLACE(nro_acta_transferible, '[[:space:]]+', ' '))
  OR elaborado_por         <> TRIM(REGEXP_REPLACE(elaborado_por,         '[[:space:]]+', ' '))
  OR cambio_calidad        <> TRIM(REGEXP_REPLACE(cambio_calidad,        '[[:space:]]+', ' '))
  OR historial_y_cambios   <> TRIM(REGEXP_REPLACE(historial_y_cambios,   '[[:space:]]+', ' '));

-- Revisa el número de filas afectadas antes de confirmar.
-- Si no cuadra con la verificación previa:  ROLLBACK;
COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POSTERIOR — vuelve a correr el primer SELECT.
-- Todas las columnas deben devolver 0.
-- ─────────────────────────────────────────────────────────────────────────────
