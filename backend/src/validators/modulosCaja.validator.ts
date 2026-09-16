import { z } from 'zod';
import { OBJETOS_CAJA_VALIDOS, VALOR_NO_DILIGENCIADO } from '../config/constants.js';
import { sinDiligenciar } from '../utils/noDiligenciado.js';
import { fechaDocumental, textoNoDiligenciado } from './common.validator.js';

const updRegex = /^UPD\d{7}$/i;

/**
 * Objeto de la caja: uno de los dos del catálogo, o `N/A` si se deja sin elegir.
 *
 * El desplegable del formulario ofrece solo los dos valores, pero el campo se
 * puede dejar en blanco como cualquier otro descriptivo, y entonces se guarda
 * con el marcador en vez de quedar vacío.
 */
const objetoDeCaja = z
  .string()
  .nullable()
  .optional()
  .transform((valor) => (sinDiligenciar(valor) ? VALOR_NO_DILIGENCIADO : (valor as string).trim()))
  .refine(
    (valor) =>
      valor === VALOR_NO_DILIGENCIADO ||
      (OBJETOS_CAJA_VALIDOS as readonly string[]).includes(valor),
    `El objeto de la caja debe ser uno de: ${OBJETOS_CAJA_VALIDOS.join(', ')}`,
  );

export const createModuloCajaSchema = z.object({
  caja_modulo: z
    .string({ message: 'El número de caja es requerido' })
    .regex(/^\d{3}C\d{6}$/, 'El número de caja debe tener el formato 000C000000'),
  entidad_remitente_caja: z
    .string({ message: 'La entidad remitente es requerida' })
    .min(1, 'La entidad remitente es requerida'),
  acta_trans_caja: z
    .string({ message: 'El acta de transferencia es requerida' })
    .min(1, 'El acta de transferencia es requerida'),
  // `fecha_trans_caja` es NOT NULL en la tabla. Dejarla vacía llegaba hasta
  // PostgreSQL y volvía como 500 "Error interno del servidor", sin decir qué
  // faltaba; se rechaza aquí, con el nombre del campo.
  fecha_trans_caja: fechaDocumental('La fecha de transferencia').refine(
    (valor) => valor != null && valor.trim() !== '',
    'La fecha de transferencia es requerida',
  ),
  id_modulo_caja: z.coerce
    .number({ message: 'id_modulo_caja debe ser un número' })
    .int('id_modulo_caja debe ser un número entero')
    .positive('id_modulo_caja debe ser un número entero positivo'),
  // Los cuatro campos descriptivos de la caja admiten NULL en MySQL y no
  // siempre se conocen al crearla: se pueden dejar en blanco y se guardan como
  // N/A. Los de arriba (número de caja, entidad remitente, acta y fecha) son
  // NOT NULL en la tabla y además identifican la caja, así que siguen siendo
  // obligatorios.
  entidad_productora_caja: textoNoDiligenciado('La entidad productora'),
  unidad_administrativa_caja: textoNoDiligenciado('La unidad administrativa'),
  oficina_productora_caja: textoNoDiligenciado('La oficina productora'),
  objeto_caja: objetoDeCaja,
  estado_caja: z.enum(['EN PROCESO', 'FINALIZADO'], { message: 'Estado de caja inválido' }),
  upd_inicio: z.string().regex(updRegex, 'El UPD debe tener formato UPDXXXXXXX').optional(),
});

/**
 * Al editar, el objeto vuelve a ser texto libre.
 *
 * Las cajas creadas antes del catálogo tienen objetos que no están en la lista;
 * si el esquema de edición los rechazara, esas cajas no se podrían volver a
 * guardar hasta reasignarles un objeto, y cambiar un dato ajeno al objeto no
 * puede depender de eso. El formulario muestra el valor guardado como una
 * opción más para que no se pierda al abrir el modal.
 */
export const updateModuloCajaSchema = createModuloCajaSchema
  .omit({ id_modulo_caja: true })
  .extend({ objeto_caja: textoNoDiligenciado('El objeto') });

/**
 * Cuerpo de `POST /modulos_caja/serie`, que crea el rango de cajas del
 * formulario "Nueva caja".
 *
 * Antes este endpoint validaba a mano dentro del controlador y exigía los
 * cuatro campos descriptivos, así que el formulario de caja respondía
 * "Faltan campos requeridos" al dejar en blanco la oficina productora o el
 * objeto, mientras el resto del software ya los guardaba como `N/A`. Reusar
 * aquí las mismas reglas cierra esa diferencia.
 */
export const createSerieCajasSchema = createModuloCajaSchema
  .omit({ caja_modulo: true })
  .extend({
    numero_inicial: z
      .string({ message: 'El número inicial es requerido' })
      .regex(/^\d{6}$/, 'El número inicial debe tener 6 dígitos'),
    numero_final: z
      .string({ message: 'El número final es requerido' })
      .regex(/^\d{6}$/, 'El número final debe tener 6 dígitos'),
    usuarios_tecnica: z.array(z.coerce.number().int().positive()).optional(),
  });