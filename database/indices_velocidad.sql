-- Índices de velocidad para la FASE 1 del plan maestro.
-- Script idempotente: puede ejecutarse varias veces sin errores.
-- MySQL no soporta CREATE INDEX IF NOT EXISTS, por eso cada índice se crea
-- con PREPARE solo cuando no existe (consulta a information_schema.statistics).

-- Índice para filtrar por caja en fuiddatosreal (~82.000 filas, sin índice previo).
SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'fuiddatosreal'
    AND index_name = 'idx_fuiddatosreal_caja'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_fuiddatosreal_caja ON fuiddatosreal(caja)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Índice para acelerar el JOIN modulos_caja.caja_modulo = fuiddatosreal.caja.
SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'modulos_caja'
    AND index_name = 'idx_modulos_caja_caja_modulo'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_modulos_caja_caja_modulo ON modulos_caja(caja_modulo)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Índice para la subconsulta de conteo de cajas por módulo cliente.
SET @exist := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'moduloscliente'
    AND index_name = 'idx_moduloscliente_codigo'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'CREATE INDEX idx_moduloscliente_codigo ON moduloscliente(codigo)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;