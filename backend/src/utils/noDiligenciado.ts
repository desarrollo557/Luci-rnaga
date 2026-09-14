import { VALOR_NO_DILIGENCIADO } from '../config/constants.js';

/**
 * Campos sin diligenciar: la regla, en un solo sitio.
 *
 * Quien llena un formulario del software escribe lo que el documento, la caja o
 * el inventario tienen, y deja en blanco lo que no conoce; enviar no se bloquea
 * por eso. La ausencia se guarda con el marcador `N/A` —el mismo que traen los
 * registros históricos— en lugar de quedar como NULL o como cadena vacía, que
 * son dos maneras distintas de decir lo mismo y obligan a contemplar ambas en
 * cada consulta y cada reporte.
 *
 * El marcador solo vale para columnas de texto. Una columna `date`, `int` o
 * `time` no lo admite y tiene que seguir guardando NULL, así que cada sitio que
 * usa esto declara qué columnas pueden recibirlo.
 */

/** `true` si el valor cuenta como campo sin diligenciar. */
export function sinDiligenciar(valor: unknown): boolean {
  return valor == null || (typeof valor === 'string' && valor.trim() === '');
}

/**
 * Valor con el que una columna viaja a MySQL.
 *
 * @param admiteMarcador `true` para columnas de texto que pueden guardar `N/A`;
 * `false` para las demás, que quedan en NULL.
 */
export function valorParaGuardar(valor: unknown, admiteMarcador: boolean): unknown {
  if (!sinDiligenciar(valor)) return valor;
  return admiteMarcador ? VALOR_NO_DILIGENCIADO : null;
}
