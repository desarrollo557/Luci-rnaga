-- El código de un cliente debe ser único dentro de su sede.
--
-- El código (`sub_modulos.codigo`, p. ej. '051') es lo que identifica al cliente
-- en el número de caja y en los reportes. Dos clientes con el mismo código en la
-- misma sede hacen que sus cajas y sus FUID se mezclen sin forma de separarlos
-- después. Entre sedes distintas sí puede repetirse: cada sede lleva su propia
-- numeración, y por eso el índice es sobre la pareja (codigo, sede_submodulos) y
-- no sobre el código solo.
--
-- ---------------------------------------------------------------------------
-- ANTES DE EJECUTARLO: revisa si ya hay duplicados
-- ---------------------------------------------------------------------------
-- Esta consulta los lista. Si devuelve filas, el ALTER de abajo falla. Hay que
-- revisarlas a mano y decidir cuál queda: ninguno de los dos registros se borra
-- desde aquí, porque cada uno puede tener actas y cajas colgando.
--
--   SELECT codigo, sede_submodulos, COUNT(*) AS repeticiones,
--          GROUP_CONCAT(id) AS ids_cliente,
--          GROUP_CONCAT(entidad_remitente SEPARATOR ' / ') AS entidades
--   FROM sub_modulos
--   GROUP BY codigo, sede_submodulos
--   HAVING repeticiones > 1;
--
-- Para ver qué arrastra cada uno antes de decidir:
--
--   SELECT sm.id, sm.codigo, sm.entidad_remitente, sm.sede_submodulos,
--          COUNT(DISTINCT mc.id) AS actas
--   FROM sub_modulos sm
--   LEFT JOIN moduloscliente mc ON mc.id_submodulo = sm.id
--   WHERE sm.id IN (/* ids de la consulta anterior */)
--   GROUP BY sm.id;
--
-- AVISO: en MySQL un índice UNIQUE admite varios NULL, así que esto no impide
-- repetir un código entre clientes cuya sede esté vacía. Los 11 clientes del
-- volcado tienen sede, pero si aparecieran filas con `sede_submodulos IS NULL`
-- hay que asignarles sede antes de confiar en la restricción.
--
-- Script idempotente: si el índice ya existe no hace nada.

SET @existe := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sub_modulos'
    AND index_name = 'uq_sub_modulos_codigo_sede'
);
SET @sqlstmt := IF(
  @existe > 0,
  'SELECT 1',
  'ALTER TABLE sub_modulos ADD UNIQUE INDEX uq_sub_modulos_codigo_sede (codigo, sede_submodulos)'
);
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
