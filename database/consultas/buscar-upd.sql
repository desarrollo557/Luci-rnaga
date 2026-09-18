-- Buscar un UPD concreto y ver dónde está y qué tiene.
--
-- Para el editor SQL de Supabase. Responde a la pregunta que se hace a diario:
-- "¿dónde quedó el UPD tal?". Devuelve el registro con su contexto completo
-- —cliente, acta, caja, quién lo digitó y cuándo— porque el número suelto no
-- sirve de nada si hay que buscar a mano a qué caja pertenece.
--
-- `fuiddatosreal.upd` tiene una restricción de unicidad (`unique_upd`), así que
-- un UPD identifica como mucho un registro: cero filas significa que no existe.
--
-- El número se normaliza antes de comparar. Se acepta escribirlo de cualquier
-- forma —`UPD2950001`, `2950001`, `upd 2950001`, `295 0001`— porque quien lo
-- busca lo suele traer copiado de un correo o leído de una etiqueta, y que la
-- consulta no encuentre nada por un espacio de más es una pérdida de tiempo
-- evitable: se quitan los caracteres que no son dígitos, se rellena con ceros a
-- la izquierda hasta siete y se le antepone `UPD`.

-- ---------------------------------------------------------------------------
-- 1. La función. Se crea una sola vez y después se usa desde cualquier sitio:
--
--      SELECT * FROM buscar_upd('2950001');
--
-- Es la forma cómoda: no hay que volver a pegar la consulta ni recordar los
-- enlaces entre tablas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION buscar_upd(entrada text)
RETURNS TABLE (
  upd                 varchar(255),
  n_orden             integer,
  cliente_codigo      varchar(255),
  cliente             varchar(255),
  sede                varchar(255),
  acta                varchar(255),
  caja                varchar(255),
  estado_caja         varchar(255),
  caja_interna        varchar(255),
  asunto              varchar(255),
  asunto_automatico   varchar(255),
  asunto_manual       varchar(255),
  serie               varchar(255),
  subserie            varchar(255),
  objeto              varchar(255),
  fecha_inicial       date,
  fecha_final         date,
  folios              varchar(255),
  soporte             varchar(255),
  tomo                varchar(255),
  notas               varchar(255),
  elaborado_por       varchar(255),
  fecha_del_dato      date,
  revisado            boolean,
  digitado_el         timestamp,
  modificado_el       timestamp,
  registro_id         integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.upd,
    f.n_orden,
    s.codigo                       AS cliente_codigo,
    s.entidad_remitente            AS cliente,
    s.sede_submodulos              AS sede,
    COALESCE(NULLIF(f.nro_acta_transferible, 'N/A'), mcl.acta_transferencia_modulo) AS acta,
    f.caja,
    mc.estado_caja,
    f.caja_interna,
    f.asunto,
    f.asunto_2                     AS asunto_automatico,
    f.asunto_3                     AS asunto_manual,
    f.serie,
    f.subserie,
    f.objeto,
    f.fecha_inicial,
    f.fecha_final,
    f.folios,
    f.soporte,
    f.tomo,
    f.notas,
    f.elaborado_por,
    f.fecha_del_dato,
    (f.historial_y_cambios = 'OK')  AS revisado,
    f.created_at                   AS digitado_el,
    f.updated_at                   AS modificado_el,
    f.id                           AS registro_id
  FROM fuiddatosreal f
  -- Los enlaces van hacia arriba: registro → caja → acta → cliente. Son LEFT
  -- porque un registro heredado de la base antigua puede no tener ficha de caja,
  -- y aun así hay que poder encontrarlo.
  LEFT JOIN modulos_caja   mc  ON mc.caja_modulo = f.caja
  LEFT JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
  LEFT JOIN sub_modulos    s   ON s.id = mcl.id_submodulo
  WHERE f.upd = 'UPD' || lpad(regexp_replace(entrada, '\D', '', 'g'), 7, '0');
$$;

-- ---------------------------------------------------------------------------
-- 2. La misma consulta suelta, por si se prefiere pegarla sin crear nada.
--    Solo hay que cambiar el valor de la primera línea.
-- ---------------------------------------------------------------------------

-- SELECT * FROM buscar_upd('2950001');

-- ---------------------------------------------------------------------------
-- 3. Variantes que suelen hacer falta al lado de la anterior.
-- ---------------------------------------------------------------------------

-- Varios UPD de una vez:
--   SELECT b.* FROM unnest(ARRAY['2950001','2950002','UPD2950003']) AS e(entrada)
--   CROSS JOIN LATERAL buscar_upd(e.entrada) b;

-- Un rango completo, para revisar una tanda:
--   SELECT b.* FROM generate_series(2950001, 2950020) AS n
--   CROSS JOIN LATERAL buscar_upd(n::text) b
--   ORDER BY b.upd;

-- Cuáles de una lista NO existen todavía en la base:
--   SELECT e.entrada
--   FROM unnest(ARRAY['2950001','9999999']) AS e(entrada)
--   WHERE NOT EXISTS (SELECT 1 FROM buscar_upd(e.entrada));
