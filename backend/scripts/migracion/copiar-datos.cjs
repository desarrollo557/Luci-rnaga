/**
 * Copia los datos de la base MySQL a la de Supabase (PostgreSQL).
 *
 *   node backend/scripts/migracion/copiar-datos.cjs
 *
 * Origen: DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (MySQL).
 * Destino: PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE (Supabase).
 *
 * Se puede repetir: vacía las tablas del destino antes de copiar, dentro de una
 * transacción, de modo que un fallo a mitad no deja la base a medias. El orden
 * de la lista respeta las llaves foráneas, y al final se recolocan las
 * secuencias de identidad para que el siguiente INSERT no choque con un id ya
 * usado.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('pg');

/** Tablas en orden de dependencia: primero las que nadie referencia. */
const TABLAS = [
  'users',
  'sub_modulos',
  'moduloscliente',
  'modulos_caja',
  'fuiddatosreal',
  'historial',
  'inventario',
  'auditoria',
  'rangos_upd',
  'asignacion_tecnica',
  'asignacion_calidad',
  'modulo_tecnica',
  'modulo_calidad',
  'asignacion_caja_tecnica',
  'asignacion_caja_calidad',
];

const id = (n) => (/^[a-z_][a-z0-9_]*$/.test(n) ? n : `"${n}"`);

(async () => {
  const origen = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    dateStrings: true, // las fechas viajan como texto y PostgreSQL las interpreta igual
  });
  const destino = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT ?? 5432),
    database: process.env.PG_DATABASE ?? 'postgres',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await destino.connect();

  try {
    await destino.query('BEGIN');
    await destino.query(`TRUNCATE ${TABLAS.map(id).join(', ')} RESTART IDENTITY CASCADE`);

    const resumen = [];
    for (const tabla of TABLAS) {
      const [filas] = await origen.query(`SELECT * FROM \`${tabla}\``);
      if (filas.length === 0) { resumen.push(`${tabla}: 0`); continue; }

      const columnas = Object.keys(filas[0]);
      const listaCols = columnas.map(id).join(', ');
      for (const fila of filas) {
        const valores = columnas.map((c) => fila[c]);
        const marcas = valores.map((_, i) => `$${i + 1}`).join(', ');
        await destino.query(`INSERT INTO ${id(tabla)} (${listaCols}) VALUES (${marcas})`, valores);
      }
      resumen.push(`${tabla}: ${filas.length}`);
    }

    // Las filas se insertaron con su id original, así que la secuencia de
    // identidad sigue en 1 y el próximo INSERT chocaría con una clave existente.
    for (const tabla of TABLAS) {
      const { rows } = await destino.query(
        `SELECT column_name AS col FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND is_identity = 'YES'`, [tabla]);
      for (const { col } of rows) {
        await destino.query(
          `SELECT setval(pg_get_serial_sequence($1, $2),
                         GREATEST((SELECT COALESCE(MAX(${id(col)}), 0) FROM ${id(tabla)}), 1))`,
          [tabla, col]);
      }
    }

    await destino.query('COMMIT');
    console.log('datos copiados:\n  ' + resumen.join('\n  '));
  } catch (e) {
    await destino.query('ROLLBACK');
    throw e;
  } finally {
    await origen.end();
    await destino.end();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
