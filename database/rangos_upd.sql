-- Tabla de rangos UPD asignados por líderes a técnicos (rangos_upd).
-- Script idempotente: puede ejecutarse varias veces sin errores.
-- Sin FKs ni UNIQUE: coincide con la convención del esquema existente
-- (chequeos referenciales y de solapamiento a nivel de código).

CREATE TABLE IF NOT EXISTS rangos_upd (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  sub_modulo_id INT NOT NULL,
  upd_inicio VARCHAR(10) NOT NULL,
  upd_fin VARCHAR(10) NOT NULL,
  estado ENUM('activo', 'agotado', 'revocado') NOT NULL DEFAULT 'activo',
  asignado_por INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_agotado DATETIME NULL,
  fecha_revocacion DATETIME NULL,
  KEY idx_rangos_usuario_sub (usuario_id, sub_modulo_id, estado),
  KEY idx_rangos_asignado_por (asignado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
