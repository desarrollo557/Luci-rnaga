-- Cuándo se terminó una caja y a quién se le atribuye.
--
-- El seguimiento de inventario tiene que decir cuántas cajas terminó cada
-- persona cada día, y cuál quedó a medias para continuarla al día siguiente.
-- La columna `estado_caja` ya decía si una caja estaba terminada, pero no
-- cuándo ni por quién, y sin la fecha no hay forma de atribuir la caja a una
-- jornada: el informe no podría contar nada.
--
-- Por qué la fecha no es la del cierre sino la del último registro de la caja:
-- una caja que se termina el viernes y se cierra el lunes, cuando su dueña
-- empieza la siguiente, pertenece al viernes. Con la fecha del cierre, el
-- trabajo del viernes aparecería en el lunes y el informe de la semana saldría
-- torcido.
--
-- `finalizada_por` guarda a quién se le atribuye la caja, en el mismo formato
-- "NOMBRE (CC)" que usa `fuiddatosreal.elaborado_por`, porque el informe cruza
-- las dos: si no coincidieran, la caja no contaría en ninguna jornada.
--
-- El estado lo mantiene el servidor solo, al guardar cada registro; la lógica
-- está en `backend/src/services/cicloCaja.service.ts`. Nadie tiene que marcar
-- nada a mano: este es un software operativo y un botón que hay que acordarse
-- de pulsar acaba sin pulsarse, y entonces el informe miente.
--
-- El índice sobre `fuiddatosreal(caja)` no es opcional: el cierre mira el
-- último registro de cada caja abierta cada vez que alguien digita, y sin él
-- esa consulta recorre entera la tabla más grande del sistema en cada guardado.
--
-- Idempotente: se puede ejecutar varias veces sin error. El código lo aplica
-- también al arrancar (`backend/src/config/esquema.ts`); este archivo existe
-- para poder hacerlo a mano sobre una base nueva.

ALTER TABLE modulos_caja ADD COLUMN IF NOT EXISTS fecha_finalizacion date;
ALTER TABLE modulos_caja ADD COLUMN IF NOT EXISTS finalizada_por varchar(255);

CREATE INDEX IF NOT EXISTS idx_fuiddatosreal_caja ON fuiddatosreal (caja);

-- Las cajas que ya estaban finalizadas antes de existir estas columnas se
-- atribuyen a la jornada de su último registro. Sin esto, los seguimientos de
-- fechas anteriores saldrían con cero cajas terminadas, que es peor que no
-- tener el dato: parecería que nadie cerró nada.
UPDATE modulos_caja mc
   SET fecha_finalizacion = u.fecha_del_dato,
       finalizada_por = u.elaborado_por
  FROM (
    SELECT DISTINCT ON (f.caja) f.caja, f.fecha_del_dato, f.elaborado_por
      FROM fuiddatosreal f
     ORDER BY f.caja, f.created_at DESC NULLS LAST, f.id DESC
  ) u
 WHERE mc.caja_modulo = u.caja
   AND mc.estado_caja = 'FINALIZADO'
   AND mc.fecha_finalizacion IS NULL;
