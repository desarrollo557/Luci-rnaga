-- Garantiza que el número de caja (modulos_caja.caja_modulo) sea único en toda la base.
-- Los registros FUID (fuiddatosreal.caja) referencian la caja por ese código, así que dos
-- cajas con el mismo número, aunque estén en actas distintas, mezclan y duplican registros.
--
-- Script idempotente: si el índice ya existe no hace nada. Si aún hay números repetidos,
-- el ALTER falla: primero hay que revisarlos con esta consulta y dejar una sola caja por número
-- (borrando la sobrante desde la vista de cajas del acta, que elimina también sus FUID y
-- asignaciones), y luego volver a ejecutar el script.
--
--   SELECT caja_modulo, COUNT(*) AS repeticiones, GROUP_CONCAT(id) AS ids_caja,
--          GROUP_CONCAT(id_modulo_caja) AS ids_acta
--   FROM modulos_caja GROUP BY caja_modulo HAVING repeticiones > 1;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'modulos_caja'
    AND index_name = 'uq_modulos_caja_caja_modulo'
);
SET @sqlstmt := IF(
  @exist > 0,
  'SELECT 1',
  'ALTER TABLE modulos_caja ADD UNIQUE INDEX uq_modulos_caja_caja_modulo (caja_modulo)'
);
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
