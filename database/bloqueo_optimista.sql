-- Bloqueo optimista para los registros FUID.
--
-- Hasta ahora, dos personas de Calidad editando el mismo registro terminaban así:
-- ganaba la última en guardar y la primera no se enteraba de que su cambio se
-- había perdido. No hay forma de detectarlo después, porque el UPDATE pisa el
-- valor anterior sin dejar rastro de que había otro en curso.
--
-- La columna `version` resuelve eso sin bloquear la fila: el cliente recibe la
-- versión al abrir el registro y la devuelve al guardar. El UPDATE lleva
-- `WHERE id = ? AND version = ?` y sube la versión en el mismo paso, de modo que
-- solo uno de los dos guardados puede coincidir. Al que llega con la versión
-- vieja se le responde 409 y se le pide recargar, en lugar de pisar en silencio.
--
-- Script idempotente: si la columna ya existe no hace nada.
--
-- Los registros existentes arrancan en la versión 1 por el DEFAULT, que es lo
-- correcto: lo que importa no es el número, sino que cambie en cada guardado.

SET @existe := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'fuiddatosreal'
    AND column_name = 'version'
);
SET @sqlstmt := IF(
  @existe > 0,
  'SELECT 1',
  'ALTER TABLE fuiddatosreal ADD COLUMN version INT NOT NULL DEFAULT 1'
);
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
