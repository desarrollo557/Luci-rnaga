/**
 * Pruebas contra la base de datos.
 *
 *   npx tsx scripts/pruebas/base-de-datos.ts
 *
 * Comprueba lo que solo la base puede responder y ninguna prueba unitaria
 * alcanza: que el esquema tenga las tablas y columnas que el código da por
 * supuestas, que las restricciones rechacen de verdad lo que no debe entrar,
 * que los triggers de negocio hagan su trabajo, y que los datos que hay ahora
 * mismo sean coherentes entre sí.
 *
 * Los tres primeros bloques insertan sus propios registros, marcados con
 * `PRUEBA-BD`, y los borran al terminar aunque algo falle. El cuarto bloque no
 * escribe nada: solo lee para informar del estado de los datos reales.
 *
 * La capa del driver —la traducción de `?` a `$1`, el insertId, las
 * transacciones— se prueba aparte, en `scripts/migracion/humo-supabase.ts`.
 */
import { query, queryOne, queryResult, withTransaction } from '../../src/config/db.js';

const MARCA = 'PRUEBA-BD';
const CAJA_PRUEBA = '999C999001';
/** Todas las cajas que la suite llega a crear o intentar crear. */
const CAJAS_PRUEBA = ['999C999001', '999C999997', '999C999998'];
const UPD_PRUEBA = 'UPD9999001';

let fallos = 0;
let total = 0;
const avisos: string[] = [];

function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  total += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK ' : 'MAL'}  ${nombre}${detalle ? `  → ${detalle}` : ''}`);
}

function seccion(titulo: string): void {
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 56 - titulo.length))}`);
}

/** Ejecuta algo que debe fallar y devuelve el código SQLSTATE del error. */
async function codigoDeError(accion: () => Promise<unknown>): Promise<string> {
  try {
    await accion();
    return 'SIN ERROR';
  } catch (error) {
    return (error as { code?: string }).code ?? 'DESCONOCIDO';
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 1. Estructura: lo que el código da por supuesto
// ═════════════════════════════════════════════════════════════════════════

/** Tablas que el software consulta por su nombre. */
const TABLAS = [
  'users', 'sub_modulos', 'moduloscliente', 'modulos_caja', 'fuiddatosreal',
  'historial', 'inventario', 'auditoria', 'rangos_upd', 'session',
  'asignacion_caja_tecnica', 'asignacion_caja_calidad',
];

/** Columnas de las que depende directamente el código, por tabla. */
const COLUMNAS: Record<string, string[]> = {
  users: ['id', 'cc', 'nombre', 'contrasena', 'rol', 'sede'],
  sub_modulos: ['id', 'codigo', 'entidad_remitente'],
  moduloscliente: ['id', 'codigo', 'id_submodulo', 'acta_transferencia_modulo'],
  modulos_caja: [
    'id', 'caja_modulo', 'entidad_remitente_caja', 'acta_trans_caja', 'fecha_trans_caja',
    'id_modulo_caja', 'entidad_productora_caja', 'unidad_administrativa_caja',
    'oficina_productora_caja', 'objeto_caja', 'estado_caja',
  ],
  fuiddatosreal: [
    'id', 'caja', 'upd', 'n_orden', 'asunto', 'asunto_2', 'asunto_3', 'version',
    'elaborado_por', 'fecha_del_dato', 'sede', 'historial_y_cambios',
  ],
  historial: ['id_dato', 'tipo_cambio', 'fecha_cambio', 'sede', 'tiempo', 'historial_cambios'],
};

/** Columnas NOT NULL que el código debe respetar al insertar. */
const OBLIGATORIAS: Array<[string, string]> = [
  ['modulos_caja', 'caja_modulo'],
  ['modulos_caja', 'entidad_remitente_caja'],
  ['modulos_caja', 'acta_trans_caja'],
  ['modulos_caja', 'fecha_trans_caja'],
];

async function probarEstructura(): Promise<void> {
  seccion('1. Estructura del esquema');

  const tablas = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const existentes = new Set(tablas.map((t) => t.table_name));
  const faltan = TABLAS.filter((t) => !existentes.has(t));
  comprobar('están las tablas que el software consulta', faltan.length === 0, faltan.join(', '));

  for (const [tabla, columnas] of Object.entries(COLUMNAS)) {
    const filas = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ?`,
      [tabla],
    );
    const hay = new Set(filas.map((f) => f.column_name));
    const ausentes = columnas.filter((c) => !hay.has(c));
    comprobar(`${tabla}: sus columnas`, ausentes.length === 0, ausentes.join(', ') || `${columnas.length} columnas`);
  }

  for (const [tabla, columna] of OBLIGATORIAS) {
    const fila = await queryOne<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
      [tabla, columna],
    );
    comprobar(`${tabla}.${columna} es obligatoria`, fila?.is_nullable === 'NO', fila?.is_nullable);
  }

  // El bloqueo optimista depende de que `version` tenga valor por defecto.
  const version = await queryOne<{ column_default: string | null }>(
    `SELECT column_default FROM information_schema.columns
      WHERE table_name = 'fuiddatosreal' AND column_name = 'version'`,
  );
  comprobar('fuiddatosreal.version arranca con un valor', version?.column_default != null, String(version?.column_default));
}

// ═════════════════════════════════════════════════════════════════════════
// 2. Restricciones: que rechacen de verdad
// ═════════════════════════════════════════════════════════════════════════

async function probarRestricciones(acta: number): Promise<void> {
  seccion('2. Restricciones de integridad');

  // Unicidad del número de caja: los FUID referencian la caja por ese código,
  // así que dos cajas con el mismo número mezclarían registros de ambas.
  const duplicaCaja = await codigoDeError(() =>
    query(
      `INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja,
         fecha_trans_caja, id_modulo_caja, estado_caja)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [CAJA_PRUEBA, MARCA, MARCA, '2025-03-10', acta, 'EN PROCESO'],
    ),
  );
  comprobar('el número de caja no se puede repetir', duplicaCaja === '23505', duplicaCaja);

  // Unicidad del UPD: identifica la unidad documental en toda la base.
  const duplicaUpd = await codigoDeError(() =>
    query('INSERT INTO fuiddatosreal (caja, upd, asunto_2) VALUES (?, ?, ?)', [
      CAJA_PRUEBA,
      UPD_PRUEBA,
      MARCA,
    ]),
  );
  comprobar('el UPD no se puede repetir', duplicaUpd === '23505', duplicaUpd);

  // Clave foránea: una caja no puede colgar de un acta que no existe.
  const actaInexistente = await codigoDeError(() =>
    query(
      `INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja,
         fecha_trans_caja, id_modulo_caja, estado_caja)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['999C999998', MARCA, MARCA, '2025-03-10', 99999999, 'EN PROCESO'],
    ),
  );
  comprobar('una caja no puede colgar de un acta inexistente', actaInexistente === '23503', actaInexistente);

  // NOT NULL de la fecha de transferencia: el formulario la exige por esto.
  const sinFecha = await codigoDeError(() =>
    query(
      `INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja,
         fecha_trans_caja, id_modulo_caja, estado_caja)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['999C999997', MARCA, MARCA, null, acta, 'EN PROCESO'],
    ),
  );
  comprobar('la fecha de transferencia no admite nulo', sinFecha === '23502', sinFecha);
}

// ═════════════════════════════════════════════════════════════════════════
// 3. Triggers de negocio
// ═════════════════════════════════════════════════════════════════════════

async function probarTriggers(idFuid: number): Promise<void> {
  seccion('3. Triggers de negocio');

  // El asunto se compone de los dos que se digitan.
  const compuesto = await queryOne<{ asunto: string; version: number }>(
    'SELECT asunto, version FROM fuiddatosreal WHERE id = ?',
    [idFuid],
  );
  comprobar(
    'el asunto se compone al insertar',
    compuesto?.asunto === 'ACTA DE COMITE SEDE BARRANQUILLA',
    compuesto?.asunto,
  );
  comprobar('la versión arranca en 1', compuesto?.version === 1, String(compuesto?.version));

  // Con un solo asunto no queda un espacio suelto delante ni detrás.
  await query('UPDATE fuiddatosreal SET asunto_3 = ? WHERE id = ?', ['', idFuid]);
  const soloUno = await queryOne<{ asunto: string }>('SELECT asunto FROM fuiddatosreal WHERE id = ?', [idFuid]);
  comprobar(
    'con un solo asunto no sobra el separador',
    soloUno?.asunto === 'ACTA DE COMITE',
    JSON.stringify(soloUno?.asunto),
  );

  // Cada edición deja copia de cómo estaba antes.
  await query('UPDATE fuiddatosreal SET notas = ? WHERE id = ?', ['NOTA NUEVA', idFuid]);
  const copias = await query<{ tipo_cambio: string; sede: string | null; notas: string | null }>(
    'SELECT tipo_cambio, sede, notas FROM historial WHERE id_dato = ? ORDER BY fecha_cambio',
    [idFuid],
  );
  comprobar('la edición queda en el historial', copias.some((c) => c.tipo_cambio === 'ACTUALIZADO'), `${copias.length} copias`);

  // El trigger copia TODAS las columnas: si se dejara alguna fuera, el módulo
  // de Historial mostraría un cambio inventado en cada movimiento.
  const conSede = copias.filter((c) => c.sede === 'BARRANQUILLA');
  comprobar('el historial conserva la sede', conSede.length === copias.length, `${conSede.length}/${copias.length}`);

  // Y guarda el valor anterior, no el nuevo.
  const ultima = copias.at(-1);
  comprobar(
    'el historial guarda el valor de antes del cambio',
    ultima?.notas !== 'NOTA NUEVA',
    `notas en la copia: ${JSON.stringify(ultima?.notas)}`,
  );

  // El borrado también deja rastro.
  await query('DELETE FROM fuiddatosreal WHERE id = ?', [idFuid]);
  const trasBorrar = await query<{ tipo_cambio: string }>(
    'SELECT tipo_cambio FROM historial WHERE id_dato = ?',
    [idFuid],
  );
  comprobar('el borrado queda en el historial', trasBorrar.some((h) => h.tipo_cambio === 'ELIMINADO'));
}

// ═════════════════════════════════════════════════════════════════════════
// 4. Salud de los datos que hay ahora (solo lectura)
// ═════════════════════════════════════════════════════════════════════════

async function revisarDatos(): Promise<void> {
  seccion('4. Coherencia de los datos actuales');

  const huerfanos = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM fuiddatosreal f
      WHERE f.caja IS NOT NULL AND f.caja <> ''
        AND NOT EXISTS (SELECT 1 FROM modulos_caja mc WHERE mc.caja_modulo = f.caja)`,
  );
  comprobar('ningún registro FUID apunta a una caja que no existe', Number(huerfanos?.n) === 0, `${huerfanos?.n} huérfanos`);

  const cajasSinActa = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM modulos_caja mc
      WHERE NOT EXISTS (SELECT 1 FROM moduloscliente m WHERE m.id = mc.id_modulo_caja)`,
  );
  comprobar('ninguna caja cuelga de un acta que no existe', Number(cajasSinActa?.n) === 0, `${cajasSinActa?.n}`);

  const actasSinCliente = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM moduloscliente m
      WHERE NOT EXISTS (SELECT 1 FROM sub_modulos s WHERE s.id = m.id_submodulo)`,
  );
  comprobar('ninguna acta cuelga de un cliente que no existe', Number(actasSinCliente?.n) === 0, `${actasSinCliente?.n}`);

  const updMalFormado = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM fuiddatosreal
      WHERE upd IS NOT NULL AND upd <> '' AND upd !~ '^UPD[0-9]{7}$'`,
  );
  comprobar('todos los UPD tienen el formato UPDXXXXXXX', Number(updMalFormado?.n) === 0, `${updMalFormado?.n} fuera de formato`);

  const cajaMalFormada = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM modulos_caja WHERE caja_modulo !~ '^[0-9]{3}C[0-9]{6}$'`,
  );
  comprobar('todos los números de caja tienen el formato 000C000000', Number(cajaMalFormada?.n) === 0, `${cajaMalFormada?.n}`);

  const rolInvalido = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM users WHERE rol NOT IN ('ADMIN','LIDER','TECNICA','CALIDAD')`,
  );
  comprobar('todos los usuarios tienen un perfil de la lista', Number(rolInvalido?.n) === 0, `${rolInvalido?.n}`);

  const sinHash = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM users WHERE contrasena IS NULL OR contrasena NOT LIKE '$2%'`,
  );
  comprobar('ninguna contraseña está guardada en claro', Number(sinHash?.n) === 0, `${sinHash?.n} sin cifrar`);

  // `cc` no tiene índice único, pero el inicio de sesión busca por cédula: dos
  // cuentas con la misma dejarían el acceso a merced del orden de las filas.
  const cedulasRepetidas = await query<{ cc: string; n: string }>(
    'SELECT cc, COUNT(*) AS n FROM users GROUP BY cc HAVING COUNT(*) > 1',
  );
  comprobar('no hay dos usuarios con la misma cédula', cedulasRepetidas.length === 0,
    cedulasRepetidas.map((c) => `${c.cc}×${c.n}`).join(', '));
  if (cedulasRepetidas.length === 0) {
    avisos.push(
      'users.cc no tiene índice único, aunque el inicio de sesión busca por cédula. ' +
      'Hoy no hay duplicados, pero nada impide crearlos.',
    );
  }

  const codigosRepetidos = await query<{ codigo: string; n: string }>(
    'SELECT codigo, COUNT(*) AS n FROM sub_modulos GROUP BY codigo HAVING COUNT(*) > 1',
  );
  comprobar('no hay dos clientes con el mismo código', codigosRepetidos.length === 0,
    codigosRepetidos.map((c) => `${c.codigo}×${c.n}`).join(', '));

  const conteos = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS usuarios,
       (SELECT COUNT(*) FROM sub_modulos) AS clientes,
       (SELECT COUNT(*) FROM moduloscliente) AS actas,
       (SELECT COUNT(*) FROM modulos_caja) AS cajas,
       (SELECT COUNT(*) FROM fuiddatosreal) AS registros,
       (SELECT COUNT(*) FROM historial) AS historial`,
  );
  console.log(
    `\n     Contenido actual: ${conteos?.usuarios} usuarios · ${conteos?.clientes} clientes · ` +
    `${conteos?.actas} actas · ${conteos?.cajas} cajas · ${conteos?.registros} registros FUID · ` +
    `${conteos?.historial} movimientos de historial`,
  );
}

// ═════════════════════════════════════════════════════════════════════════

async function limpiar(): Promise<void> {
  await query('DELETE FROM historial WHERE caja = ?', [CAJA_PRUEBA]);
  await query('DELETE FROM fuiddatosreal WHERE caja = ?', [CAJA_PRUEBA]);
  await query('DELETE FROM modulos_caja WHERE caja_modulo IN (?)', [CAJAS_PRUEBA]);
  await query('DELETE FROM moduloscliente WHERE codigo = ?', [MARCA]);
  await query('DELETE FROM sub_modulos WHERE codigo = ?', [MARCA]);
}

async function main(): Promise<void> {
  console.log('Pruebas contra la base de datos\n');
  await limpiar();

  try {
    await probarEstructura();

    // Jerarquía mínima de prueba: cliente → acta → caja → registro.
    const cliente = await queryResult(
      'INSERT INTO sub_modulos (codigo, entidad_remitente) VALUES (?, ?)',
      [MARCA, MARCA],
    );
    const acta = await queryResult(
      'INSERT INTO moduloscliente (codigo, id_submodulo, acta_transferencia_modulo) VALUES (?, ?, ?)',
      [MARCA, cliente.insertId, MARCA],
    );
    await query(
      `INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja,
         fecha_trans_caja, id_modulo_caja, estado_caja)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [CAJA_PRUEBA, MARCA, MARCA, '2025-03-10', acta.insertId, 'EN PROCESO'],
    );
    const fuid = await queryResult(
      `INSERT INTO fuiddatosreal (caja, upd, asunto_2, asunto_3, sede, notas, fecha_del_dato)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [CAJA_PRUEBA, UPD_PRUEBA, 'ACTA DE COMITE', 'SEDE BARRANQUILLA', 'BARRANQUILLA', 'NOTA ORIGINAL', '2026-09-15'],
    );

    await probarRestricciones(acta.insertId);
    await probarTriggers(fuid.insertId);

    // La transacción deshace lo que no se confirma.
    seccion('3b. Transacciones');
    try {
      await withTransaction(async (conn) => {
        await conn.query('UPDATE modulos_caja SET objeto_caja = ? WHERE caja_modulo = ?', ['CAMBIADO', CAJA_PRUEBA]);
        throw new Error('fallo a propósito');
      });
    } catch {
      // Se esperaba.
    }
    const trasRollback = await queryOne<{ objeto_caja: string | null }>(
      'SELECT objeto_caja FROM modulos_caja WHERE caja_modulo = ?',
      [CAJA_PRUEBA],
    );
    comprobar('un fallo a mitad deshace el cambio', trasRollback?.objeto_caja !== 'CAMBIADO', String(trasRollback?.objeto_caja));

    await revisarDatos();
  } finally {
    await limpiar();
    const resto = await query('SELECT 1 FROM modulos_caja WHERE caja_modulo IN (?)', [CAJAS_PRUEBA]);
    comprobar('no queda ningún dato de prueba en la base', resto.length === 0);
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`${total} comprobaciones`);
  for (const aviso of avisos) console.log(`AVISO  ${aviso}`);
  console.log(fallos === 0 ? 'La base responde como el software espera.' : `${fallos} fallaron`);
  process.exit(fallos === 0 ? 0 : 1);
}

await main();
