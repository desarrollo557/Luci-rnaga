-- Columnas de seguimiento de UPD en asignacion_caja_tecnica.
--
-- MOTIVO: el backend las usa pero no existen en database/schema.sql, igual que
-- pasaba con created_at/updated_at. Sin ellas devuelven 500:
--   GET /api/modulos_caja/:modulo_id/usuarios   (todos los roles)
--   GET /api/modulos_caja/next-upd/:cajaModulo  (rol TECNICA)
--   GET /api/modulos_caja/tecnica-stats         (rol TECNICA)
-- y también falla el alta de asignaciones (INSERT ... upd_inicio) y el avance
-- del consecutivo propio del técnico (UPDATE ... SET act.ultimo_upd).
--
-- También se añade moduloscliente.upd_siguiente, que getNextUpdByCaja consulta
-- como último recurso cuando la caja aún no tiene registros: sin ella, abrir el
-- formulario en cualquiera de las 85 cajas vacías devolvía 500.
--
-- upd_inicio: primer UPD del rango asignado al técnico en esa caja.
-- ultimo_upd: último UPD que el técnico digitó; alimenta el "siguiente UPD".
-- VARCHAR(10) porque el formato es UPDXXXXXXX (validators/modulosCaja.validator.ts),
-- el mismo tipo que usa database/rangos_upd.sql.
--
-- Script idempotente: puede ejecutarse varias veces sin errores.

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'asignacion_caja_tecnica' AND column_name = 'upd_inicio'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE asignacion_caja_tecnica ADD COLUMN upd_inicio VARCHAR(10) NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'asignacion_caja_tecnica' AND column_name = 'ultimo_upd'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE asignacion_caja_tecnica ADD COLUMN ultimo_upd VARCHAR(10) NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'moduloscliente' AND column_name = 'upd_siguiente'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE moduloscliente ADD COLUMN upd_siguiente VARCHAR(10) NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
