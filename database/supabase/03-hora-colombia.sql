-- ─────────────────────────────────────────────────────────────────────────────
-- Hora de Colombia en la base de datos.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Todo el software trabaja en la hora de Bogotá (UTC-5, sin horario de verano).
-- Supabase corre en UTC, así que hasta ahora cada `now()` —el valor por defecto
-- de `created_at`, los triggers de `updated_at` y `fecha_cambio`, el `NOW()` del
-- inventario— quedaba guardado cinco horas adelantado: un usuario creado a las
-- 8 de la mañana aparecía creado a la 1 de la tarde.
--
-- Desde ahora el backend fija la zona en cada conexión (`SET TIME ZONE
-- 'America/Bogota'` en backend/src/config/db.ts), con lo que las marcas nuevas
-- nacen ya en hora de Colombia. Este script hace lo que el código no puede:
--
--   1. Deja la zona fijada también en la base, para que valga desde el editor
--      SQL de Supabase o desde cualquier otra herramienta. Es un intento: si el
--      permiso no alcanza, avisa y sigue, porque el backend ya la fija por su
--      cuenta.
--   2. Corrige, UNA SOLA VEZ, las marcas de tiempo que ya estaban guardadas en
--      UTC, restándoles las cinco horas. Lleva su propio candado (la tabla
--      `ajustes_aplicados`) para que ejecutarlo dos veces no reste diez.
--
-- Qué filas corrige: las escritas en Supabase, que son las posteriores al
-- momento de la migración (14 de septiembre de 2026, 19:00 UTC = 14:00 en
-- Colombia). Las copiadas desde MySQL ya venían en hora de Colombia y no se
-- tocan; una marca de MySQL nunca puede ser posterior a ese corte porque desde
-- entonces solo se ha escrito en Supabase. Si el corte no fuera ese, cámbialo
-- en la constante `corte` antes de ejecutar.
--
-- Ejecutar en el editor SQL de Supabase (o con psql) UNA vez, con el backend
-- ya desplegado con el cambio de db.ts. Es seguro repetirlo: no hace nada la
-- segunda vez.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Zona de la base y del rol (intento; el backend la fija de todos modos).
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET timezone TO ''America/Bogota''';
    RAISE NOTICE 'Zona horaria fijada en la base %', current_database();
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin permiso para ALTER DATABASE: la zona la fija el backend en cada conexión.';
  END;
  BEGIN
    EXECUTE 'ALTER ROLE ' || quote_ident(current_user) || ' SET timezone TO ''America/Bogota''';
    RAISE NOTICE 'Zona horaria fijada para el rol %', current_user;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin permiso para ALTER ROLE: la zona la fija el backend en cada conexión.';
  END;
END $$;

-- 2. Candado para que la corrección de datos se aplique una sola vez.
CREATE TABLE IF NOT EXISTS ajustes_aplicados (
  nombre varchar(100) PRIMARY KEY,
  aplicado_en timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota'),
  detalle text
);

-- 3. Corrección de las marcas guardadas en UTC.
DO $$
DECLARE
  -- Primer instante (en UTC) que pudo escribirse en Supabase.
  corte constant timestamp := '2026-09-14 19:00:00';
  n integer;
  resumen text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM ajustes_aplicados WHERE nombre = 'hora-colombia-2026-09') THEN
    RAISE NOTICE 'La corrección de hora ya se aplicó; no se hace nada.';
    RETURN;
  END IF;

  -- Los triggers de `updated_at` (users, moduloscliente, modulos_caja y
  -- fuiddatosreal) pondrían `now()` encima de la fecha corregida, y el del
  -- historial copiaría cada fila de fuiddatosreal como si fuera un cambio. Se
  -- apagan mientras dura la corrección; si algo falla, la transacción entera
  -- se deshace y quedan encendidos como estaban.
  ALTER TABLE users DISABLE TRIGGER USER;
  ALTER TABLE moduloscliente DISABLE TRIGGER USER;
  ALTER TABLE modulos_caja DISABLE TRIGGER USER;
  ALTER TABLE fuiddatosreal DISABLE TRIGGER USER;

  -- Cada UPDATE pasa el valor guardado (que estaba en UTC) a hora de Colombia.
  -- Se usa la conversión por zona y no "- interval '5 hours'" para que la
  -- intención quede escrita, aunque en Colombia el resultado es el mismo todo
  -- el año.

  UPDATE users
     SET created_at = CASE WHEN created_at >= corte THEN (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE created_at END,
         updated_at = CASE WHEN updated_at >= corte THEN (updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE updated_at END
   WHERE created_at >= corte OR updated_at >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('users=%s ', n);

  UPDATE moduloscliente
     SET created_at = CASE WHEN created_at >= corte THEN (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE created_at END,
         updated_at = CASE WHEN updated_at >= corte THEN (updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE updated_at END
   WHERE created_at >= corte OR updated_at >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('moduloscliente=%s ', n);

  UPDATE modulos_caja
     SET created_at = CASE WHEN created_at >= corte THEN (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE created_at END,
         updated_at = CASE WHEN updated_at >= corte THEN (updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE updated_at END
   WHERE created_at >= corte OR updated_at >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('modulos_caja=%s ', n);

  UPDATE fuiddatosreal
     SET created_at = CASE WHEN created_at >= corte THEN (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE created_at END,
         updated_at = CASE WHEN updated_at >= corte THEN (updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE updated_at END
   WHERE created_at >= corte OR updated_at >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('fuiddatosreal=%s ', n);

  UPDATE historial
     SET fecha_cambio = (fecha_cambio AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota'
   WHERE fecha_cambio >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('historial=%s ', n);

  UPDATE auditoria
     SET fecha = (fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota'
   WHERE fecha >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('auditoria=%s ', n);

  UPDATE inventario
     SET "FECHA_CREACION" = CASE WHEN "FECHA_CREACION" >= corte THEN ("FECHA_CREACION" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE "FECHA_CREACION" END,
         "FECHA_ACTUALIZACION" = CASE WHEN "FECHA_ACTUALIZACION" >= corte THEN ("FECHA_ACTUALIZACION" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE "FECHA_ACTUALIZACION" END,
         "ZOHO_SYNC_AT" = CASE WHEN "ZOHO_SYNC_AT" >= corte THEN ("ZOHO_SYNC_AT" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE "ZOHO_SYNC_AT" END
   WHERE "FECHA_CREACION" >= corte OR "FECHA_ACTUALIZACION" >= corte OR "ZOHO_SYNC_AT" >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('inventario=%s ', n);

  UPDATE rangos_upd
     SET fecha_asignacion = CASE WHEN fecha_asignacion >= corte THEN (fecha_asignacion AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE fecha_asignacion END,
         fecha_agotado = CASE WHEN fecha_agotado >= corte THEN (fecha_agotado AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE fecha_agotado END,
         fecha_revocacion = CASE WHEN fecha_revocacion >= corte THEN (fecha_revocacion AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota' ELSE fecha_revocacion END
   WHERE fecha_asignacion >= corte OR fecha_agotado >= corte OR fecha_revocacion >= corte;
  GET DIAGNOSTICS n = ROW_COUNT; resumen := resumen || format('rangos_upd=%s ', n);

  ALTER TABLE users ENABLE TRIGGER USER;
  ALTER TABLE moduloscliente ENABLE TRIGGER USER;
  ALTER TABLE modulos_caja ENABLE TRIGGER USER;
  ALTER TABLE fuiddatosreal ENABLE TRIGGER USER;

  INSERT INTO ajustes_aplicados (nombre, detalle)
  VALUES ('hora-colombia-2026-09', 'UTC → America/Bogota desde ' || corte || ' (filas por tabla): ' || resumen);

  RAISE NOTICE 'Corrección aplicada (filas por tabla): %', resumen;
END $$;

-- Comprobación: la zona de esta sesión y los últimos usuarios creados.
SHOW timezone;
SELECT nombre, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 10;
