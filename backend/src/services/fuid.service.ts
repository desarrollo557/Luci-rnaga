import type { FuidCreateDto } from '../types/index.js';
import { CAMPOS_NO_DILIGENCIADOS } from '../config/constants.js';
import { sinDiligenciar, valorParaGuardar } from '../utils/noDiligenciado.js';

export const FUID_COLUMNS = [
  'fecha_del_dato',
  'n_orden',
  'codigo',
  'entidad_remitente',
  'entidad_productora',
  'unidad_administrativa',
  'oficina_productora',
  'objeto',
  'serie',
  'subserie',
  'numero_de_orden_interno',
  'accionado_procesado',
  'accionado_denunciante',
  'identificacion',
  'asunto',
  'radicado',
  'numero_doc',
  'numero_doc_hasta',
  'fecha_inicial',
  'fecha_final',
  'caja',
  'upd',
  'tomo',
  'otro',
  'caja_interna',
  'folios',
  'soporte',
  'frecuencia',
  'elaborado_por',
  'nro_acta_transferible',
  'fecha_transferencia',
  'notas',
  'sede',
  'tiempo',
  'historial_y_cambios',
  'cambio_calidad',
  'sede_calidad',
  'asunto_2',
  'asunto_3',
] as const;

const CON_NO_DILIGENCIADO: ReadonlySet<string> = new Set(CAMPOS_NO_DILIGENCIADOS);

/**
 * Valor con el que viaja a MySQL una columna de texto del FUID.
 *
 * Un campo que el digitador dejó en blanco se guarda como `N/A` en lugar de
 * NULL: es el marcador que ya usan los registros históricos, así que la misma
 * ausencia deja de estar representada de dos formas distintas según la época
 * del registro. Qué columnas lo reciben está declarado en
 * `CAMPOS_NO_DILIGENCIADOS`; lo que no está ahí sigue viajando como NULL,
 * porque su columna es `date`, `int` o `time`, o porque lo llena el sistema.
 */
function texto(campo: string, valor: unknown): unknown {
  return valorParaGuardar(valor, CON_NO_DILIGENCIADO.has(campo));
}

/**
 * Fecha final con la que se guarda el registro.
 *
 * La mayoría de los documentos de una caja son de un solo día, y quien digita
 * escribe la fecha inicial y deja la final en blanco. Guardarla vacía dejaba el
 * rango abierto: el inventario mostraba un documento que empieza y no termina, y
 * cualquier consulta por rango de fechas tenía que contemplar el hueco. Cuando
 * la final no viene, se guarda la inicial y el rango queda cerrado en ese mismo
 * día, que es lo que el documento dice.
 *
 * Si tampoco hay fecha inicial no hay nada que copiar y las dos quedan en NULL:
 * es el caso de un documento sin fecha legible, que sí existe.
 *
 * Vive aquí y no en el formulario a propósito. El backend es la barrera real,
 * así que la regla se cumple venga la petición de donde venga, y el campo se le
 * sigue mostrando vacío a quien digita, como el resto de lo no diligenciado.
 */
export function fechaFinalEfectiva(dto: { fecha_inicial?: unknown; fecha_final?: unknown }): unknown {
  return sinDiligenciar(dto.fecha_final) ? dto.fecha_inicial : dto.fecha_final;
}

/** Valores en el mismo orden que FUID_COLUMNS para INSERT/UPDATE. */
export function fuidValues(dto: FuidCreateDto): unknown[] {
  // Columnas que no son de texto (`date`, `int`, `time`): una cadena vacía no es
  // un valor válido para ellas y tiene que llegar como NULL.
  const nullable = (v: unknown): unknown => valorParaGuardar(v, false);
  return [
    nullable(dto.fecha_del_dato),
    nullable(dto.n_orden),
    texto('codigo', dto.codigo),
    texto('entidad_remitente', dto.entidad_remitente),
    texto('entidad_productora', dto.entidad_productora),
    texto('unidad_administrativa', dto.unidad_administrativa),
    texto('oficina_productora', dto.oficina_productora),
    texto('objeto', dto.objeto),
    texto('serie', dto.serie),
    texto('subserie', dto.subserie),
    texto('numero_de_orden_interno', dto.numero_de_orden_interno),
    texto('accionado_procesado', dto.accionado_procesado),
    texto('accionado_denunciante', dto.accionado_denunciante),
    texto('identificacion', dto.identificacion),
    texto('asunto', dto.asunto),
    texto('radicado', dto.radicado),
    texto('numero_doc', dto.numero_doc),
    texto('numero_doc_hasta', dto.numero_doc_hasta),
    nullable(dto.fecha_inicial),
    nullable(fechaFinalEfectiva(dto)),
    dto.caja ?? null,
    dto.upd ?? null,
    texto('tomo', dto.tomo),
    texto('otro', dto.otro),
    texto('caja_interna', dto.caja_interna),
    texto('folios', dto.folios),
    texto('soporte', dto.soporte),
    texto('frecuencia', dto.frecuencia),
    nullable(dto.elaborado_por),
    texto('nro_acta_transferible', dto.nro_acta_transferible),
    nullable(dto.fecha_transferencia),
    texto('notas', dto.notas),
    nullable(dto.sede),
    nullable(dto.tiempo),
    nullable(dto.historial_y_cambios),
    nullable(dto.cambio_calidad),
    nullable(dto.sede_calidad),
    // El asunto automático es obligatorio y llega siempre con contenido; el
    // manual dejó de serlo, así que vacío se guarda con el marcador como el
    // resto de los campos descriptivos.
    dto.asunto_2 ?? null,
    texto('asunto_3', dto.asunto_3),
  ];
}

/** Campos permitidos para autocompletado. */
export const SUGGESTION_FIELDS = [
  'entidad_productora',
  'codigo',
  'unidad_administrativa',
  'oficina_productora',
  'objeto',
  'serie',
  'asunto_2',
  'subserie',
  'radicado',
  'numero_doc',
  'numero_doc_hasta',
  'caja_interna',
  'notas',
  'entidad_remitente',
  'asunto',
  'tomo',
  'soporte',
  'frecuencia',
  'sede',
  'tiempo',
  'asunto_3',
] as const;

export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

export function isSuggestionField(field: string): field is SuggestionField {
  return (SUGGESTION_FIELDS as readonly string[]).includes(field);
}
