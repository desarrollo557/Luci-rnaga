-- Agrega columna suspendido_hasta a la tabla users.
-- Script idempotente: puede ejecutarse varias veces sin errores.
-- MySQL no soporta ALTER TABLE ... ADD COLUMN IF NOT EXISTS, por eso se usa
-- PREPARE solo cuando no existe (consulta a information_schema.columns).

SET @exist := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'suspendido_hasta'
);
SET @sqlstmt := IF(@exist > 0, 'SELECT 1', 'ALTER TABLE users ADD COLUMN suspendido_hasta DATE NULL');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;