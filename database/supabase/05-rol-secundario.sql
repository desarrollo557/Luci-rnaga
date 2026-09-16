-- Segundo perfil opcional de un usuario.
--
-- Hasta ahora una cuenta tenía un solo perfil, y eso obligaba a tener dos
-- cuentas para una misma persona: la de administrador y la de líder, con dos
-- contraseñas y dos sesiones. Con esta columna la misma cuenta puede llevar los
-- dos, y quien entra ve la unión de lo que cada perfil le permite.
--
-- Por qué una columna y no una tabla de perfiles: los perfiles del software son
-- tres y la combinación que se pidió es una, administrador más líder. Una tabla
-- aparte con su join en cada consulta sería más maquinaria de la que el problema
-- pide. Si algún día hicieran falta tres perfiles a la vez, ese sería el momento.
--
-- `rol` sigue siendo el perfil principal: decide en qué pantalla aterriza la
-- persona al entrar y es el que leen las consultas que buscan gente por su
-- oficio, como la que lista técnicas para asignarlas a una caja. El secundario
-- solo suma permisos, nunca los quita.
--
-- Idempotente: se puede ejecutar varias veces sin error.

ALTER TABLE users ADD COLUMN IF NOT EXISTS rol_secundario varchar(255);

COMMENT ON COLUMN users.rol_secundario IS
  'Segundo perfil opcional. Suma permisos al de la columna rol; nunca los quita. NULL si la cuenta tiene un solo perfil.';

-- Nadie debería llevar el mismo perfil dos veces: sería ruido en pantalla y un
-- caso que ninguna comprobación espera.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_secundario_distinto;
ALTER TABLE users ADD CONSTRAINT users_rol_secundario_distinto
  CHECK (rol_secundario IS NULL OR rol_secundario <> rol);
