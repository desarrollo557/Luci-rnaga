/**
 * Evidencia de la API contra la base de datos.
 *
 *   API=http://localhost:3010 npx tsx scripts/pruebas/evidencia-api.ts
 *
 * Recorre la API llamando a cada endpoint y guarda, para cada llamada, la
 * petición, el código de respuesta, los registros que devuelve y —cuando la
 * llamada escribe— lo que la base contiene después, consultado directamente
 * con SQL. El resultado se vuelca en `evidencia-api.json`, que es lo que
 * imprime el informe.
 *
 * Las lecturas muestran los datos reales que hay en la base. Las escrituras
 * trabajan sobre una jerarquía propia —cliente, acta, caja y registro marcados
 * como EVIDENCIA-API— que se crea al empezar y se borra al terminar, aunque
 * algo falle: ningún dato real se modifica ni se elimina.
 *
 * Las contraseñas y sus hashes nunca se recogen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../../src/config/db.js';
import { RAIZ_BACKEND } from '../../src/services/plantillaFuid.service.js';

const API = process.env.API ?? 'http://localhost:3000';
const MARCA = 'EVIDENCIA-API';
const CAJA = '998C000001';
const UPD = 'UPD9980001';
const SALIDA = path.join(RAIZ_BACKEND, 'temp', 'evidencia-api.json');

/** Campos que no se recogen aunque la API los devuelva. */
const SENSIBLES = new Set(['contrasena', 'password', 'contrasena_actual', 'nueva_contrasena']);

interface Paso {
  modulo: string;
  titulo: string;
  metodo: string;
  ruta: string;
  cuerpo?: unknown;
  estado: number;
  /** Nº de registros devueltos, cuando la respuesta es una lista. */
  registros?: number;
  respuesta: unknown;
  /** Lo que dice la base después, consultado con SQL. */
  verificacion?: { descripcion: string; sql: string; filas: unknown[] };
  nota?: string;
}

const pasos: Paso[] = [];
let cookie = '';

/** Quita contraseñas y recorta lo que sea demasiado largo para el informe. */
function limpiar(valor: unknown, maxFilas = 3): unknown {
  if (Array.isArray(valor)) return valor.slice(0, maxFilas).map((v) => limpiar(v, maxFilas));
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (SENSIBLES.has(k)) continue;
      if (v === null || v === '') continue;
      salida[k] = typeof v === 'string' && v.length > 70 ? `${v.slice(0, 70)}…` : limpiar(v, maxFilas);
    }
    return salida;
  }
  return valor;
}

async function llamar(
  modulo: string,
  titulo: string,
  metodo: string,
  ruta: string,
  opciones: { cuerpo?: unknown; nota?: string; maxFilas?: number } = {},
): Promise<{ estado: number; datos: unknown }> {
  const res = await fetch(`${API}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];

  const texto = await res.text();
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
  }

  const lista = Array.isArray(datos)
    ? datos
    : Array.isArray((datos as { data?: unknown[] })?.data)
      ? (datos as { data: unknown[] }).data
      : null;

  pasos.push({
    modulo,
    titulo,
    metodo,
    ruta,
    cuerpo: opciones.cuerpo ? limpiar(opciones.cuerpo) : undefined,
    estado: res.status,
    registros: lista ? lista.length : undefined,
    respuesta: limpiar(lista ?? datos, opciones.maxFilas ?? 3),
    nota: opciones.nota,
  });
  console.log(`${String(res.status).padEnd(4)} ${metodo.padEnd(6)} ${ruta}`);
  return { estado: res.status, datos };
}

/** Consulta la base y adjunta el resultado al último paso registrado. */
async function verificar(descripcion: string, sql: string, params: unknown[] = []): Promise<void> {
  const filas = await query<Record<string, unknown>>(sql, params);
  const paso = pasos.at(-1);
  if (paso) paso.verificacion = { descripcion, sql: sql.replace(/\s+/g, ' ').trim(), filas: limpiar(filas, 3) as unknown[] };
  console.log(`       ↳ ${descripcion}: ${filas.length} fila(s)`);
}

async function limpiarDatos(): Promise<void> {
  await query('DELETE FROM historial WHERE caja = ?', [CAJA]);
  await query('DELETE FROM fuiddatosreal WHERE caja = ?', [CAJA]);
  await query('DELETE FROM modulos_caja WHERE caja_modulo = ?', [CAJA]);
  await query('DELETE FROM moduloscliente WHERE codigo = ?', ['998']);
  await query('DELETE FROM sub_modulos WHERE codigo = ?', ['998']);
}

async function main(): Promise<void> {
  console.log(`Evidencia de la API contra ${API}\n`);
  await limpiarDatos();

  try {
    // ── Sesión ──────────────────────────────────────────────────────────
    await llamar('Sesión', 'Inicio de sesión del perfil líder', 'POST', '/login', {
      cuerpo: { cc: '123456789', contrasena: '********' },
      nota: 'La contraseña real no se recoge. El servidor devuelve el perfil y abre la sesión.',
    });
    // La llamada anterior se registró con la contraseña enmascarada; se repite
    // con la real para obtener la cookie, sin registrar nada.
    const login = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cc: '123456789', contrasena: 'Lider-21D1AD' }),
    });
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    if (login.status !== 200) throw new Error(`No se pudo iniciar sesión: HTTP ${login.status}`);
    pasos.at(-1)!.estado = login.status;
    pasos.at(-1)!.respuesta = limpiar(await login.json());

    await llamar('Sesión', 'Usuario de la sesión abierta', 'GET', '/currentUser');

    // ── Consultas sobre los datos reales ────────────────────────────────
    const clientes = await llamar('Clientes', 'Clientes registrados', 'GET', '/sub_modulos', { maxFilas: 4 });
    await verificar(
      'La misma cuenta, consultada con SQL',
      'SELECT COUNT(*) AS clientes_en_la_base FROM sub_modulos',
    );

    // Se elige el cliente con más actas: uno sin actas dejaría la consulta
    // siguiente vacía y la evidencia no mostraría nada.
    const conActas = await query<{ id: number; codigo: string }>(
      `SELECT s.id, s.codigo FROM sub_modulos s
         JOIN moduloscliente m ON m.id_submodulo = s.id
        GROUP BY s.id, s.codigo ORDER BY COUNT(*) DESC LIMIT 1`,
    );
    const listaClientes = (Array.isArray(clientes.datos) ? clientes.datos : []) as Array<{ id: number; codigo: string }>;
    const cliente = conActas[0] ?? listaClientes[0];

    if (cliente) {
      await llamar('Actas', `Actas del cliente ${cliente.codigo}`, 'GET', `/moduloscliente?subModuloId=${cliente.id}`, { maxFilas: 3 });
      await verificar(
        'Actas de ese cliente, con su número de cajas',
        `SELECT m.id, m.codigo, m.acta_transferencia_modulo,
                (SELECT COUNT(*) FROM modulos_caja mc WHERE mc.id_modulo_caja = m.id) AS cajas
           FROM moduloscliente m WHERE m.id_submodulo = ? ORDER BY m.id LIMIT 3`,
        [cliente.id],
      );
    }

    const acta = await query<{ id: number; codigo: string }>(
      `SELECT m.id, m.codigo FROM moduloscliente m
        JOIN modulos_caja mc ON mc.id_modulo_caja = m.id GROUP BY m.id, m.codigo ORDER BY COUNT(*) DESC LIMIT 1`,
    );
    const actaId = acta[0]?.id;

    if (actaId) {
      await llamar('Cajas', `Cajas del acta ${actaId}`, 'GET', `/modulos_caja?id_modulo_caja=${actaId}`, { maxFilas: 3 });
      await verificar(
        'Las mismas cajas y cuántos registros FUID tiene cada una',
        `SELECT mc.caja_modulo, mc.estado_caja,
                (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS registros
           FROM modulos_caja mc WHERE mc.id_modulo_caja = ? ORDER BY mc.caja_modulo LIMIT 3`,
        [actaId],
      );
    }

    const cajaReal = await query<{ caja_modulo: string }>(
      'SELECT caja FROM fuiddatosreal GROUP BY caja ORDER BY COUNT(*) DESC LIMIT 1',
    ).then((r) => (r[0] as unknown as { caja: string })?.caja);

    if (cajaReal) {
      await llamar('Digitación', `Registros FUID de la caja ${cajaReal}`, 'GET', `/fuiddatosreal?caja=${cajaReal}`, { maxFilas: 3 });
      await verificar(
        'Los mismos registros, leídos de la tabla',
        `SELECT n_orden, upd, asunto, folios, elaborado_por, fecha_del_dato
           FROM fuiddatosreal WHERE caja = ? ORDER BY n_orden LIMIT 3`,
        [cajaReal],
      );
    }

    await llamar('Producción', 'Estadísticas de producción', 'GET', '/estadisticas', { maxFilas: 2 });
    await verificar(
      'Registros por persona, contados con SQL',
      `SELECT elaborado_por, COUNT(*) AS registros FROM fuiddatosreal
        WHERE elaborado_por IS NOT NULL GROUP BY elaborado_por ORDER BY 2 DESC LIMIT 3`,
    );

    await llamar('Historial', 'Movimientos registrados', 'GET', '/historial?limit=3', { maxFilas: 3 });
    await verificar(
      'Movimientos por tipo de cambio',
      'SELECT tipo_cambio, COUNT(*) AS movimientos FROM historial GROUP BY tipo_cambio ORDER BY 2 DESC',
    );

    await llamar('Inventario', 'Inventarios creados', 'GET', '/inventario', { maxFilas: 3 });
    await verificar('Inventarios en la tabla', 'SELECT COUNT(*) AS inventarios FROM inventario');

    // ── Escrituras sobre datos propios ──────────────────────────────────
    const nuevoCliente = await llamar('Clientes', 'Crear un cliente', 'POST', '/sub_modulos', {
      cuerpo: { codigo: '998', entidad_remitente: MARCA, sede_submodulos: 'BARRANQUILLA' },
      nota: 'A partir de aquí se trabaja sobre datos propios, que se eliminan al final.',
    });
    await verificar(
      'El cliente quedó guardado',
      'SELECT id, codigo, entidad_remitente FROM sub_modulos WHERE codigo = ?',
      ['998'],
    );

    const idCliente = (nuevoCliente.datos as { id?: number })?.id
      ?? (await query<{ id: number }>('SELECT id FROM sub_modulos WHERE codigo = ?', ['998']))[0]?.id;

    await llamar('Actas', 'Crear un acta para ese cliente', 'POST', '/moduloscliente', {
      cuerpo: {
        codigo: '998',
        id_submodulo: idCliente,
        acta_transferencia_modulo: '998-001',
        entidad_remitente: MARCA,
        fecha_trans_modulo: '2026-09-15',
      },
    });
    await verificar(
      'El acta quedó guardada y apunta a su cliente',
      `SELECT m.id, m.codigo, m.acta_transferencia_modulo, s.entidad_remitente AS cliente
         FROM moduloscliente m JOIN sub_modulos s ON s.id = m.id_submodulo WHERE m.codigo = ?`,
      ['998'],
    );

    const idActa = (await query<{ id: number }>('SELECT id FROM moduloscliente WHERE codigo = ?', ['998']))[0]?.id;

    await llamar('Cajas', 'Crear una caja', 'POST', '/modulos_caja/serie', {
      cuerpo: {
        id_modulo_caja: idActa,
        numero_inicial: '000001',
        numero_final: '000001',
        entidad_remitente_caja: MARCA,
        acta_trans_caja: '998-001',
        fecha_trans_caja: '2026-09-15',
        entidad_productora_caja: '',
        unidad_administrativa_caja: '',
        oficina_productora_caja: '',
        objeto_caja: 'TRANSFERENCIA PRIMARIA',
        estado_caja: 'EN PROCESO',
      },
      nota: 'Los tres campos descriptivos se envían vacíos a propósito: deben guardarse como N/A.',
    });
    await verificar(
      'La caja quedó guardada y los campos vacíos como N/A',
      `SELECT caja_modulo, objeto_caja, entidad_productora_caja, unidad_administrativa_caja,
              oficina_productora_caja, estado_caja, fecha_trans_caja
         FROM modulos_caja WHERE caja_modulo = ?`,
      [CAJA],
    );

    await llamar('Digitación', 'Crear un registro FUID', 'POST', '/fuiddatosreal', {
      cuerpo: {
        caja: CAJA,
        upd: UPD,
        n_orden: 1,
        asunto_2: 'ACTA DE COMITE',
        asunto_3: 'SEDE BARRANQUILLA',
        folios: '25',
        sede: 'BARRANQUILLA',
        fecha_del_dato: '2026-09-15',
        elaborado_por: `${MARCA} (123456789)`,
      },
      nota: 'El asunto no se envía: lo compone la base a partir de los dos que sí se envían.',
    });
    await verificar(
      'El registro quedó guardado y la base compuso el asunto',
      `SELECT id, caja, upd, n_orden, asunto_2, asunto_3, asunto, folios, version
         FROM fuiddatosreal WHERE upd = ?`,
      [UPD],
    );

    const idFuid = (await query<{ id: number }>('SELECT id FROM fuiddatosreal WHERE upd = ?', [UPD]))[0]?.id;

    await llamar('Digitación', 'Consultar el registro recién creado', 'GET', `/fuiddatosreal/${idFuid}`);

    await llamar('Digitación', 'Editar el registro', 'PUT', `/fuiddatosreal/${idFuid}`, {
      cuerpo: {
        caja: CAJA,
        upd: UPD,
        n_orden: 1,
        asunto_2: 'ACTA DE COMITE',
        asunto_3: 'SEDE BOGOTA',
        folios: '30',
        sede: 'BARRANQUILLA',
        fecha_del_dato: '2026-09-15',
        elaborado_por: `${MARCA} (123456789)`,
        version: 1,
      },
      nota: 'Cambian el asunto manual y los folios. La versión viaja para el bloqueo optimista.',
    });
    await verificar(
      'El cambio se guardó, el asunto se recompuso y la versión subió',
      'SELECT upd, asunto_3, asunto, folios, version FROM fuiddatosreal WHERE upd = ?',
      [UPD],
    );
    await verificar(
      'La edición dejó copia del valor anterior en el historial',
      `SELECT tipo_cambio, upd, asunto AS asunto_anterior, folios AS folios_anteriores, fecha_cambio
         FROM historial WHERE upd = ? ORDER BY fecha_cambio DESC LIMIT 2`,
      [UPD],
    );

    await llamar('Cajas', 'Editar la caja', 'PUT', `/modulos_caja/${(await query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = ?', [CAJA]))[0]?.id}`, {
      cuerpo: {
        caja_modulo: CAJA,
        entidad_remitente_caja: MARCA,
        acta_trans_caja: '998-001',
        fecha_trans_caja: '2026-09-15',
        entidad_productora_caja: 'ENTIDAD PRODUCTORA EDITADA',
        unidad_administrativa_caja: '',
        oficina_productora_caja: '',
        objeto_caja: 'VALORACION DOCUMENTAL',
        estado_caja: 'FINALIZADO',
      },
    });
    await verificar(
      'La caja quedó editada',
      'SELECT caja_modulo, entidad_productora_caja, objeto_caja, estado_caja FROM modulos_caja WHERE caja_modulo = ?',
      [CAJA],
    );

    await llamar('Digitación', 'Eliminar el registro FUID', 'DELETE', `/fuiddatosreal/${idFuid}`);
    await verificar(
      'El registro ya no está en la tabla',
      'SELECT id FROM fuiddatosreal WHERE upd = ?',
      [UPD],
    );
    await verificar(
      'Pero el borrado quedó registrado en el historial',
      'SELECT tipo_cambio, upd, asunto FROM historial WHERE upd = ? AND tipo_cambio = ?',
      [UPD, 'ELIMINADO'],
    );

    const idCaja = (await query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = ?', [CAJA]))[0]?.id;
    await llamar('Cajas', 'Eliminar la caja', 'DELETE', `/modulos_caja/${idCaja}`);
    await verificar('La caja ya no está', 'SELECT caja_modulo FROM modulos_caja WHERE caja_modulo = ?', [CAJA]);

    await llamar('Actas', 'Eliminar el acta', 'DELETE', `/moduloscliente/${idActa}`);
    await verificar('El acta ya no está', 'SELECT id FROM moduloscliente WHERE codigo = ?', ['998']);

    await llamar('Clientes', 'Eliminar el cliente', 'DELETE', `/sub_modulos/${idCliente}`);
    await verificar('El cliente ya no está', 'SELECT id FROM sub_modulos WHERE codigo = ?', ['998']);
  } finally {
    await limpiarDatos();
    const resto = await query('SELECT 1 FROM modulos_caja WHERE caja_modulo = ?', [CAJA]);
    pasos.push({
      modulo: 'Cierre',
      titulo: 'Comprobación final: no queda ningún dato de la demostración',
      metodo: 'SQL',
      ruta: '—',
      estado: 200,
      respuesta: { cajas_de_prueba_restantes: resto.length },
      verificacion: {
        descripcion: 'Contenido real de la base al terminar',
        sql: 'SELECT conteos de cada tabla',
        filas: await query(
          `SELECT (SELECT COUNT(*) FROM users) AS usuarios,
                  (SELECT COUNT(*) FROM sub_modulos) AS clientes,
                  (SELECT COUNT(*) FROM moduloscliente) AS actas,
                  (SELECT COUNT(*) FROM modulos_caja) AS cajas,
                  (SELECT COUNT(*) FROM fuiddatosreal) AS registros_fuid`,
        ),
      },
    });
  }

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), api: API, pasos }, null, 2), 'utf8');
  console.log(`\n${pasos.length} ejecuciones guardadas en ${SALIDA}`);
  process.exit(0);
}

await main();
