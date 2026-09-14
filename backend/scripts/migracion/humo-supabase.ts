/**
 * Prueba de humo del port a PostgreSQL, contra la base real de Supabase.
 *
 *   npx tsx scripts/migracion/humo-supabase.ts
 *
 * Ejercita lo que las pruebas unitarias no pueden comprobar porque no tocan la
 * base: la traducción de `?` a `$1`, la expansión de `IN (?)` y de `VALUES ?`,
 * el `insertId` que PostgreSQL no devuelve solo, las transacciones y los dos
 * triggers de negocio (el asunto que se compone y el historial que se guarda).
 *
 * Inserta registros de prueba y los borra al terminar, incluso si algo falla.
 */
import { query, queryOne, queryResult, getConnection } from '../../src/config/db.js';

const MARCA = 'HUMO-MIGRACION';
let fallos = 0;

function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK ' : 'MAL'}  ${nombre}${detalle ? `  → ${detalle}` : ''}`);
}

async function limpiar(): Promise<void> {
  await query('DELETE FROM historial WHERE caja = ?', [MARCA]);
  await query('DELETE FROM fuiddatosreal WHERE caja = ?', [MARCA]);
  await query('DELETE FROM users WHERE nombre = ?', [MARCA]);
}

async function main(): Promise<void> {
  await limpiar();

  // 1. insertId: PostgreSQL no lo devuelve salvo que se pida RETURNING.
  const alta = await queryResult(
    'INSERT INTO users (cc, nombre, contrasena, rol, sede) VALUES (?, ?, ?, ?, ?)',
    ['999999999', MARCA, 'x', 'TECNICA', 'BARRANQUILLA'],
  );
  comprobar('insertId de un INSERT', alta.insertId > 0, `id ${alta.insertId}`);
  comprobar('affectedRows de un INSERT', alta.affectedRows === 1);

  // 2. IN (?) con un array: mysql2 lo expandía y la capa hace lo mismo.
  const encontrados = await query<{ id: number }>('SELECT id FROM users WHERE id IN (?)', [[alta.insertId, -1]]);
  comprobar('IN (?) con una lista', encontrados.length === 1);

  const vacio = await query<{ id: number }>('SELECT id FROM users WHERE id IN (?)', [[]]);
  comprobar('IN (?) con una lista vacía no rompe', vacio.length === 0);

  // 3. El trigger que compone el asunto.
  await query(
    `INSERT INTO fuiddatosreal (caja, upd, asunto_2, asunto_3, fecha_del_dato, elaborado_por)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [MARCA, 'UPD9999001', 'TUTELA', 'RESPUESTA A LA ACCION', '2025-03-10', MARCA],
  );
  const fuid = await queryOne<{ id: number; asunto: string; version: number }>(
    'SELECT id, asunto, version FROM fuiddatosreal WHERE upd = ?', ['UPD9999001'],
  );
  comprobar('el asunto se compone solo', fuid?.asunto === 'TUTELA RESPUESTA A LA ACCION', fuid?.asunto);
  comprobar('la versión arranca en 1', fuid?.version === 1);

  // 4. El trigger que guarda el historial al editar.
  const edicion = await queryResult(
    'UPDATE fuiddatosreal SET notas = ?, version = version + 1 WHERE id = ? AND version = ?',
    ['ALGO', fuid?.id, 1],
  );
  comprobar('affectedRows de un UPDATE', edicion.affectedRows === 1);
  const trasEditar = await query<{ tipo: string }>(
    'SELECT tipo_cambio AS tipo FROM historial WHERE caja = ?', [MARCA],
  );
  comprobar('la edición queda en el historial', trasEditar.some((h) => h.tipo === 'ACTUALIZADO'));

  // 5. Bloqueo optimista: con la versión vieja no debe tocar ninguna fila.
  const conVersionVieja = await queryResult(
    'UPDATE fuiddatosreal SET notas = ? WHERE id = ? AND version = ?', ['OTRA', fuid?.id, 1],
  );
  comprobar('el bloqueo optimista rechaza la versión vieja', conVersionVieja.affectedRows === 0);

  // 6. Transacción: lo que se deshace no queda.
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE fuiddatosreal SET notas = ? WHERE id = ?', ['DENTRO DE LA TRANSACCION', fuid?.id]);
    await conn.rollback();
  } finally {
    conn.release();
  }
  const trasRollback = await queryOne<{ notas: string }>('SELECT notas FROM fuiddatosreal WHERE id = ?', [fuid?.id]);
  comprobar('el rollback deshace el cambio', trasRollback?.notas === 'ALGO', trasRollback?.notas);

  // 7. El trigger que guarda el historial al borrar.
  await query('DELETE FROM fuiddatosreal WHERE id = ?', [fuid?.id]);
  const trasBorrar = await query<{ tipo: string }>(
    'SELECT tipo_cambio AS tipo FROM historial WHERE caja = ?', [MARCA],
  );
  comprobar('el borrado queda en el historial', trasBorrar.some((h) => h.tipo === 'ELIMINADO'));

  // 8. Una fecha vuelve como texto, no como Date desplazado por la zona horaria.
  const fecha = await queryOne<{ f: unknown }>('SELECT CAST(? AS date) AS f', ['2025-03-10']);
  comprobar('las fechas vuelven como texto', fecha?.f === '2025-03-10', String(fecha?.f));
}

main()
  .then(async () => {
    await limpiar();
    console.log(fallos === 0 ? '\nTodo correcto sobre Supabase' : `\n${fallos} comprobaciones fallidas`);
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error('ERROR:', e.message);
    await limpiar().catch(() => undefined);
    process.exit(1);
  });
