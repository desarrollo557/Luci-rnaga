-- Cuándo se terminó una caja y a quién se le atribuye.
--
-- La pantalla necesita saber en qué caja va cada técnica, avisar de que una
-- viene de días anteriores y ofrecer retomarla. La columna `estado_caja` ya
-- decía si una caja estaba terminada, pero no cuándo, y sin la fecha no se puede
-- decir "terminada el 15" ni distinguir la que se está continuando.
--
-- Por qué la fecha no es la del cierre sino la del último registro de la caja:
-- una caja trabajada el viernes y cerrada el lunes, cuando su dueña la da por
-- terminada, pertenece al viernes. Con la fecha del cierre, el
-- trabajo del viernes aparecería en el lunes y el informe de la semana saldría
-- torcido.
--
-- `finalizada_por` guarda a quién se le atribuye la caja, en el mismo formato
-- "NOMBRE (CC)" que usa `fuiddatosreal.elaborado_por`. Es información de
-- auditoría: el seguimiento de inventario **no** la usa. Ese deduce a qué
-- jornada pertenece cada caja del último registro de la propia caja, y no de
-- estas columnas, porque así cuenta bien también todo lo que se digitó antes de
-- que existieran. Fiarlo al estado guardado dejaba el histórico en cero.
--
-- Abrir la caja lo hace el servidor al guardar cada registro; cerrarla es
-- siempre una decisión de quien la trabaja ("terminé esta caja"), nunca del
-- servidor: ninguna caja se cierra sola. La lógica está en
-- `backend/src/services/cicloCaja.service.ts`.
--
-- El índice sobre `fuiddatosreal(caja)` no es opcional: el cierre mira el
-- último registro de la caja, y sin él esa consulta recorre entera la tabla
-- más grande del sistema.
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
