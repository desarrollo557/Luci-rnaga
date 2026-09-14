import type { RequestHandler } from 'express';
import { cleanUpper } from '../utils/format.js';

/** Claves cuyo valor nunca se transforma: credenciales que deben conservar su forma exacta. */
const CLAVES_SIN_MAYUSCULAS = new Set(['contrasena', 'password', 'contrasena_actual', 'nueva_contrasena']);

function normalizar(valor: unknown): unknown {
  if (typeof valor === 'string') return cleanUpper(valor);
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor !== null && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const salida: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = CLAVES_SIN_MAYUSCULAS.has(clave) ? contenido : normalizar(contenido);
    }
    return salida;
  }
  return valor;
}

/**
 * Regla de negocio del software: todo texto que entra por la API se guarda
 * normalizado —sin espacios sobrantes y en MAYÚSCULAS—, sin depender de cada
 * formulario. Se aplica al cuerpo de cualquier petición (POST, PUT, PATCH)
 * después de express.json(); las contraseñas se dejan intactas porque se
 * comparan contra su hash.
 *
 * Antes solo hacía `toUpperCase()`, así que `"OFICIO "` y `"OFICIO"` entraban
 * como valores distintos: ensuciaban el autocompletado, partían en dos las
 * agrupaciones por serie o subserie y descuadraban los reportes. En el volcado
 * de producción se ve el efecto: 37.463 de 81.171 registros traen espacios
 * sobrantes en `entidad_remitente`, y 4.710 traen espacios dobles en `asunto`.
 *
 * Ahora usa `cleanUpper`, que además recorta los extremos y colapsa los espacios
 * internos. Colapsar es seguro aquí: ningún formulario de la aplicación usa
 * `<textarea>` y en los 81.171 registros no hay un solo valor con salto de
 * línea, así que no existe contenido multilínea que se pueda estropear. Si
 * alguna vez se añade un campo donde el formato interno importe, hay que
 * excluirlo con un conjunto aparte que aplique solo `trim`.
 */
export const cuerpoEnMayusculas: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = normalizar(req.body);
  }
  next();
};
