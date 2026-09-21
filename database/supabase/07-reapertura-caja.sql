-- Quién reabrió una caja a mano y qué día.
--
-- La técnica solo corrige sus registros del mismo día en que los digitó; los
-- de días anteriores quedan para el líder. Estas dos columnas son la
-- excepción que pidió la operación: cuando un líder o administrador reabre la
-- caja a mano, queda escrito quién y qué día, y mientras la caja siga abierta
-- la técnica puede corregir en ella también sus registros de días anteriores.
--
-- Todo cierre borra la marca: el de fin de jornada, el que provoca pasar a
-- otra caja y el cierre a mano. Así el permiso dura exactamente lo que dura la
-- reapertura. Reabrir la caja digitando en ella no escribe la marca: la puerta
-- la abre el líder, no quien digita.
--
-- Idempotente. El servidor lo aplica también al arrancar
-- (`backend/src/config/esquema.ts`); este archivo existe para poder hacerlo a
-- mano sobre una base nueva.

ALTER TABLE modulos_caja ADD COLUMN IF NOT EXISTS reabierta_por varchar(255);
ALTER TABLE modulos_caja ADD COLUMN IF NOT EXISTS reabierta_el date;
