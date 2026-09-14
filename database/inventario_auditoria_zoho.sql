-- Columnas de auditoría y de sincronización con Zoho WorkDrive en `inventario`.
--
-- MOTIVO: backend/src/types/db.ts las declara y el controlador las escribe, pero
-- no existen en database/schema.sql. La tabla llegó vacía en el volcado, así que
-- los GET no fallaban; el error aparece al crear o editar un inventario:
--   POST /api/inventario        -> INSERT ... FECHA_ACTUALIZACION, USUARIO_ACTUALIZACION
--   PUT  /api/inventario/:id
--   POST /api/inventario/:id/sync -> UPDATE ... ZOHO_SYNC_STATE, ZOHO_SYNC_AT, ...
--
-- ZOHO_FILE_ID guarda el fileId o la URL completa del archivo según haya o no
-- ZOHO_WORKSPACE_ID configurado (ver backend/.env.example), de ahí el VARCHAR largo.
-- ZOHO_SYNC_STATE toma los valores 'SUBIDO' | 'ERROR' | 'PENDIENTE'
-- (inventario.controller.ts).
--
-- Script idempotente: puede ejecutarse varias veces sin errores.

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'FECHA_CREACION'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN FECHA_CREACION DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'FECHA_ACTUALIZACION'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN FECHA_ACTUALIZACION DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'USUARIO_ACTUALIZACION'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN USUARIO_ACTUALIZACION VARCHAR(150) NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'ZOHO_FILE_ID'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN ZOHO_FILE_ID VARCHAR(500) NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'ZOHO_SYNC_STATE'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN ZOHO_SYNC_STATE VARCHAR(20) NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'ZOHO_SYNC_AT'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN ZOHO_SYNC_AT DATETIME NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventario' AND column_name = 'ZOHO_SYNC_ERROR'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE inventario ADD COLUMN ZOHO_SYNC_ERROR TEXT NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

