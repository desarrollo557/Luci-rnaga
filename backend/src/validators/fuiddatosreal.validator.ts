import { z } from 'zod';
import { isUpdValid, normalizeUpd } from '../utils/updFormat.js';
import {
  ETIQUETA_CAMPO_FUID,
  FRECUENCIAS_VALIDAS,
  LONGITUD_MAXIMA_FUID,
  OTROS_VALIDOS,
  SOPORTES_VALIDOS,
} from '../config/constants.js';
import { fechaDocumental } from './common.validator.js';

const optionalNumber = z.union([z.number(), z.string()]).nullable().optional();

type CampoFuid = keyof typeof LONGITUD_MAXIMA_FUID;

/**
 * Texto opcional acotado al tamaño real de su columna en MySQL.
 *
 * Reemplaza al antiguo `optionalText`, que no tenía tope: el texto de más
 * llegaba hasta MySQL y volvía como error 1406, que el cliente veía como un 500
 * genérico sin saber qué campo recortar.
 */
function textoOpcional(campo: CampoFuid) {
  const maximo = LONGITUD_MAXIMA_FUID[campo];
  return z
    .string()
    .max(maximo, `${ETIQUETA_CAMPO_FUID[campo]} no puede superar los ${maximo} caracteres`)
    .nullable()
    .optional();
}

/**
 * Texto que no puede quedar en blanco, acotado al tamaño de su columna.
 *
 * Lo usan los dos campos de asunto. El resto del formulario admite quedar
 * vacío —lo que se deje en blanco se guarda como `N/A`—, pero el asunto es lo
 * que permite encontrar después el documento dentro de la caja: un FUID sin
 * asunto obliga a abrir la caja físicamente para saber qué contiene.
 *
 * El cuerpo llega ya recortado por el middleware `cuerpoEnMayusculas`, así que
 * un campo con solo espacios llega aquí como cadena vacía y `min(1)` lo
 * rechaza.
 */
function textoRequerido(campo: CampoFuid, mensaje: string) {
  const maximo = LONGITUD_MAXIMA_FUID[campo];
  return z
    .string({ message: mensaje })
    .min(1, mensaje)
    .max(maximo, `${ETIQUETA_CAMPO_FUID[campo]} no puede superar los ${maximo} caracteres`);
}

/** `N/A` es el marcador de campo no diligenciado; no es un valor inválido. */
const NO_DILIGENCIADO = 'N/A';

function sinDato(valor: string): boolean {
  const v = valor.trim().toUpperCase();
  return v === '' || v === NO_DILIGENCIADO;
}

/**
 * Cantidad entera que no puede ser negativa, o `N/A`.
 *
 * La columna sigue siendo texto en MySQL porque guarda `N/A`; esto valida la
 * entrada, no el esquema. Sin ella, `folios` aceptaba letras y negativos por API
 * aunque el formulario mostrara un campo numérico.
 */
function enteroNoNegativoOna(etiqueta: string) {
  return z
    .string()
    .nullable()
    .optional()
    .superRefine((valor, ctx) => {
      if (valor == null || sinDato(valor)) return;
      if (!/^\d+$/.test(valor.trim())) {
        ctx.addIssue({
          code: 'custom',
          message: `${etiqueta} debe ser un número entero de 0 o más, o ${NO_DILIGENCIADO}`,
        });
      }
    });
}

/**
 * Referencia de tomo.
 *
 * No se exige un entero: en producción se usan de forma habitual formatos como
 * `1/2` y `2/2` (tomo 1 de 2) o referencias de expediente como `22 N 255`, y
 * forzar un número obligaría a los digitadores a perder esa información. Lo que
 * sí se rechaza es un negativo y la puntuación que solo puede venir de un error
 * de tecleo.
 */
const CARACTERES_DE_TOMO = /^[A-ZÑÁÉÍÓÚ0-9/\-. ]+$/;

function referenciaDeTomo(etiqueta: string) {
  return z
    .string()
    .nullable()
    .optional()
    .superRefine((valor, ctx) => {
      if (valor == null || sinDato(valor)) return;
      const v = valor.trim();
      if (/^-\d/.test(v)) {
        ctx.addIssue({ code: 'custom', message: `${etiqueta} no puede ser un número negativo` });
        return;
      }
      if (!CARACTERES_DE_TOMO.test(v.toUpperCase())) {
        ctx.addIssue({
          code: 'custom',
          message: `${etiqueta} solo admite números, letras y los signos / - .`,
        });
      }
    });
}

/**
 * Campo de lista cerrada.
 *
 * Antes eran `optionalText`, así que por API entraba cualquier cadena aunque el
 * formulario mostrara un desplegable: en producción quedaron un `soporte` con
 * una frase de 59 caracteres y un `otro` con `LIBRO` en singular, fuera de la
 * lista. Ninguno de esos registros se ve afectado por la regla, porque
 * `updateFuid` ya impide modificar registros de días anteriores.
 *
 * El middleware `cuerpoEnMayusculas` normaliza el valor antes de llegar aquí, de
 * modo que la comparación contra el catálogo es exacta. La cadena vacía se
 * admite porque significa "sin elegir".
 */
function catalogoCerrado(valores: readonly string[], etiqueta: string) {
  // Se comprueba con superRefine y no con `z.enum(...).or(z.literal(''))`:
  // esa unión descarta el mensaje del enum y devuelve un "Invalid input" en
  // inglés, que es justo lo que no debe llegarle al digitador.
  return z
    .string()
    .nullable()
    .optional()
    .superRefine((valor, ctx) => {
      if (valor == null || valor.trim() === '') return;
      if (!valores.includes(valor.trim().toUpperCase())) {
        ctx.addIssue({
          code: 'custom',
          message: `${etiqueta} debe ser uno de estos valores: ${valores.join(', ')}`,
        });
      }
    });
}

/**
 * Normaliza (trim + mayúsculas) y valida un UPD: UPD + exactamente 7 dígitos.
 * El enforcement de membresía por rango es solo para rol TECNICA y se aplica en
 * el controller; aquí solo se garantiza el formato para todos los roles.
 */
const updField = z
  .string({ message: 'El UPD es requerido' })
  .min(1, 'El UPD es requerido')
  .transform((v) => normalizeUpd(v))
  .refine((v) => isUpdValid(v), {
    message: 'Formato de UPD inválido: debe ser UPD + 7 dígitos (ej. UPD2950001)',
  });

const fuidBaseSchema = z.object({
  fecha_del_dato: fechaDocumental('La fecha del dato'),
  n_orden: optionalNumber,
  codigo: textoOpcional('codigo'),
  entidad_remitente: textoOpcional('entidad_remitente'),
  entidad_productora: textoOpcional('entidad_productora'),
  unidad_administrativa: textoOpcional('unidad_administrativa'),
  oficina_productora: textoOpcional('oficina_productora'),
  objeto: textoOpcional('objeto'),
  serie: textoOpcional('serie'),
  subserie: textoOpcional('subserie'),
  numero_de_orden_interno: textoOpcional('numero_de_orden_interno'),
  accionado_procesado: textoOpcional('accionado_procesado'),
  accionado_denunciante: textoOpcional('accionado_denunciante'),
  identificacion: textoOpcional('identificacion'),
  asunto: textoOpcional('asunto'),
  radicado: textoOpcional('radicado'),
  numero_doc: textoOpcional('numero_doc'),
  numero_doc_hasta: textoOpcional('numero_doc_hasta'),
  fecha_inicial: fechaDocumental('La fecha inicial'),
  fecha_final: fechaDocumental('La fecha final'),
  caja: z.string({ message: 'La caja es requerida' }).min(1, 'La caja es requerida'),
  upd: updField,
  tomo: referenciaDeTomo('El tomo'),
  otro: catalogoCerrado(OTROS_VALIDOS, 'El campo Otro'),
  caja_interna: textoOpcional('caja_interna'),
  folios: enteroNoNegativoOna('Los folios'),
  soporte: catalogoCerrado(SOPORTES_VALIDOS, 'El soporte'),
  frecuencia: catalogoCerrado(FRECUENCIAS_VALIDAS, 'La frecuencia'),
  elaborado_por: textoOpcional('elaborado_por'),
  nro_acta_transferible: textoOpcional('nro_acta_transferible'),
  fecha_transferencia: fechaDocumental('La fecha de transferencia'),
  notas: textoOpcional('notas'),
  sede: textoOpcional('sede'),
  // `tiempo` es una columna TIME (duración de la digitación), no un varchar: no
  // tiene longitud que acotar y por eso queda fuera de LONGITUD_MAXIMA_FUID.
  tiempo: z.string().nullable().optional(),
  historial_y_cambios: textoOpcional('historial_y_cambios'),
  cambio_calidad: textoOpcional('cambio_calidad'),
  sede_calidad: textoOpcional('sede_calidad'),
  asunto_2: textoRequerido('asunto_2', 'El asunto automático es requerido'),
  asunto_3: textoRequerido('asunto_3', 'El asunto manual es requerido'),
});

/**
 * El rango documental no puede ir hacia atrás.
 *
 * La validación existía en la versión anterior del sistema (`validateDates()`) y
 * se perdió al migrar: en el volcado de producción hay 10 registros con la fecha
 * final anterior a la inicial.
 *
 * Solo corre cuando ambas fechas vienen en el cuerpo. En una edición parcial que
 * trae una sola, la comparación contra el valor ya guardado la resuelve
 * `validarOrdenDeFechasParcial`, que sí puede leer el registro existente.
 */
function ordenDeFechas(
  datos: { fecha_inicial?: string | null; fecha_final?: string | null },
  ctx: z.RefinementCtx,
): void {
  const inicial = datos.fecha_inicial?.trim();
  const final = datos.fecha_final?.trim();
  if (!inicial || !final) return;
  if (final < inicial) {
    ctx.addIssue({
      code: 'custom',
      path: ['fecha_final'],
      message: 'La fecha final no puede ser anterior a la fecha inicial',
    });
  }
}

/**
 * El número de documento "hasta" no puede quedar por debajo del "desde".
 *
 * Solo se compara cuando ambos son enteros. Estos campos guardan también
 * radicados y referencias con letras, y `N/A` cuando el digitador marca el campo
 * como no diligenciado: en esos casos no hay un orden que comprobar y la regla
 * no aplica, igual que hace `onlyDigits` en el frontend.
 */
function ordenDeNumerosDeDocumento(
  datos: { numero_doc?: string | null; numero_doc_hasta?: string | null },
  ctx: z.RefinementCtx,
): void {
  const desde = datos.numero_doc?.trim();
  const hasta = datos.numero_doc_hasta?.trim();
  if (!desde || !hasta) return;
  if (!/^\d+$/.test(desde) || !/^\d+$/.test(hasta)) return;
  if (BigInt(hasta) < BigInt(desde)) {
    ctx.addIssue({
      code: 'custom',
      path: ['numero_doc_hasta'],
      message: 'El número de documento final no puede ser menor que el inicial',
    });
  }
}

export const createFuidSchema = fuidBaseSchema
  .superRefine(ordenDeFechas)
  .superRefine(ordenDeNumerosDeDocumento);

export const updateFuidSchema = fuidBaseSchema
  .partial()
  .extend({
    caja: z
      .string({ message: 'La caja no puede estar vacía' })
      .min(1, 'La caja no puede estar vacía')
      .optional(),
    upd: updField.optional(),
    /**
     * Versión del registro tal como la leyó el cliente (bloqueo optimista).
     *
     * Es obligatoria: sin ella no hay forma de saber si quien guarda está
     * trabajando sobre la última versión o sobre una copia que ya quedó vieja,
     * que es justo el caso que esto viene a detectar.
     */
    version: z.coerce
      .number({ message: 'Falta la versión del registro; recargue antes de guardar' })
      .int('La versión del registro debe ser un número entero')
      .positive('La versión del registro debe ser un número positivo'),
  })
  .superRefine(ordenDeFechas)
  .superRefine(ordenDeNumerosDeDocumento);

/**
 * Comprueba el orden de las fechas de una edición parcial contra lo ya guardado.
 *
 * Sin esto, un PUT que solo trae `fecha_final` pasaría el schema —no hay con qué
 * compararla— y dejaría el registro con el rango invertido. Devuelve el mensaje
 * de error o `null` si el rango resultante es válido.
 */
export function validarOrdenDeFechasParcial(
  cambios: { fecha_inicial?: string | null; fecha_final?: string | null },
  guardado: { fecha_inicial?: string | null; fecha_final?: string | null },
): string | null {
  // `undefined` significa "no se toca este campo"; `null` significa "bórralo".
  const inicial = (cambios.fecha_inicial === undefined ? guardado.fecha_inicial : cambios.fecha_inicial)?.trim();
  const final = (cambios.fecha_final === undefined ? guardado.fecha_final : cambios.fecha_final)?.trim();
  if (!inicial || !final) return null;
  return final < inicial ? 'La fecha final no puede ser anterior a la fecha inicial' : null;
}