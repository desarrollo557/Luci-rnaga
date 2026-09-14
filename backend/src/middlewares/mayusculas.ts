import type { RequestHandler } from 'express';

/** Claves cuyo valor nunca se transforma: credenciales que deben conservar su forma exacta. */
const CLAVES_SIN_MAYUSCULAS = new Set(['contrasena', 'password', 'contrasena_actual', 'nueva_contrasena']);

function aMayusculas(valor: unknown): unknown {
  if (typeof valor === 'string') return valor.toUpperCase();
  if (Array.isArray(valor)) return valor.map(aMayusculas);
  if (valor !== null && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const salida: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = CLAVES_SIN_MAYUSCULAS.has(clave) ? contenido : aMayusculas(contenido);
    }
    return salida;
  }
  return valor;
}

/**
 * Regla de negocio del software: todo texto que entra por la API se guarda en
 * MAYÚSCULAS, sin depender de cada formulario. Se aplica al cuerpo de cualquier
 * petición (POST, PUT, PATCH) después de express.json(); las contraseñas se
 * dejan intactas porque se comparan contra su hash.
 */
export const cuerpoEnMayusculas: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = aMayusculas(req.body);
  }
  next();
};
