-- Eliminar un UPD concreto.
--
-- Para el editor SQL de Supabase, cuando hay que borrar un registro que la
-- aplicación no deja borrar: el botón de eliminar de la pantalla de digitación
-- aplica reglas por perfil —el administrador borra cualquiera, el líder los de
-- su sede, la técnica solo los suyos y del mismo día— y esto se las salta. Por
-- eso el procedimiento de abajo obliga a mirar antes de confirmar.
--
-- LO QUE HAY QUE SABER ANTES DE EJECUTARLO
--
-- 1. **No se pierde.** La tabla `fuiddatosreal` tiene un trigger
--    (`fuid_historial_eliminacion`) que copia el registro completo a `historial`
--    con `tipo_cambio = 'ELIMINADO'` y la fecha del borrado. El apartado 3
--    explica cómo consultarlo y cómo devolverlo a su sitio.
-- 2. **El número queda libre.** El UPD siguiente de una caja se calcula con el
--    mayor que haya en sus registros, así que al borrar el último ese número
--    vuelve a ofrecerse. Ver el apartado 4 para el caso en que la caja se quede
--    sin ningún registro.
-- 3. **Va dentro de una transacción.** Nada se consolida hasta que se escribe
--    `COMMIT`. Si la fila devuelta no es la que se esperaba, `ROLLBACK` y no ha
--    pasado nada.

-- ---------------------------------------------------------------------------
-- 1. El procedimiento. Cambiar el UPD en los dos sitios marcados y ejecutar
--    por pasos, no todo de golpe.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1.1 Mirar qué se va a borrar. Si esto no devuelve nada, no hay nada que hacer.
SELECT * FROM buscar_upd('2950001');   -- ← el UPD

-- 1.2 Borrar. Devuelve lo borrado para poder comprobarlo antes de confirmar.
--     La restricción `unique_upd` garantiza que no puede tocar más de una fila.
DELETE FROM fuiddatosreal
 WHERE upd = 'UPD' || lpad(regexp_replace('2950001', '\D', '', 'g'), 7, '0')  -- ← el mismo UPD
RETURNING id, upd, caja, n_orden, elaborado_por, fecha_del_dato, asunto;

-- 1.3 Si la fila devuelta es la correcta:
COMMIT;

-- 1.3 bis Si no lo es, o devolvió cero filas:
-- ROLLBACK;

-- ---------------------------------------------------------------------------
-- 2. Borrar varios de una vez.
--    Mismo principio: se mira la lista, se borra, se cuenta y se confirma.
-- ---------------------------------------------------------------------------

-- BEGIN;
--
-- SELECT b.* FROM unnest(ARRAY['2950001','2950002']) AS e(entrada)
-- CROSS JOIN LATERAL buscar_upd(e.entrada) b;
--
-- DELETE FROM fuiddatosreal
--  WHERE upd IN (
--    SELECT 'UPD' || lpad(regexp_replace(entrada, '\D', '', 'g'), 7, '0')
--    FROM unnest(ARRAY['2950001','2950002']) AS e(entrada)
--  )
-- RETURNING id, upd, caja, n_orden;
--
-- COMMIT;   -- o ROLLBACK si el número de filas no cuadra

-- ---------------------------------------------------------------------------
-- 3. Consultar lo borrado y devolverlo a su sitio.
-- ---------------------------------------------------------------------------

-- Qué se borró de este UPD y cuándo:
--   SELECT id_dato, upd, caja, n_orden, elaborado_por, tipo_cambio, fecha_cambio
--   FROM historial
--   WHERE upd = 'UPD2950001' AND tipo_cambio = 'ELIMINADO'
--   ORDER BY fecha_cambio DESC;

-- Todo lo eliminado en los últimos siete días, por si hay que revisar:
--   SELECT upd, caja, elaborado_por, fecha_cambio
--   FROM historial
--   WHERE tipo_cambio = 'ELIMINADO' AND fecha_cambio >= now() - interval '7 days'
--   ORDER BY fecha_cambio DESC;

-- Devolverlo a `fuiddatosreal` desde la copia más reciente del historial.
--
-- Dos cosas que hay que saber para que el registro vuelva completo:
--
--   * El `id` no se reutiliza: la tabla genera uno nuevo. El anterior queda en
--     `historial.id_dato` por si hace falta rastrearlo.
--   * El historial guarda el asunto ya compuesto, no el automático y el manual
--     por separado. Y al insertar, el trigger `fuid_asunto_automatico` vuelve a
--     componer `asunto` a partir de esos dos, así que pasarlo tal cual lo
--     dejaría en blanco. Por eso el texto guardado entra como asunto manual:
--     así el registro vuelve legible. Si se quiere repartido como estaba, se
--     separa editándolo desde la aplicación.
--
--   INSERT INTO fuiddatosreal (
--     fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora,
--     unidad_administrativa, oficina_productora, objeto, serie, subserie,
--     asunto_3, radicado, numero_doc, numero_doc_hasta, fecha_inicial, fecha_final,
--     caja, upd, tomo, otro, caja_interna, folios, soporte, frecuencia, elaborado_por,
--     nro_acta_transferible, fecha_transferencia, notas, sede, tiempo,
--     historial_y_cambios, cambio_calidad, sede_calidad
--   )
--   SELECT
--     h.fecha_del_dato, h.n_orden, h.codigo, h.entidad_remitente, h.entidad_productora,
--     h.unidad_administrativa, h.oficina_productora, h.objeto, h.serie, h.subserie,
--     h.asunto, h.radicado, h.numero_doc, h.numero_doc_hasta, h.fecha_inicial, h.fecha_final,
--     h.caja, h.upd, h.tomo, h.otro, h.caja_interna, h.folios, h.soporte, h.frecuencia,
--     h.elaborado_por, h.nro_acta_transferible, h.fecha_transferencia, h.notas, h.sede,
--     h.tiempo, h.historial_cambios, h.cambio_calidad, h.sede_calidad
--   FROM historial h
--   WHERE h.upd = 'UPD2950001' AND h.tipo_cambio = 'ELIMINADO'
--   ORDER BY h.fecha_cambio DESC
--   LIMIT 1;

-- ---------------------------------------------------------------------------
-- 4. Después de borrar el último UPD de una caja.
-- ---------------------------------------------------------------------------

-- El consecutivo que ofrece la aplicación sale del mayor UPD que quede en la
-- caja, así que se recoloca solo. Solo hay un caso que conviene revisar: si la
-- caja se queda sin ningún registro, el siguiente sale de `ultimo_upd` de la
-- asignación de la técnica, que todavía apunta al borrado y dejaría un hueco.
--
-- Ver si ocurre:
--   SELECT act.modulo_id, u.nombre, act.upd_inicio, act.ultimo_upd
--   FROM asignacion_caja_tecnica act
--   JOIN modulos_caja mc ON mc.id = act.modulo_id
--   JOIN users u ON u.id = act.usuario_id
--   WHERE mc.caja_modulo = '077C004431'
--     AND NOT EXISTS (SELECT 1 FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo);
--
-- Y dejar que vuelva a arrancar desde su UPD de inicio:
--   UPDATE asignacion_caja_tecnica act
--      SET ultimo_upd = NULL
--     FROM modulos_caja mc
--    WHERE mc.id = act.modulo_id
--      AND mc.caja_modulo = '077C004431'
--      AND NOT EXISTS (SELECT 1 FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo);
