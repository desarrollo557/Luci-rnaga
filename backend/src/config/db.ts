import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fuiddatosluci',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

/** Ejecuta una consulta y devuelve las filas tipadas. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** Devuelve la primera fila o undefined. */
export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const [rows] = await pool.query(sql, params);
  const arr = rows as T[];
  return arr[0];
}

/** Ejecuta una consulta que devuelve un ResultSetHeader (INSERT/UPDATE/DELETE). */
export async function queryResult(sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.query<mysql.ResultSetHeader>(sql, params);
  return result;
}

export { pool };
