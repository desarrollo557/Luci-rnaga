import type { Request, Response } from 'express';
import { query } from '../config/db.js';

/**
 * Quién está trabajando, desde cuándo y cuánto lleva hecho.
 *
 * El líder no tenía forma de saberlo sin preguntar por teléfono. Producción da
 * los totales del mes y el historial dice qué pasó, pero ninguna de las dos
 * responde a "quién está dentro ahora y cómo va la jornada", que es lo que se
 * necesita para repartir trabajo durante el día.
 *
 * Cada fila es una persona y cruza tres señales distintas, de menor a mayor
 * fuerza como prueba de que está trabajando:
 *
 * - **Presencia**, la marca que el middleware de actividad escribe mientras la
 *   persona usa el software, junto con el instante de su último registro,
 *   porque guardar un registro también es estar dentro. Se devuelve el instante
 *   y no un sí o un no, para que la pantalla lo recalcule sola entre refrescos
 *   y diga además hace cuánto fue.
 * - **Escritura**, que es la prueba fuerte: el formulario de digitación avisa
 *   mientras se pulsan teclas. Tener el software abierto no es trabajar, y esta
 *   es la única señal que distingue las dos cosas.
 * - **Trabajo**, de `fuiddatosreal`, dentro del rango que se pida: a qué hora
 *   guardó el primero, a qué hora el último, cuántos registros y cuántas cajas.
 *
 * Se mide por `created_at`, el momento real en que se guardó, y no por
 * `fecha_del_dato`, que es la fecha que la persona escribe y puede ser la de
 * ayer. Para saber a qué hora empezó hoy hace falta la hora de verdad.
 *
 * Salen también quienes digitaron en el rango pero ya no son usuarios, porque su
 * trabajo cuenta igual y desaparecerlos del recuento haría cuadrar mal la suma.
 */

export interface FilaDeActividad {
  cc: string | null;
  nombre: string;
  rol: string | null;
  sede: string | null;
  /** Instante de su última petición al servidor. */
  ultima_actividad: string | null;
  /** Instante en que pulsó una tecla en el formulario por última vez. */
  ultima_escritura: string | null;
  /** Caja en la que estaba escribiendo. */
  caja_escribiendo: string | null;
  /**
   * La prueba más reciente de que estuvo usando el software: su última petición
   * o su último registro, lo que sea posterior.
   */
  ultimo_visto: string | null;
  /** Caja del último registro del periodo: en la que va ahora mismo. */
  caja_actual: string | null;
  /** Primer y último registro guardados dentro del rango. */
  primer_registro: string | null;
  ultimo_registro: string | null;
  registros: number;
  cajas: number;
  /** `false` cuando digitó en el rango pero su cuenta ya no existe. */
  es_usuario: boolean;
}

/**
 * Rango consultado. Por defecto, la jornada de hoy en hora de Colombia.
 *
 * Se aceptan fecha sola o fecha y hora. Con fecha sola, `hasta` incluye el día
 * entero: pedir "del 17 al 17" tiene que devolver lo del 17, no nada.
 */
function rangoDeActividad(req: Request): { desde: string; hasta: string } {
  const pedido = (nombre: string) => String(req.query[nombre] ?? '').trim();
  const soloFecha = (valor: string) => /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  const desdeCrudo = pedido('desde') || hoy;
  const hastaCrudo = pedido('hasta') || hoy;
  return {
    desde: soloFecha(desdeCrudo) ? `${desdeCrudo} 00:00:00` : desdeCrudo,
    // Un día entero termina al empezar el siguiente; la consulta compara con <.
    hasta: soloFecha(hastaCrudo) ? `${hastaCrudo} 24:00:00` : hastaCrudo,
  };
}

/**
 * `GET /actividad?desde=&hasta=`
 *
 * El `FULL JOIN` es lo que permite que aparezcan las dos cosas que interesan: el
 * usuario que está conectado aunque todavía no haya digitado nada, y el trabajo
 * de quien ya no tiene cuenta.
 */
export async function actividadDelEquipo(req: Request, res: Response): Promise<void> {
  const { desde, hasta } = rangoDeActividad(req);

  const filas = await query<FilaDeActividad>(
    `WITH trabajo AS (
       SELECT substring(f.elaborado_por from '[(]([^)]*)[)]') AS cc,
              MIN(f.elaborado_por)   AS nombre_crudo,
              MIN(f.created_at)      AS primer_registro,
              MAX(f.created_at)      AS ultimo_registro,
              (array_agg(f.caja ORDER BY f.created_at DESC))[1] AS caja_actual,
              COUNT(*)               AS registros,
              COUNT(DISTINCT f.caja) AS cajas
         FROM fuiddatosreal f
        WHERE f.created_at >= ?::timestamp
          AND f.created_at <  ?::timestamp
          AND f.elaborado_por IS NOT NULL
        GROUP BY 1
     )
     SELECT COALESCE(u.cc, t.cc)                        AS cc,
            COALESCE(u.nombre, t.nombre_crudo, '')      AS nombre,
            u.rol,
            u.sede,
            u.ultima_actividad,
            u.ultima_escritura,
            u.caja_escribiendo,
            /*
             * Guardar un registro es usar el software, así que cuenta como
             * presencia igual que cualquier otra petición. Sin esto, quien
             * llevaba treinta registros esa mañana aparecía como "nunca ha
             * entrado" al lado de la hora de su último registro, que es una
             * contradicción en la misma fila. GREATEST ignora los nulos, así
             * que vale aunque falte una de las dos señales.
             */
            GREATEST(u.ultima_actividad, u.ultima_escritura, t.ultimo_registro) AS ultimo_visto,
            t.caja_actual,
            t.primer_registro,
            t.ultimo_registro,
            COALESCE(t.registros, 0)                    AS registros,
            COALESCE(t.cajas, 0)                        AS cajas,
            (u.id IS NOT NULL)                          AS es_usuario
       FROM users u
       FULL JOIN trabajo t ON t.cc = u.cc
      ORDER BY GREATEST(u.ultima_actividad, u.ultima_escritura, t.ultimo_registro) DESC NULLS LAST,
               COALESCE(t.registros, 0) DESC, 2`,
    [desde, hasta],
  );

  res.json({
    desde,
    hasta,
    // El reloj del servidor, para que la pantalla mida "hace cuánto" contra él y
    // no contra el del equipo de quien mira, que puede ir desfasado.
    ahora: new Date().toISOString(),
    personas: filas.map((f) => ({ ...f, registros: Number(f.registros), cajas: Number(f.cajas) })),
  });
}

/**
 * `POST /actividad/escribiendo` con `{ caja }`
 *
 * Lo llama el formulario de digitación mientras se teclea, como mucho una vez
 * cada medio minuto. Es lo que permite distinguir a quien está escribiendo de
 * quien solo dejó la pantalla abierta: sin esto, las dos cosas se ven igual.
 *
 * Responde siempre que sí y no devuelve nada. Es una señal de seguimiento: si
 * falla, lo que se pierde es un punto de color en una tabla, y no puede
 * estorbar a quien está digitando.
 */
export async function marcarEscribiendo(req: Request, res: Response): Promise<void> {
  const usuario = req.session.user;
  if (!usuario?.id) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  const caja = String((req.body as { caja?: unknown })?.caja ?? '').trim().slice(0, 255) || null;
  await query('UPDATE users SET ultima_escritura = now(), caja_escribiendo = ? WHERE id = ?', [
    caja,
    usuario.id,
  ]);
  res.status(204).end();
}
