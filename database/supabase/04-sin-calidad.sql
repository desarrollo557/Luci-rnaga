-- ─────────────────────────────────────────────────────────────────────────────
-- El perfil CALIDAD deja de existir en el software.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Desde esta versión los perfiles son ADMIN, LIDER y TECNICA. El código ya no
-- acepta CALIDAD al crear o editar usuarios, no lo deja iniciar sesión ("Rol no
-- autorizado") y no consulta las tablas de asignación de calidad. La revisión
-- de registros (marcar OK) sigue existiendo: la hacen el líder, la
-- administración y la técnica, y quién revisó se sigue guardando en las
-- columnas `cambio_calidad` y `sede_calidad`, que conservan su nombre técnico.
--
-- Este script hace en la base lo que el código no puede:
--
--   1. Muestra las cuentas que todavía tienen el perfil CALIDAD. No las toca:
--      quien administre decide si pasan a TECNICA, a LIDER o se eliminan desde
--      la pantalla de Administración. Mientras tanto no pueden entrar.
--   2. Retira las tablas de asignación de calidad: `asignacion_caja_calidad`
--      (la que usaba el software) y las dos heredadas de la versión antigua
--      (`asignacion_calidad`, `modulo_calidad`), que ya no consulta nadie.
--
-- Ejecutar en el editor SQL de Supabase (o con psql) DESPUÉS de desplegar el
-- backend sin el perfil. Es seguro repetirlo: `DROP TABLE IF EXISTS` no falla
-- si la tabla ya no está.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Cuentas que aún tienen el perfil retirado (solo se listan).
SELECT id, cc, nombre, sede, created_at
  FROM users
 WHERE rol = 'CALIDAD'
 ORDER BY nombre;

-- Si se decide pasarlas todas a TECNICA, quitar el comentario de esta línea:
-- UPDATE users SET rol = 'TECNICA' WHERE rol = 'CALIDAD';

-- 2. Tablas del perfil. Las asignaciones que contenían dejan de tener sentido.
DROP TABLE IF EXISTS asignacion_caja_calidad;
DROP TABLE IF EXISTS asignacion_calidad;
DROP TABLE IF EXISTS modulo_calidad;

-- Comprobación: no debe quedar ninguna tabla de calidad.
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name LIKE '%calidad%';
