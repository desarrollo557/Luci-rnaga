-- Deja la base vacía conservando ÚNICAMENTE la tabla users (sus usuarios no se tocan).
-- Se vacían todas las tablas de negocio: clientes, actas, cajas, FUID, inventario,
-- historial, auditoría, asignaciones y rangos. TRUNCATE reinicia los autoincrementales
-- y no dispara triggers, por eso se desactivan las FK mientras dura la operación.
--
-- Antes de ejecutarlo haz un respaldo (database/limpiar_bd.ps1 lo hace automáticamente).

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE asignacion_caja_calidad;
TRUNCATE TABLE asignacion_caja_tecnica;
TRUNCATE TABLE asignacion_calidad;
TRUNCATE TABLE asignacion_tecnica;
TRUNCATE TABLE modulo_calidad;
TRUNCATE TABLE modulo_tecnica;
TRUNCATE TABLE rangos_upd;
TRUNCATE TABLE historial;
TRUNCATE TABLE auditoria;
TRUNCATE TABLE inventario;
TRUNCATE TABLE fuiddatosreal;
TRUNCATE TABLE modulos_caja;
TRUNCATE TABLE moduloscliente;
TRUNCATE TABLE sub_modulos;

SET FOREIGN_KEY_CHECKS = 1;
