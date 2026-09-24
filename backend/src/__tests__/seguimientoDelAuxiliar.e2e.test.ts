import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';

/**
 * El seguimiento de inventario que saca quien digita, desde su propio panel.
 *
 * Hasta ahora el formato F-PSD-IDA-001 era del líder, y un auxiliar que
 * necesitara el suyo tenía que pedírselo. Lo que se comprueba aquí es lo que
 * hace falta para dárselo sin abrir una puerta de más: que solo salga lo suyo
 * aunque pida lo de otro, y que los filtros de cliente, acta y día acoten de
 * verdad.
 *
 * Recorre la aplicación Express tal como se despliega; lo único sustituido es
 * el motor de la base, por otro PostgreSQL de verdad.
 */

vi.mock('pg', () => moduloPgFalso());

const LIDER = { cc: '9100001', nombre: 'LIDER SEGUIMIENTO', contrasena: 'Clave.Lider1' };
const AUXILIAR = { cc: '9100002', nombre: 'AUXILIAR UNO', contrasena: 'Clave.Aux1' };
const OTRO = { cc: '9100003', nombre: 'AUXILIAR DOS', contrasena: 'Clave.Aux2' };
const MIO = `${AUXILIAR.nombre} (${AUXILIAR.cc})`;
const AJENO = `${OTRO.nombre} (${OTRO.cc})`;

const CLIENTE_A = '070';
const CLIENTE_B = '071';
const ACTA_A = '500';
const ACTA_B = '501';
const AYER = '2026-09-23';
const HOY = '2026-09-24';

let servidor: Server;
let raiz: string;

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

/** Cuántas jornadas devuelve el resumen con esos filtros. */
async function jornadas(pedir: ReturnType<typeof sesion>, consulta = ''): Promise<number> {
  const respuesta = await pedir('GET', `/seguimiento-inventario/resumen${consulta}`);
  expect(respuesta.status).toBe(200);
  const cuerpo = (await respuesta.json()) as { jornadas: number };
  return cuerpo.jornadas;
}

/** Un registro digitado por alguien, en una caja, un día. */
async function digitar(caja: string, autor: string, fecha: string, orden: number) {
  await baseViva().query(
    `INSERT INTO fuiddatosreal (caja, n_orden, asunto_2, elaborado_por, fecha_del_dato)
     VALUES ($1, $2, $3, $4, $5)`,
    [caja, orden, 'ASUNTO DE PRUEBA', autor, fecha],
  );
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'secreto-de-prueba-suficientemente-largo-1234567890';
  process.env.PG_HOST ??= 'memoria';
  process.env.PG_USER ??= 'prueba';
  process.env.PG_PASSWORD ??= 'prueba';

  await reiniciarBase();
  for (const [persona, rol] of [
    [LIDER, 'LIDER'],
    [AUXILIAR, 'TECNICA'],
    [OTRO, 'TECNICA'],
  ] as const) {
    await baseViva().query(
      'INSERT INTO users (nombre, cc, contrasena, rol, sede) VALUES ($1, $2, $3, $4, $5)',
      [persona.nombre, persona.cc, await bcrypt.hash(persona.contrasena, 10), rol, 'BARRANQUILLA'],
    );
  }

  // Dos clientes, cada uno con su acta y su caja.
  for (const [codigo, acta, numero] of [
    [CLIENTE_A, ACTA_A, 1],
    [CLIENTE_B, ACTA_B, 2],
  ] as const) {
    const { rows: sub } = await baseViva().query<{ id: number }>(
      `INSERT INTO sub_modulos (codigo, entidad_remitente, sede_submodulos)
       VALUES ($1, $2, 'BARRANQUILLA') RETURNING id`,
      [codigo, `ENTIDAD ${codigo}`],
    );
    const { rows: mcl } = await baseViva().query<{ id: number }>(
      `INSERT INTO moduloscliente (codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [codigo, `ENTIDAD ${codigo}`, acta, AYER, sub[0].id],
    );
    await baseViva().query(
      `INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja, fecha_trans_caja, id_modulo_caja)
       VALUES ($1, $2, $3, $4, $5)`,
      [`${codigo}C00000${numero}`, `ENTIDAD ${codigo}`, acta, AYER, mcl[0].id],
    );
  }

  // Lo mío: dos días en el cliente A y uno en el B. Lo del otro: un día.
  await digitar(`${CLIENTE_A}C000001`, MIO, AYER, 1);
  await digitar(`${CLIENTE_A}C000001`, MIO, HOY, 2);
  await digitar(`${CLIENTE_B}C000002`, MIO, HOY, 3);
  await digitar(`${CLIENTE_A}C000001`, AJENO, HOY, 4);

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

describe('el seguimiento que saca quien digita', () => {
  it('solo trae lo suyo, aunque pida el de otra persona', async () => {
    const aux = sesion();
    await aux('POST', '/login', { cc: AUXILIAR.cc, contrasena: AUXILIAR.contrasena });

    // Tres jornadas suyas: dos días en el cliente A y uno en el B.
    expect(await jornadas(aux)).toBe(3);
    // Y pedir las del compañero no se las da: le vuelven las suyas.
    expect(await jornadas(aux, `?persona=${encodeURIComponent(AJENO)}`)).toBe(3);
  }, 120_000);

  it('el filtro de cliente acota a ese cliente', async () => {
    const aux = sesion();
    await aux('POST', '/login', { cc: AUXILIAR.cc, contrasena: AUXILIAR.contrasena });
    expect(await jornadas(aux, `?cliente=${CLIENTE_A}`)).toBe(2);
    expect(await jornadas(aux, `?cliente=${CLIENTE_B}`)).toBe(1);
  }, 120_000);

  it('el filtro de acta acota a esa acta', async () => {
    const aux = sesion();
    await aux('POST', '/login', { cc: AUXILIAR.cc, contrasena: AUXILIAR.contrasena });
    expect(await jornadas(aux, `?acta=${ACTA_B}`)).toBe(1);
  }, 120_000);

  it('el filtro de día deja solo esa jornada', async () => {
    const aux = sesion();
    await aux('POST', '/login', { cc: AUXILIAR.cc, contrasena: AUXILIAR.contrasena });
    expect(await jornadas(aux, `?desde=${AYER}&hasta=${AYER}`)).toBe(1);
    expect(await jornadas(aux, `?desde=${HOY}&hasta=${HOY}`)).toBe(2);
  }, 120_000);

  it('los filtros se combinan: un cliente, un día', async () => {
    const aux = sesion();
    await aux('POST', '/login', { cc: AUXILIAR.cc, contrasena: AUXILIAR.contrasena });
    expect(await jornadas(aux, `?cliente=${CLIENTE_A}&desde=${HOY}&hasta=${HOY}`)).toBe(1);
  }, 120_000);

  it('el Excel se descarga con esos filtros', async () => {
    const aux = sesion();
    await aux('POST', '/login', { cc: AUXILIAR.cc, contrasena: AUXILIAR.contrasena });
    const respuesta = await aux('GET', `/seguimiento-inventario/excel?cliente=${CLIENTE_A}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('spreadsheet');
    expect((await respuesta.arrayBuffer()).byteLength).toBeGreaterThan(0);
  }, 120_000);

  it('el líder sigue viendo lo de todos, y puede pedir el de una persona', async () => {
    const jefe = sesion();
    await jefe('POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
    expect(await jornadas(jefe)).toBe(4);
    expect(await jornadas(jefe, `?persona=${encodeURIComponent(AJENO)}`)).toBe(1);
  }, 120_000);
});
