-- Restauración de objetos que faltan en database/schema.sql
-- Script idempotente: puede ejecutarse varias veces sin errores.
--
-- MOTIVO: el dump de phpMyAdmin (schema.sql) exportó los 11 triggers truncados:
-- cortó cada cuerpo en su primer ";" y lo sustituyó por el delimitador "$$",
-- perdiendo el resto del cuerpo y el END. Por eso el dump no se puede importar
-- tal cual (ERROR 1064 en la línea 88).
--
-- Aquí se restauran los 4 triggers cuyo cuerpo SÍ quedó íntegro en el dump
-- (un único statement, al que solo le faltaba el ";" y el "END").
-- Los 7 restantes (duplicidad_* e incrementar_orden) perdieron su cuerpo por
-- completo — solo sobrevivió su línea "DECLARE ... INT" — y NO se reconstruyen.
--
-- También se crea la tabla `auditoria`, que backend/src/services/audit.service.ts
-- usa pero que no existe en el dump.

CREATE TABLE IF NOT EXISTS auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entidad VARCHAR(100) NOT NULL,
  entidad_id VARCHAR(100) NULL,
  accion VARCHAR(30) NOT NULL,
  detalle VARCHAR(500) NULL,
  usuario VARCHAR(150) NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auditoria_entidad (entidad, entidad_id),
  KEY idx_auditoria_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS `before_insert_asunto`;
DELIMITER $$
CREATE TRIGGER `before_insert_asunto` BEFORE INSERT ON `fuiddatosreal` FOR EACH ROW BEGIN
    
    SET NEW.asunto = CONCAT(
        IFNULL(NULLIF(NEW.asunto_2, ''), ''), 
        IF(IFNULL(NULLIF(NEW.asunto_2, ''), '') != '' AND IFNULL(NULLIF(NEW.asunto_3, ''), '') != '', ' ', ''), 
        IFNULL(NULLIF(NEW.asunto_3, ''), '')
    );
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `actualizar_asunto`;
DELIMITER $$
CREATE TRIGGER `actualizar_asunto` BEFORE UPDATE ON `fuiddatosreal` FOR EACH ROW BEGIN
    -- Actualizar 'asunto' solo si los valores de 'asunto_2' o 'asunto_3' cambian
    IF OLD.asunto_2 != NEW.asunto_2 OR OLD.asunto_3 != NEW.asunto_3 THEN
        SET NEW.asunto = CONCAT(
            IFNULL(NULLIF(NEW.asunto_2, ''), ''), 
            IF(
                IFNULL(NULLIF(NEW.asunto_2, ''), '') != '' AND 
                IFNULL(NULLIF(NEW.asunto_3, ''), '') != '', 
                ' ', 
                ''
            ), 
            IFNULL(NULLIF(NEW.asunto_3, ''), '')
        );
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `after_update_fuiddatosreal`;
DELIMITER $$
CREATE TRIGGER `after_update_fuiddatosreal` AFTER UPDATE ON `fuiddatosreal` FOR EACH ROW BEGIN
    INSERT INTO historial (
        id_dato,
        fecha_del_dato,
        n_orden,
        codigo,
        entidad_remitente,
        entidad_productora,
        unidad_administrativa,
        oficina_productora,
        objeto,
        serie,
        subserie,
        asunto,
        radicado,
        numero_doc,
        numero_doc_hasta,
        fecha_inicial,
        fecha_final,
        caja,
        upd,
        tomo,
        otro,
        caja_interna,
        folios,
        soporte,
        frecuencia,
        elaborado_por,
        nro_acta_transferible,
        fecha_transferencia,
        notas,
        tipo_Cambio,
        fecha_Cambio
    ) VALUES (
        NEW.id,  -- Aseguramos que esto corresponde a 'id' de fuiddatosreal
        NEW.fecha_del_dato,
        NEW.n_orden,
        NEW.codigo,
        NEW.entidad_remitente,
        NEW.entidad_productora,
        NEW.unidad_administrativa,
        NEW.oficina_productora,
        NEW.objeto,
        NEW.serie,
        NEW.subserie,
        NEW.asunto,
        NEW.radicado,
        NEW.numero_doc,
        NEW.numero_doc_hasta,
        NEW.fecha_inicial,
        NEW.fecha_final,
        NEW.caja,
        NEW.upd,
        NEW.tomo,
        NEW.otro,
        NEW.caja_interna,
        NEW.folios,
        NEW.soporte,
        NEW.frecuencia,
        NEW.elaborado_por,
        NEW.nro_acta_transferible,
        NEW.fecha_transferencia,
        NEW.notas,
        'ACTUALIZADO',
        NOW()
    );
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `after_delete_fuiddatosreal`;
DELIMITER $$
CREATE TRIGGER `after_delete_fuiddatosreal` AFTER DELETE ON `fuiddatosreal` FOR EACH ROW BEGIN
    INSERT INTO historial (
        id_dato,
        fecha_del_dato,
        n_orden,
        codigo,
        entidad_remitente,
        entidad_productora,
        unidad_administrativa,
        oficina_productora,
        objeto,
        serie,
        subserie,
        asunto,
        radicado,
        numero_doc,
        numero_doc_hasta,
        fecha_inicial,
        fecha_final,
        caja,
        upd,
        tomo,
        otro,
        caja_interna,
        folios,
        soporte,
        frecuencia,
        elaborado_por,
        nro_acta_transferible,
        fecha_transferencia,
        notas,
        tipo_Cambio,
        fecha_Cambio
    ) VALUES (
        OLD.id,  -- Ajuste aquí para referenciar a 'id' en lugar de 'id_dato'
        OLD.fecha_del_dato,
        OLD.n_orden,
        OLD.codigo,
        OLD.entidad_remitente,
        OLD.entidad_productora,
        OLD.unidad_administrativa,
        OLD.oficina_productora,
        OLD.objeto,
        OLD.serie,
        OLD.subserie,
        OLD.asunto,
        OLD.radicado,
        OLD.numero_doc,
        OLD.numero_doc_hasta,
        OLD.fecha_inicial,
        OLD.fecha_final,
        OLD.caja,
        OLD.upd,
        OLD.tomo,
        OLD.otro,
        OLD.caja_interna,
        OLD.folios,
        OLD.soporte,
        OLD.frecuencia,
        OLD.elaborado_por,
        OLD.nro_acta_transferible,
        OLD.fecha_transferencia,
        OLD.notas,
        'ELIMINADO',
        NOW()
    );
END$$
DELIMITER ;

