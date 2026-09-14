import pg from 'pg';
import { DB_CONNECTION_LIMIT } from './constants.js';

/**
 * Acceso a la base de datos (PostgreSQL / Supabase).
 *
 * El software nació sobre MySQL con `mysql2`, y sus casi cincuenta consultas
 * están escritas con la sintaxis de esa librería. Reescribirlas todas a mano
 * habría multiplicado las erratas sin cambiar lo que hacen, así que la
 * traducción vive aquí y los controladores siguen escribiendo el mismo SQL:
 *
 *   * `?` pasa a `$1`, `$2`… por posición.
 *   * `IN (?)` con un array expande un marcador por elemento, como hacía
 *     `mysql2`. En PostgreSQL un array no se expande solo.
 *   * `VALUES ?` con un array de filas expande `($1, $2), ($3, $4)…`, que es
 *     como se insertaba en lote.
 *
 * Lo que no se puede traducir —`GROUP_CONCAT`, `DATE_FORMAT`, las columnas en
 * mayúsculas de `inventario`— está reescrito en cada consulta.
 *
 * Conexión: Supabase no publica el host directo `db.<ref>.supabase.co`, así que
 * se entra por el pooler (`aws-0-<región>.pooler.supabase.com`) con el usuario
 * `postgres.<ref>`. SSL es obligatorio.
 */

const { Pool } = pg;

// Las fechas y marcas de tiempo se leen como texto, igual que hacía `mysql2`
// con `dateStrings: true`. Sin esto llegarían como Date en la zona del
// servidor y una fecha documental podría desplazarse un día al serializarla.
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1114, (v) => v); // timestamp sin zona
pg.types.setTypeParser(1083, (v) => v); // time
pg.types.setTypeParser(20, (v) => Number(v)); // bigint: los COUNT(*) vuelven como número

export const pool = new Pool({
  host: process.env.PG_HOST || process.env.DB_HOST,
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'postgres',
  user: process.env.PG_USER || process.env.DB_USER,
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
  max: DB_CONNECTION_LIMIT,
  // Supabase exige TLS; su certificado lo firma una CA propia que no está en el
  // almacén del sistema, de ahí que no se verifique la cadena.
  ssl: { rejectUnauthorized: false },
});

/** SQL con marcadores `?` traducido a la numeración de PostgreSQL. */
export function traducirSql(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  let i = 0;
  const text = sql.replace(/\?/g, () => {
    const valor = params[i];
    i += 1;
    // `VALUES ?` / `IN (?)` en lote: un array de filas se expande a tantos
    // grupos como filas, y un array simple a una lista de marcadores.
    if (Array.isArray(valor)) {
      if (valor.length === 0) {
        // Una lista vacía sin marcadores dejaría `IN ()`, que no es SQL válido.
        // NULL nunca casa con nada, que es justo el resultado esperado.
        return 'NULL';
      }
      if (Array.isArray(valor[0])) {
        return (valor as unknown[][])
          .map((fila) => `(${fila.map((v) => `$${values.push(v)}`).join(', ')})`)
          .join(', ');
      }
      return valor.map((v) => `$${values.push(v)}`).join(', ');
    }
    return `$${values.push(valor)}`;
  });
  return { text, values };
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { text, values } = traducirSql(sql, params);
  const { rows } = await pool.query(text, values);
  return rows as T[];
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const filas = await query<T>(sql, params);
  return filas[0];
}

/** Lo que `mysql2` devolvía de un INSERT/UPDATE/DELETE. */
export interface ResultadoEscritura {
  insertId: number;
  affectedRows: number;
}

/**
 * INSERT, UPDATE o DELETE con el mismo resultado que daba `mysql2`.
 *
 * PostgreSQL no devuelve el id generado salvo que se lo pidas, así que a los
 * INSERT que no traen `RETURNING` se les añade. La clave no siempre se llama
 * `id` —`historial` usa `id_historial`—, y en ese caso PostgreSQL responde
 * "columna inexistente" (42703): se reintenta sin `RETURNING`, porque quien
 * inserta ahí no necesita el id.
 */
export async function queryResult(sql: string, params: unknown[] = []): Promise<ResultadoEscritura> {
  const { text, values } = traducirSql(sql, params);
  const esInsert = /^\s*insert\s/i.test(text);
  const pideId = /\breturning\b/i.test(text);

  const ejecutar = async (consulta: string) => {
    const r = await pool.query(consulta, values);
    return {
      insertId: Number((r.rows[0] as Record<string, unknown> | undefined)?.id ?? 0),
      affectedRows: r.rowCount ?? 0,
    };
  };

  if (esInsert && !pideId) {
    try {
      return await ejecutar(`${text} RETURNING id`);
    } catch (e) {
      if ((e as { code?: string }).code !== '42703') throw e;
      return await ejecutar(text);
    }
  }
  return ejecutar(text);
}

/**
 * Conexión transaccional con la forma que tenía la de `mysql2`.
 *
 * Los tres controladores que manejan transacciones (crear un FUID, marcar OK y
 * borrar una caja) las abren a mano con `getConnection` y leen el resultado
 * como la tupla `[filas]` que devolvía `mysql2`. Se conserva esa forma a
 * propósito: reescribir esos bloques no cambiaría lo que hacen y sí abriría la
 * puerta a equivocarse en el orden de un COMMIT o en un camino de error.
 *
 * La diferencia real, que aquí se replica, es que `mysql2` devuelve las filas
 * en una consulta de lectura y un resumen con `affectedRows` en una de
 * escritura.
 */
export interface ConexionCompat {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

export async function getConnection(): Promise<ConexionCompat> {
  const client = await pool.connect();
  let liberada = false;
  return {
    beginTransaction: async () => { await client.query('BEGIN'); },
    commit: async () => { await client.query('COMMIT'); },
    rollback: async () => { await client.query('ROLLBACK'); },
    release: () => { if (!liberada) { liberada = true; client.release(); } },
    async query<T>(sql: string, params: unknown[] = []): Promise<[T, unknown]> {
      const { text, values } = traducirSql(sql, params);
      const esLectura = /^\s*(select|with)\s/i.test(text);
      if (esLectura) {
        const r = await client.query(text, values);
        return [r.rows as T, undefined];
      }
      const esInsert = /^\s*insert\s/i.test(text);
      const pideId = /\breturning\b/i.test(text);
      const ejecutar = async (consulta: string) => {
        const r = await client.query(consulta, values);
        const resumen = {
          insertId: Number((r.rows[0] as Record<string, unknown> | undefined)?.id ?? 0),
          affectedRows: r.rowCount ?? 0,
        };
        return [resumen as T, undefined] as [T, unknown];
      };
      if (esInsert && !pideId) {
        try {
          return await ejecutar(`${text} RETURNING id`);
        } catch (e) {
          if ((e as { code?: string }).code !== '42703') throw e;
          return await ejecutar(text);
        }
      }
      return ejecutar(text);
    },
  };
}

/** Conexión dentro de una transacción, con la misma forma que usaban los controladores. */
export interface ConexionTransaccion {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryResult(sql: string, params?: unknown[]): Promise<ResultadoEscritura>;
}

/**
 * Ejecuta el bloque dentro de una transacción: confirma si termina y deshace si
 * lanza. Sustituye al `getConnection` + `beginTransaction` + `commit` /
 * `rollback` + `release` de `mysql2`, que era fácil de dejar a medias si un
 * camino de error se olvidaba de liberar la conexión.
 */
export async function withTransaction<T>(fn: (conn: ConexionTransaccion) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const conn: ConexionTransaccion = {
      async query<R>(sql: string, params: unknown[] = []): Promise<R[]> {
        const { text, values } = traducirSql(sql, params);
        const { rows } = await client.query(text, values);
        return rows as R[];
      },
      async queryResult(sql: string, params: unknown[] = []): Promise<ResultadoEscritura> {
        const { text, values } = traducirSql(sql, params);
        const esInsert = /^\s*insert\s/i.test(text);
        const pideId = /\breturning\b/i.test(text);
        const ejecutar = async (consulta: string) => {
          const r = await client.query(consulta, values);
          return {
            insertId: Number((r.rows[0] as Record<string, unknown> | undefined)?.id ?? 0),
            affectedRows: r.rowCount ?? 0,
          };
        };
        if (esInsert && !pideId) {
          try {
            return await ejecutar(`${text} RETURNING id`);
          } catch (e) {
            if ((e as { code?: string }).code !== '42703') throw e;
            return await ejecutar(text);
          }
        }
        return ejecutar(text);
      },
    };
    const resultado = await fn(conn);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
