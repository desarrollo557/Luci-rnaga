import type { NextFunction, Request, Response } from 'express';
import { query } from '../config/db.js';

/**
 * Deja constancia de que la persona sigue usando el software.
 *
 * Hace falta porque no había forma de saber quién está dentro. La sesión no
 * sirve: dura horas y se renueva al entrar, no al trabajar, así que alguien que
 * cerró el portátil a las nueve seguiría figurando conectado a la una. Lo único
 * que demuestra presencia es que lleguen peticiones suyas, y eso es lo que se
 * anota aquí.
 *
 * **Se escribe como mucho una vez por minuto y por persona.** Cada pantalla
 * lanza varias peticiones y además se refrescan solas cada pocos segundos:
 * actualizar la fila del usuario en cada una convertiría una consulta de lectura
 * en una escritura, y la digitación es lo más repetido del sistema. Con un
 * minuto de margen, saber si alguien está en línea es igual de fiable y el coste
 * desaparece.
 *
 * **No bloquea ni puede tumbar la petición.** Es información de seguimiento: si
 * la escritura falla, la petición sigue su curso y se registra el motivo.
 */

/** Cada cuánto se vuelve a escribir la marca de una misma persona. */
export const MINIMO_ENTRE_MARCAS_MS = 60_000;

const ultimaMarca = new Map<number, number>();

/** Para las pruebas: olvida lo anotado y vuelve al estado inicial. */
export function olvidarMarcas(): void {
  ultimaMarca.clear();
}

export function marcarActividad(req: Request, _res: Response, next: NextFunction): void {
  const usuario = req.session?.user;
  if (usuario?.id) {
    const ahora = Date.now();
    const anterior = ultimaMarca.get(usuario.id) ?? 0;
    if (ahora - anterior >= MINIMO_ENTRE_MARCAS_MS) {
      ultimaMarca.set(usuario.id, ahora);
      void query('UPDATE users SET ultima_actividad = now() WHERE id = ?', [usuario.id]).catch(
        (error: unknown) => {
          // Se reintenta en la siguiente petición pasado el minuto.
          ultimaMarca.delete(usuario.id);
          console.error('[actividad] No se pudo anotar la actividad del usuario:', error);
        },
      );
    }
  }
  next();
}
