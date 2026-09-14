-- Columnas created_at / updated_at que el código ya espera pero que faltan en
-- database/schema.sql.
--
-- MOTIVO: el commit "feat: add created_at and updated_at fields to various data
-- models" las añadió a backend/src/types/db.ts y a la consulta de
-- users.controller.ts (userSafeFields), pero nunca se creó la migración. Sin
-- ellas, GET /api/users falla con ER_BAD_FIELD_ERROR ("Unknown column
-- 'created_at' in 'field list'") y la página de Administración queda inutilizable.
--
-- Script idempotente: puede ejecutarse varias veces sin errores.

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'created_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE users ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'updated_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE users ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'moduloscliente' AND column_name = 'created_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE moduloscliente ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'moduloscliente' AND column_name = 'updated_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE moduloscliente ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'modulos_caja' AND column_name = 'created_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE modulos_caja ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'modulos_caja' AND column_name = 'updated_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE modulos_caja ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND column_name = 'created_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE fuiddatosreal ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'fuiddatosreal' AND column_name = 'updated_at'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE fuiddatosreal ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

