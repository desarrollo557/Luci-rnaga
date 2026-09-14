/**
 * Longitud máxima de cada campo de texto del FUID, para poner `maxLength` en los
 * inputs y que el navegador impida escribir de más.
 *
 * FUENTE DE VERDAD: `LONGITUD_MAXIMA_FUID` en `backend/src/config/constants.ts`,
 * que a su vez sale del tamaño declarado de cada columna en
 * `database/schema.sql`. El backend es quien rechaza; esto solo evita que la
 * persona escriba un texto que va a perder.
 *
 * Están repetidos y no importados por la misma razón que los catálogos: el
 * backend compila con `rootDir: "src"`. `limites.test.ts` compara ambos mapas
 * para que no se desincronicen en silencio.
 */
export const LONGITUD_MAXIMA_FUID = {
  codigo: 255,
  entidad_remitente: 255,
  entidad_productora: 255,
  unidad_administrativa: 255,
  oficina_productora: 255,
  objeto: 255,
  serie: 255,
  subserie: 255,
  numero_de_orden_interno: 255,
  accionado_procesado: 255,
  accionado_denunciante: 255,
  identificacion: 255,
  asunto: 255,
  radicado: 255,
  numero_doc: 255,
  numero_doc_hasta: 255,
  caja: 255,
  upd: 255,
  tomo: 255,
  otro: 255,
  caja_interna: 255,
  folios: 255,
  soporte: 255,
  frecuencia: 255,
  elaborado_por: 255,
  nro_acta_transferible: 255,
  notas: 255,
  sede: 255,
  cambio_calidad: 255,
  sede_calidad: 255,
  asunto_2: 255,
  asunto_3: 255,
  historial_y_cambios: 65535,
} as const;

export type CampoFuidConLimite = keyof typeof LONGITUD_MAXIMA_FUID;

/** Límite del campo, o `undefined` si no es un campo de texto acotado. */
export function limiteDe(campo: string): number | undefined {
  return LONGITUD_MAXIMA_FUID[campo as CampoFuidConLimite];
}
