-- El asunto compuesto no lleva el marcador N/A.
--
-- El asunto que ve el cliente en el FUID es la unión del asunto automático y
-- el manual, y la compone el trigger `fuid_asunto_automatico`. Desde que el
-- manual puede dejarse en blanco se guarda como `N/A`, y el trigger, que solo
-- sabía saltarse el vacío, lo pegaba al automático: "APROVECHAMIENTOS N/A".
-- El marcador se conserva en cada campo; el asunto compuesto se arma solo con
-- los que tienen texto.
--
-- Dos cosas, y el servidor hace las dos al arrancar
-- (`backend/src/config/esquema.ts`); este archivo existe para poder hacerlas a
-- mano sobre una base en la que el servidor no pueda:
--
--   1. La definición nueva del trigger, que es la de `02-triggers.sql`.
--   2. La recomposición, una sola vez, de los asuntos ya guardados con el
--      marcador pegado. Sus dos campos de origen siguen intactos, así que no
--      se pierde nada. Va con los triggers de historial y de `updated_at`
--      apagados mientras dura: es una corrección del sistema, no de quien
--      digitó, y setecientas filas iguales en el historial solo taparían las
--      ediciones de verdad. Todo en una transacción: si falla, los triggers
--      quedan encendidos.
--
-- Idempotente: se puede repetir sin que la segunda vez cambie nada.

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

BEGIN;
ALTER TABLE fuiddatosreal DISABLE TRIGGER fuid_historial_actualizacion;
ALTER TABLE fuiddatosreal DISABLE TRIGGER fuiddatosreal_updated_at;

UPDATE fuiddatosreal
   SET asunto = COALESCE(NULLIF(concat_ws(' ',
         NULLIF(NULLIF(asunto_2, ''), 'N/A'),
         NULLIF(NULLIF(asunto_3, ''), 'N/A')), ''), 'N/A')
 WHERE (asunto_2 = 'N/A' OR asunto_3 = 'N/A')
   AND asunto IS DISTINCT FROM COALESCE(NULLIF(concat_ws(' ',
         NULLIF(NULLIF(asunto_2, ''), 'N/A'),
         NULLIF(NULLIF(asunto_3, ''), 'N/A')), ''), 'N/A');

ALTER TABLE fuiddatosreal ENABLE TRIGGER fuid_historial_actualizacion;
ALTER TABLE fuiddatosreal ENABLE TRIGGER fuiddatosreal_updated_at;
COMMIT;

-- Comprobación: no debe quedar ningún asunto con el marcador pegado.
SELECT COUNT(*) AS con_marcador_pegado
  FROM fuiddatosreal
 WHERE asunto LIKE '% N/A' OR asunto LIKE 'N/A %';
