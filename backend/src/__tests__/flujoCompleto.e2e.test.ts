import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';
import { fechaLocal } from '../utils/format.js';

/**
 * El flujo completo de una jornada, y sobre todo lo que **no** debe pasar.
 *
 * La otra prueba de extremo a extremo comprueba que el seguimiento de
 * inventario sale bien. Esta comprueba lo contrario: que el software no deja
 * escribir nada de más. Nace de una sospecha concreta —"está creando
 * registros duplicados"— y de dos fallos reales encontrados el mismo día: una
 * caja que se creaba por duplicado desde el formulario y registros guardados
 * con el identificador de la ruta en lugar del número de caja.
 *
 * Recorre el camino entero con la aplicación Express tal como se despliega:
 * el líder crea un cliente, un acta y sus cajas, asigna a la técnica, y la
 * técnica digita. Después de cada paso se cuenta lo que hay en la base, que
 * es la única forma de saber si se escribió de más.
 *
 * Lo único sustituido es el motor de la base, y por otro PostgreSQL de verdad.
 */

vi.mock('pg', () => moduloPgFalso());

const CLIENTE = { codigo: '088', entidad: 'HOSPITAL DE PRUEBA E2E' };
const ACTA = 'ACTA-FLUJO-001';
const caja = (n: number) => CLIENTE.codigo + 'C' + String(n).padStart(6, '0');
const LIDER = { cc: '8800001', nombre: 'LIDER FLUJO', contrasena: 'Clave.Lider1' };
const TECNICA = { cc: '8800002', nombre: 'TECNICA FLUJO', contrasena: 'Clave.Tecnica1' };
const OTRA_TECNICA = { cc: '8800003', nombre: 'OTRA TECNICA', contrasena: 'Clave.Otra1' };
const DIA = '2026-09-18';

let servidor: Server;
let raiz: string;

/** Cliente HTTP con cookies: una sesión por persona, como en un navegador. */
function sesion() {
  let cookie = '';
  return async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) cabeceras.Cookie = cookie;
    const respuesta = await fetch(raiz + ruta, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const recibidas = respuesta.headers.getSetCookie?.() ?? [];
    if (recibidas.length > 0) cookie = recibidas.map((c) => c.split(';')[0]).join('; ');
    return respuesta;
  };
}

/** Pide y exige que salga bien; si no, el error dice qué respondió el servidor. */
async function json<T>(
  pedir: ReturnType<typeof sesion>,
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
): Promise<T> {
  const respuesta = await pedir(metodo, ruta, cuerpo);
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(`${metodo} ${ruta} respondió ${respuesta.status}: ${texto.slice(0, 400)}`);
  }
  try {
    return (texto ? JSON.parse(texto) : undefined) as T;
  } catch {
    return texto as T;
  }
}

/** Cuenta filas. Es la forma de saber si algo se escribió dos veces. */
async function contar(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await baseViva().query<{ n: number }>(sql, params as never[]);
  return Number((rows[0] as { n: number | string }).n);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'secreto-de-prueba-suficientemente-largo-1234567890';
  process.env.PG_HOST ??= 'memoria';
  process.env.PG_USER ??= 'prueba';
  process.env.PG_PASSWORD ??= 'prueba';

  await reiniciarBase();
  const personas: [typeof LIDER, string][] = [
    [LIDER, 'LIDER'],
    [TECNICA, 'TECNICA'],
    [OTRA_TECNICA, 'TECNICA'],
  ];
  for (const [persona, rol] of personas) {
    await baseViva().query(
      'INSERT INTO users (nombre, cc, contrasena, rol, sede) VALUES ($1, $2, $3, $4, $5)',
      [persona.nombre, persona.cc, await bcrypt.hash(persona.contrasena, 10), rol, 'BARRANQUILLA'],
    );
  }

  const { app } = await import('../app.js');
  servidor = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  const direccion = servidor.address();
  const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
  raiz = `http://127.0.0.1:${puerto}/api`;
}, 120_000);

afterAll(async () => {
  await new Promise((fin) => servidor?.close(() => fin(undefined)));
});

describe('flujo completo: nada se escribe dos veces ni fuera de sitio', () => {
  it('recorre cliente → acta → cajas → digitación sin duplicar nada', async () => {
    const lider = sesion();
    await json(lider, 'POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });

    // ── 1. El cliente ────────────────────────────────────────────────────
    await json(lider, 'POST', '/sub_modulos', {
      codigo: CLIENTE.codigo,
      entidad_remitente: CLIENTE.entidad,
      sede_submodulos: 'BARRANQUILLA',
    });
    expect(await contar('SELECT COUNT(*) AS n FROM sub_modulos WHERE codigo = $1', [CLIENTE.codigo]))
      .toBe(1);

    // El mismo código otra vez no puede crear un segundo cliente.
    const repetido = await lider('POST', '/sub_modulos', {
      codigo: CLIENTE.codigo,
      entidad_remitente: 'OTRO NOMBRE',
      sede_submodulos: 'BARRANQUILLA',
    });
    expect(repetido.ok, 'un código de cliente repetido no puede aceptarse').toBe(false);
    expect(await contar('SELECT COUNT(*) AS n FROM sub_modulos WHERE codigo = $1', [CLIENTE.codigo]))
      .toBe(1);

    const clientes = await json<{ id: number; codigo: string }[]>(lider, 'GET', '/sub_modulos');
    const cliente = clientes.find((c) => c.codigo === CLIENTE.codigo)!;

    // ── 2. El acta ───────────────────────────────────────────────────────
    await json(lider, 'POST', '/moduloscliente', {
      codigo: CLIENTE.codigo,
      entidad_remitente: CLIENTE.entidad,
      acta_transferencia_modulo: ACTA,
      fecha_trans_modulo: '2026-09-01',
      id_submodulo: cliente.id,
    });
    const actas = await json<{ id: number; acta_transferencia_modulo: string }[]>(
      lider,
      'GET',
      '/moduloscliente',
    );
    const acta = actas.find((a) => a.acta_transferencia_modulo === ACTA)!;
    expect(acta, 'el acta quedó creada').toBeTruthy();

    const tecnicas = await json<{ id: number; cc: string }[]>(lider, 'GET', '/usuarios/TECNICA');
    const tecnica = tecnicas.find((u) => u.cc === TECNICA.cc)!;

    // ── 3. Las cajas ─────────────────────────────────────────────────────
    const datosDeCaja = {
      id_modulo_caja: acta.id,
      entidad_remitente_caja: CLIENTE.entidad,
      acta_trans_caja: ACTA,
      fecha_trans_caja: '2026-09-01',
      entidad_productora_caja: CLIENTE.entidad,
      unidad_administrativa_caja: 'SECRETARIA GENERAL',
      oficina_productora_caja: 'ARCHIVO CENTRAL',
      objeto_caja: 'TRANSFERENCIA PRIMARIA',
      estado_caja: 'EN PROCESO',
      usuarios_tecnica: [tecnica.id],
    };

    /*
     * Una caja es una caja. Es el fallo que se encontró en el formulario: pedía
     * un rango con inicial y final, y quien quería una sola acababa creando dos
     * con números consecutivos. Aquí se comprueba el contrato del servidor:
     * inicial igual a final crea exactamente una.
     */
    await json(lider, 'POST', '/modulos_caja/serie', {
      ...datosDeCaja,
      numero_inicial: '000001',
      numero_final: '000001',
    });
    expect(
      await contar('SELECT COUNT(*) AS n FROM modulos_caja WHERE id_modulo_caja = $1', [acta.id]),
      'inicial = final tiene que crear una sola caja',
    ).toBe(1);

    // Una serie de tres crea tres, ni dos ni cuatro.
    await json(lider, 'POST', '/modulos_caja/serie', {
      ...datosDeCaja,
      numero_inicial: '000002',
      numero_final: '000004',
    });
    expect(
      await contar('SELECT COUNT(*) AS n FROM modulos_caja WHERE id_modulo_caja = $1', [acta.id]),
      'tres más, cuatro en total',
    ).toBe(4);

    // Un número que ya existe se rechaza entero, sin crear la parte libre.
    const solapada = await lider('POST', '/modulos_caja/serie', {
      ...datosDeCaja,
      numero_inicial: '000004',
      numero_final: '000006',
    });
    expect(solapada.status, 'un rango que pisa una caja existente se rechaza').toBe(409);
    expect(
      await contar('SELECT COUNT(*) AS n FROM modulos_caja WHERE id_modulo_caja = $1', [acta.id]),
      'y no deja creada ninguna del rango',
    ).toBe(4);

    // Ningún número de caja repetido en toda la base.
    expect(
      await contar(
        `SELECT COUNT(*) AS n FROM (
           SELECT caja_modulo FROM modulos_caja GROUP BY caja_modulo HAVING COUNT(*) > 1
         ) d`,
      ),
      'no puede haber dos cajas con el mismo número',
    ).toBe(0);

    // ── 4. La técnica digita ─────────────────────────────────────────────
    const tec = sesion();
    await json(tec, 'POST', '/login', { cc: TECNICA.cc, contrasena: TECNICA.contrasena });

    const registro = (upd: string, orden: number, asunto: string) => ({
      caja: caja(1),
      upd,
      n_orden: orden,
      fecha_del_dato: DIA,
      asunto_2: 'HISTORIA CLINICA',
      asunto_3: asunto,
      elaborado_por: `${TECNICA.nombre} (${TECNICA.cc})`,
      sede: 'BARRANQUILLA',
      nro_acta_transferible: ACTA,
    });

    for (let i = 1; i <= 5; i++) {
      await json(tec, 'POST', '/fuiddatosreal', registro(`UPD880000${i}`, i, `PACIENTE ${i}`));
    }
    expect(
      await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = $1', [caja(1)]),
      'cinco guardados, cinco en la base',
    ).toBe(5);

    // ── 5. Lo que NO debe poder escribirse ───────────────────────────────

    // El mismo UPD otra vez: la restricción UNIQUE es el cierre de seguridad.
    const updRepetido = await tec('POST', '/fuiddatosreal', registro('UPD8800001', 6, 'PACIENTE 1'));
    expect(updRepetido.status, 'un UPD ya usado no puede volver a guardarse').toBe(409);
    expect(await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = $1', [caja(1)])).toBe(5);

    /*
     * Una caja que no existe. Es el fallo que dejó cinco registros con el
     * identificador de la ruta como número de caja: a las técnicas les salía
     * como un problema de permisos y a los líderes se les guardaba.
     */
    const cajaInventada = await tec('POST', '/fuiddatosreal', {
      ...registro('UPD8800099', 7, 'PACIENTE X'),
      caja: '114',
    });
    expect(cajaInventada.status, 'una caja que no existe no se acepta').toBe(400);

    const cajaInventadaLider = await lider('POST', '/fuiddatosreal', {
      ...registro('UPD8800098', 8, 'PACIENTE Y'),
      caja: '114',
    });
    expect(
      cajaInventadaLider.status,
      'tampoco al líder, que no pasa por la comprobación de asignación',
    ).toBe(400);
    expect(
      await contar("SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = '114'"),
      'no puede quedar ningún registro con una caja inexistente',
    ).toBe(0);

    // Una caja real que no es suya.
    const otra = sesion();
    await json(otra, 'POST', '/login', { cc: OTRA_TECNICA.cc, contrasena: OTRA_TECNICA.contrasena });
    const ajena = await otra('POST', '/fuiddatosreal', registro('UPD8800097', 9, 'PACIENTE Z'));
    expect(ajena.status, 'una técnica no digita en una caja que no le asignaron').toBe(403);
    expect(await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = $1', [caja(1)])).toBe(5);

    // ── 6. El consecutivo no repite ──────────────────────────────────────
    const siguiente = await json<{ upd: string | null }>(
      tec,
      'GET',
      `/modulos_caja/next-upd/${caja(1)}`,
    );
    expect(siguiente.upd, 'el siguiente UPD va después del último usado').toBe('UPD8800006');

    await json(tec, 'POST', '/fuiddatosreal', registro(siguiente.upd!, 6, 'PACIENTE 6'));
    expect(await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = $1', [caja(1)])).toBe(6);

    // ── 7. El recuento final, que es lo que se pidió comprobar ───────────
    expect(
      await contar(
        `SELECT COUNT(*) AS n FROM (
           SELECT upd FROM fuiddatosreal WHERE upd IS NOT NULL AND upd <> ''
            GROUP BY upd HAVING COUNT(*) > 1
         ) d`,
      ),
      'ningún UPD repetido en toda la base',
    ).toBe(0);

    expect(
      await contar(
        `SELECT COUNT(*) AS n FROM (
           SELECT caja, n_orden FROM fuiddatosreal
            WHERE caja IS NOT NULL AND n_orden IS NOT NULL
            GROUP BY caja, n_orden HAVING COUNT(*) > 1
         ) d`,
      ),
      'ningún número de orden repetido dentro de una caja',
    ).toBe(0);

    expect(
      await contar(
        `SELECT COUNT(*) AS n FROM fuiddatosreal f
          WHERE f.caja IS NOT NULL AND f.caja <> ''
            AND NOT EXISTS (SELECT 1 FROM modulos_caja mc WHERE mc.caja_modulo = f.caja)`,
      ),
      'ningún registro apunta a una caja que no existe',
    ).toBe(0);

    expect(
      await contar(
        `SELECT COUNT(*) AS n FROM asignacion_caja_tecnica a
          WHERE NOT EXISTS (SELECT 1 FROM modulos_caja mc WHERE mc.id = a.modulo_id)
             OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.usuario_id)`,
      ),
      'ninguna asignación huérfana',
    ).toBe(0);

    expect(
      await contar(
        `SELECT COUNT(*) AS n FROM (
           SELECT modulo_id, usuario_id FROM asignacion_caja_tecnica
            GROUP BY modulo_id, usuario_id HAVING COUNT(*) > 1
         ) d`,
      ),
      'ninguna persona asignada dos veces a la misma caja',
    ).toBe(0);
  }, 180_000);

  /*
   * La corrección de días anteriores. La técnica solo toca lo suyo del día;
   * lo de ayer queda para el líder, salvo que el líder reabra la caja: mientras
   * siga abierta, ella corrige también lo de días anteriores. Y el permiso se
   * acaba cuando la caja vuelve a cerrarse, y eso lo hace la propia técnica al
   * darla por terminada: ninguna caja se cierra sola.
   */
  it('la técnica corrige lo de días anteriores solo mientras el líder tenga la caja reabierta', async () => {
    const lider = sesion();
    await json(lider, 'POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
    const tec = sesion();
    await json(tec, 'POST', '/login', { cc: TECNICA.cc, contrasena: TECNICA.contrasena });

    const estadoDe = async (cajaModulo: string) =>
      (
        await baseViva().query<{ estado_caja: string; reabierta_por: string | null }>(
          'SELECT estado_caja, reabierta_por FROM modulos_caja WHERE caja_modulo = $1',
          [cajaModulo],
        )
      ).rows[0];
    const idDeCaja = (
      await baseViva().query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2)])
    ).rows[0].id;
    // La técnica da la caja por terminada: es la única forma en que se cierra.
    const laTecnicaLaTermina = () =>
      json(tec, 'POST', `/modulos_caja/${idDeCaja}/jornada`, { resultado: 'TERMINADA' });

    // Un registro de ayer en la caja 2, que la técnica tiene asignada.
    const AYER = fechaLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await json(tec, 'POST', '/fuiddatosreal', {
      caja: caja(2),
      upd: 'UPD8800201',
      n_orden: 1,
      fecha_del_dato: AYER,
      asunto_2: 'HISTORIA CLINICA',
      asunto_3: 'PACIENTE DE AYER',
      elaborado_por: `${TECNICA.nombre} (${TECNICA.cc})`,
      sede: 'BARRANQUILLA',
      nro_acta_transferible: ACTA,
    });
    const { id } = (
      await baseViva().query<{ id: number }>(`SELECT id FROM fuiddatosreal WHERE upd = 'UPD8800201'`)
    ).rows[0];
    // El formulario manda el registro entero: aquí se hace igual, cambiando solo el asunto.
    const correccion = async (asunto: string) => ({
      ...(await json<Record<string, unknown>>(tec, 'GET', `/fuiddatosreal/${id}`)),
      asunto_3: asunto,
    });
    const asuntoGuardado = async () =>
      (await baseViva().query<{ asunto_3: string }>('SELECT asunto_3 FROM fuiddatosreal WHERE id = $1', [id]))
        .rows[0].asunto_3;

    // Terminada la caja, lo de ayer no se toca.
    await laTecnicaLaTermina();
    expect(await estadoDe(caja(2))).toMatchObject({ estado_caja: 'FINALIZADO', reabierta_por: null });
    const cerrada = await tec('PUT', `/fuiddatosreal/${id}`, await correccion('INTENTO CON LA CAJA CERRADA'));
    expect(cerrada.status, 'con la caja cerrada, lo de ayer no se edita').toBe(403);
    expect(await asuntoGuardado()).toBe('PACIENTE DE AYER');

    // El líder reabre la caja: queda firmado quién.
    await json(lider, 'PATCH', `/modulos_caja/${idDeCaja}/cambiarEstado`, { estado_caja: 'EN PROCESO' });
    expect(await estadoDe(caja(2))).toMatchObject({
      estado_caja: 'EN PROCESO',
      reabierta_por: `${LIDER.nombre} (${LIDER.cc})`,
    });

    // Ahora sí: la técnica corrige su registro de ayer.
    await json(tec, 'PUT', `/fuiddatosreal/${id}`, await correccion('PACIENTE CORREGIDO'));
    expect(await asuntoGuardado()).toBe('PACIENTE CORREGIDO');

    // Pero solo lo suyo: otra técnica no toca ese registro aunque la caja esté reabierta.
    const otra = sesion();
    await json(otra, 'POST', '/login', { cc: OTRA_TECNICA.cc, contrasena: OTRA_TECNICA.contrasena });
    const ajeno = await otra('PUT', `/fuiddatosreal/${id}`, await correccion('INTRUSO'));
    expect(ajeno.status, 'la reapertura no abre los registros de otras personas').toBe(403);
    expect(await asuntoGuardado()).toBe('PACIENTE CORREGIDO');

    // Al darla por terminada otra vez, la reapertura se acaba, y con ella el permiso.
    await laTecnicaLaTermina();
    expect(await estadoDe(caja(2))).toMatchObject({ estado_caja: 'FINALIZADO', reabierta_por: null });
    const otraVez = await tec('PUT', `/fuiddatosreal/${id}`, await correccion('INTENTO TARDIO'));
    expect(otraVez.status, 'cerrada la caja, vuelve a no poder editar').toBe(403);
    expect(await asuntoGuardado()).toBe('PACIENTE CORREGIDO');

    // Borrar sigue la misma regla: solo con la caja reabierta por el líder.
    const borradoCerrada = await tec('DELETE', `/fuiddatosreal/${id}`);
    expect(borradoCerrada.status, 'con la caja cerrada tampoco se borra').toBe(403);
    await json(lider, 'PATCH', `/modulos_caja/${idDeCaja}/cambiarEstado`, { estado_caja: 'EN PROCESO' });
    await json(tec, 'DELETE', `/fuiddatosreal/${id}`);
    expect(await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE id = $1', [id])).toBe(0);
    // Y el borrado dejó su copia en el historial, como cualquier otro.
    expect(await contar('SELECT COUNT(*) AS n FROM historial WHERE id_dato = $1', [id])).toBeGreaterThan(0);
  }, 180_000);

  /*
   * El número de orden. Lo asigna el servidor, el siguiente de la caja, y lo
   * que se muestra y se exporta es el consecutivo 1, 2, 3… sin los huecos que
   * dejan los registros borrados. Se comprueba en la lista y abriendo el Excel.
   */
  it('el número de orden es el consecutivo de la caja, sin huecos, en la lista y en el Excel', async () => {
    const lider = sesion();
    await json(lider, 'POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
    const tec = sesion();
    await json(tec, 'POST', '/login', { cc: TECNICA.cc, contrasena: TECNICA.contrasena });

    type Fila = { id: number; upd: string; n_orden: number | null; n_orden_caja: number };
    const lista = () => json<Fila[]>(tec, 'GET', `/fuiddatosreal?caja=${caja(1)}`);

    // La caja 1 quedó con seis registros, numerados del 1 al 6 por el servidor.
    expect((await lista()).map((f) => f.n_orden)).toEqual([1, 2, 3, 4, 5, 6]);

    // Lo que mande el formulario se ignora: el siguiente es el 7, no el 999.
    await json(tec, 'POST', '/fuiddatosreal', {
      caja: caja(1),
      upd: 'UPD8800007',
      n_orden: 999,
      fecha_del_dato: DIA,
      asunto_2: 'HISTORIA CLINICA',
      asunto_3: 'PACIENTE 7',
      elaborado_por: `${TECNICA.nombre} (${TECNICA.cc})`,
      sede: 'BARRANQUILLA',
      nro_acta_transferible: ACTA,
    });
    const conSiete = await lista();
    expect(conSiete.find((f) => f.upd === 'UPD8800007')?.n_orden, 'el servidor pone el siguiente').toBe(7);

    // El líder borra el tercero: el número guardado deja un hueco, el consecutivo no.
    const tercero = conSiete.find((f) => f.n_orden === 3)!;
    await json(lider, 'DELETE', `/fuiddatosreal/${tercero.id}`);
    const sinHueco = await lista();
    expect(sinHueco.map((f) => f.n_orden)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(sinHueco.map((f) => f.n_orden_caja)).toEqual([1, 2, 3, 4, 5, 6]);

    // Y el Excel del inventario trae ese mismo consecutivo en su primera columna.
    const respuesta = await lider('GET', `/inventario/clientes/${CLIENTE.codigo}/excel`);
    expect(respuesta.status).toBe(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await respuesta.arrayBuffer()));
    const hoja = libro.getWorksheet('F-PSD-001')!;
    const primeraColumna = [8, 9, 10, 11, 12, 13].map((fila) => hoja.getRow(fila).getCell(1).value);
    expect(primeraColumna, 'N° de orden del 1 al 6, sin el hueco del borrado').toEqual([1, 2, 3, 4, 5, 6]);
    expect(hoja.getRow(8).getCell(16).value, 'el primero de la caja').toBe('UPD8800001');
    expect(hoja.getRow(13).getCell(16).value, 'y el último, el séptimo digitado').toBe('UPD8800007');
    expect(hoja.getRow(14).getCell(1).value, 'no hay más filas').toBeNull();
  }, 180_000);
});
