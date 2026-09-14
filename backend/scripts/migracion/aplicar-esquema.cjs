/**
 * Aplica database/supabase/01-esquema.sql en la base de Supabase.
 *
 *   node backend/scripts/migracion/aplicar-esquema.cjs
 *
 * Lee la conexión de PG_HOST, PG_PORT, PG_USER, PG_PASSWORD y PG_DATABASE (o
 * del .env del backend). El script de esquema es idempotente, así que se puede
 * repetir sin romper nada.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Sin argumento aplica el esquema; con uno, el archivo .sql que se le indique
// (por ejemplo 02-triggers.sql).
const ESQUEMA = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, '../../../database/supabase/01-esquema.sql');

(async () => {
  const sql = fs.readFileSync(ESQUEMA, 'utf8');
  const c = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT ?? 5432),
    database: process.env.PG_DATABASE ?? 'postgres',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await c.connect();
  try {
    await c.query(sql);
    const { rows } = await c.query(
      `SELECT table_name AS tabla FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY tabla`,
    );
    console.log(`esquema aplicado: ${rows.length} tablas en Supabase`);
    console.log(rows.map((r) => r.tabla).join(', '));
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
