-- Deshace lo que creó database/seed_demo.sql.
--
-- NO toca datos reales: los registros FUID, cajas, módulos, historial y usuarios
-- vienen del volcado original y quedan intactos.
--
-- Ejecutar solo si se quiere volver al estado previo a la demostración.

-- 1. Inventarios generados por el seed, identificados por código de cliente.
--    NO se borra el 034: ese inventario ya existía antes (creado desde la app).
DELETE FROM inventario
WHERE CODIGO_DEL_CLIENTE IN ('015','023','050','051','054','085','099','110','113','117');

-- 2. Consecutivos UPD derivados de los registros reales.
UPDATE asignacion_caja_tecnica SET upd_inicio = NULL, ultimo_upd = NULL;

-- 3. Cobertura de CALIDAD. Se conservan las asignaciones que ya existían antes
--    del seed: solo se quitan las del usuario de calidad usado por el script.
DELETE acc FROM asignacion_caja_calidad acc
JOIN (SELECT id FROM users WHERE rol = 'CALIDAD' ORDER BY id LIMIT 1) AS u ON u.id = acc.usuario_id
WHERE acc.id > (SELECT * FROM (SELECT MIN(id) + 42 FROM asignacion_caja_calidad) AS x);

DELETE mq FROM modulo_calidad mq
JOIN (SELECT id FROM users WHERE rol = 'CALIDAD' ORDER BY id LIMIT 1) AS u ON u.id = mq.usuario_id
WHERE mq.id > (SELECT * FROM (SELECT MIN(id) + 2 FROM modulo_calidad) AS x);

DELETE ac FROM asignacion_calidad ac
JOIN (SELECT id FROM users WHERE rol = 'CALIDAD' ORDER BY id LIMIT 1) AS u ON u.id = ac.usuario_id
WHERE ac.id > (SELECT * FROM (SELECT MIN(id) + 1 FROM asignacion_calidad) AS x);
