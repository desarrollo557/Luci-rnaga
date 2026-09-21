-- Triggers de negocio de Luciérnaga, portados de MySQL a PostgreSQL.
--
-- Son los que la migración no puede traducir sola, y sin ellos el sistema
-- cambia de comportamiento en silencio: el asunto dejaría de componerse y el
-- historial dejaría de registrarse.
--
-- Idempotente: se puede ejecutar varias veces.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El asunto se compone solo
-- ─────────────────────────────────────────────────────────────────────────────
-- `asunto` no lo escribe nadie: es el asunto automático y el manual unidos por
-- un espacio. De ahí los nombres que ven los digitadores en el formulario.
--
-- En MySQL eran dos triggers (uno al insertar y otro al actualizar) con la
-- misma fórmula repetida, más un IF para no recalcular si ninguno de los dos
-- cambiaba. Aquí es una sola función: `concat_ws` ya omite los valores nulos,
-- así que no hace falta decidir a mano si toca poner el espacio de separación.
--
-- El marcador de campo sin diligenciar, `N/A`, tampoco entra en el asunto.
-- Desde que el asunto manual puede dejarse en blanco se guarda como `N/A`, y
-- pegarlo al automático dejaba en el FUID "APROVECHAMIENTOS N/A". El marcador
-- se conserva en cada campo, como en todos los demás; el asunto compuesto, que
-- es un dato derivado, se arma solo con los que tienen texto. Si los dos
-- quedaran vacíos, el asunto es el propio marcador, como cualquier texto sin
-- diligenciar. El servidor aplica esta misma definición al arrancar
-- (`backend/src/config/esquema.ts`) y recompone los asuntos ya guardados.

CREATE OR REPLACE FUNCTION fuid_componer_asunto() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.asunto_2 IS DISTINCT FROM OLD.asunto_2
     OR NEW.asunto_3 IS DISTINCT FROM OLD.asunto_3 THEN
    NEW.asunto := COALESCE(
      NULLIF(concat_ws(' ',
        NULLIF(NULLIF(NEW.asunto_2, ''), 'N/A'),
        NULLIF(NULLIF(NEW.asunto_3, ''), 'N/A')), ''),
      'N/A');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fuid_asunto_automatico ON fuiddatosreal;
CREATE TRIGGER fuid_asunto_automatico
  BEFORE INSERT OR UPDATE ON fuiddatosreal
  FOR EACH ROW EXECUTE FUNCTION fuid_componer_asunto();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cada edición y cada borrado dejan copia en el historial
-- ─────────────────────────────────────────────────────────────────────────────
-- Se guarda el registro tal como estaba ANTES del cambio (OLD), que es lo que
-- permite reconstruir qué decía y quién lo modificó.
--
-- Se copian TODAS las columnas que el historial puede guardar. El trigger que
-- venía de MySQL se dejaba cinco fuera —sede, tiempo y los tres campos de la
-- revisión—, y al quedar vacías el historial las mostraba como si
-- hubieran cambiado en cada edición: "Sede: — → BARRANQUILLA" aparecía en todos
-- los movimientos aunque nadie tocara ese campo. `tipo_cambio` distingue
-- una edición de un borrado; ambos casos comparten función porque lo único que
-- cambia entre ellos es esa etiqueta.
--
-- Las columnas son `tipo_cambio` y `fecha_cambio`. El trigger de MySQL las
-- escribía como `tipo_Cambio` y `fecha_Cambio`, pero MySQL no distingue
-- mayúsculas en los nombres de columna y PostgreSQL sí: con esa grafía no
-- las encontraría.

CREATE OR REPLACE FUNCTION fuid_copiar_a_historial() RETURNS trigger AS $$
BEGIN
  INSERT INTO historial (
    id_dato, fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora,
    unidad_administrativa, oficina_productora, objeto, serie, subserie, asunto, radicado,
    numero_doc, numero_doc_hasta, fecha_inicial, fecha_final, caja, upd, tomo, otro,
    caja_interna, folios, soporte, frecuencia, elaborado_por, nro_acta_transferible,
    fecha_transferencia, notas, sede, tiempo, historial_cambios, cambio_calidad, sede_calidad,
    tipo_cambio, fecha_cambio
  ) VALUES (
    OLD.id, OLD.fecha_del_dato, OLD.n_orden, OLD.codigo, OLD.entidad_remitente,
    OLD.entidad_productora, OLD.unidad_administrativa, OLD.oficina_productora, OLD.objeto,
    OLD.serie, OLD.subserie, OLD.asunto, OLD.radicado, OLD.numero_doc, OLD.numero_doc_hasta,
    OLD.fecha_inicial, OLD.fecha_final, OLD.caja, OLD.upd, OLD.tomo, OLD.otro,
    OLD.caja_interna, OLD.folios, OLD.soporte, OLD.frecuencia, OLD.elaborado_por,
    OLD.nro_acta_transferible, OLD.fecha_transferencia, OLD.notas,
    OLD.sede, OLD.tiempo, OLD.historial_y_cambios, OLD.cambio_calidad, OLD.sede_calidad,
    CASE TG_OP WHEN 'DELETE' THEN 'ELIMINADO' ELSE 'ACTUALIZADO' END,
    now()
  );
  RETURN NULL; -- AFTER trigger: el valor devuelto se ignora
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fuid_historial_actualizacion ON fuiddatosreal;
CREATE TRIGGER fuid_historial_actualizacion
  AFTER UPDATE ON fuiddatosreal
  FOR EACH ROW EXECUTE FUNCTION fuid_copiar_a_historial();

DROP TRIGGER IF EXISTS fuid_historial_eliminacion ON fuiddatosreal;
CREATE TRIGGER fuid_historial_eliminacion
  AFTER DELETE ON fuiddatosreal
  FOR EACH ROW EXECUTE FUNCTION fuid_copiar_a_historial();
