import mysql from 'mysql2/promise';
import { DB_CONNECTION_LIMIT, DB_QUEUE_LIMIT } from './constants.js';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fuiddatosluci',
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: DB_QUEUE_LIMIT,
  dateStrings: true,
});

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const [rows] = await pool.query(sql, params);
  const arr = rows as T[];
  return arr[0];
}

export async function queryResult(sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.query<mysql.ResultSetHeader>(sql, params);
  return result;
}

export { pool };
