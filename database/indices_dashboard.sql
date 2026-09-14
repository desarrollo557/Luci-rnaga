-- Índices que sostienen el panel de estadísticas (/api/estadisticas) y el
-- historial paginado (/api/historial).
-- Script idempotente: puede ejecutarse varias veces sin errores.
-- Sigue la convención de indices_velocidad.sql (PREPARE + information_schema,
-- porque MySQL no soporta CREATE INDEX IF NOT EXISTS).

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND index_name = 'idx_fuid_estado_revision'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_fuid_estado_revision ON fuiddatosreal(historial_y_cambios(10))');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND index_name = 'idx_fuid_fecha_dato'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_fuid_fecha_dato ON fuiddatosreal(fecha_del_dato)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND index_name = 'idx_fuid_elaborado_por'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_fuid_elaborado_por ON fuiddatosreal(elaborado_por)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND index_name = 'idx_fuid_sede'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_fuid_sede ON fuiddatosreal(sede)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND index_name = 'idx_fuid_acta'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_fuid_acta ON fuiddatosreal(nro_acta_transferible)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'historial' AND index_name = 'idx_historial_fecha_cambio'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_historial_fecha_cambio ON historial(fecha_cambio)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'historial' AND index_name = 'idx_historial_tipo_cambio'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_historial_tipo_cambio ON historial(tipo_cambio)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'historial' AND index_name = 'idx_historial_sede_calidad'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_historial_sede_calidad ON historial(sede_calidad)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'modulos_caja' AND index_name = 'idx_modulos_caja_estado'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_modulos_caja_estado ON modulos_caja(estado_caja)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'modulos_caja' AND index_name = 'idx_modulos_caja_id_modulo'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_modulos_caja_id_modulo ON modulos_caja(id_modulo_caja)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'moduloscliente' AND index_name = 'idx_moduloscliente_submodulo'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_moduloscliente_submodulo ON moduloscliente(id_submodulo)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

