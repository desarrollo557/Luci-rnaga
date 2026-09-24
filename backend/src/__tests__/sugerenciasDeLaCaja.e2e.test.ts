import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';

/**
 * Las sugerencias de una caja: lo ya escrito en ella, a partir de sus iniciales.
 *
 * Nace de una caja real. En la base de producción hay cajas con veintinueve
 * asuntos automáticos distintos en treinta registros, y ahí el campo no se
 * hereda: se reconoce. Escribir las iniciales tiene que traer lo que ya está.
 *
 * Y de un fallo que nadie veía: los valores se guardan en mayúsculas, pero lo
 * que se teclea viaja tal cual —el campo se ve en mayúsculas por la hoja de
 * estilos, no porque el valor lo esté—, así que con `LIKE` un "sopor" en
 * minúscula no encontraba "ASUNTO DE PRUEBA LARGO" y las sugerencias parecían no
 * existir.
 *
 * Recorre la aplicación Express tal como se despliega; lo único sustituido es
 * el motor de la base, por otro PostgreSQL de verdad.
 */

vi.mock('pg', () => moduloPgFalso());

const LIDER = { cc: '8810001', nombre: 'LIDER SUGERENCIAS', contrasena: 'Clave.Lider1' };
const CAJA = '091C000001';
const OTRA_CAJA = '091C000002';
/* Valores inventados: lo que se comprueba es cómo busca, no qué archiva nadie. */
const ASUNTOS = [
  'ASUNTO UNO DE PRUEBA',
  'ASUNTO DOS DE PRUEBA',
  'MATERIAL DE PRUEBA',
  'PLANOS DE PRUEBA',
];

let servidor: Server;
let raiz: string;
let cookie = '';

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
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
}

/** Las sugerencias que devuelve la caja para lo tecleado. */
async function sugerencias(caja: string, campo: string, q: string): Promise<string[]> {
  const respuesta = await pedir('GET', `/fuiddatosreal/${caja}/suggestions/${campo}?q=${encodeURIComponent(q)}`);
  expect(respuesta.status).toBe(200);
  return (await respuesta.json()) as string[];
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'secreto-de-prueba-suficientemente-largo-1234567890';
  process.env.PG_HOST ??= 'memoria';
  process.env.PG_USER ??= 'prueba';
  process.env.PG_PASSWORD ??= 'prueba';

  await reiniciarBase();
  await baseViva().query(
    'INSERT INTO users (nombre, cc, contrasena, rol, sede) VALUES ($1, $2, $3, $4, $5)',
    [LIDER.nombre, LIDER.cc, await bcrypt.hash(LIDER.contrasena, 10), 'LIDER', 'BARRANQUILLA'],
  );

  // Una caja con varios asuntos, más uno sin diligenciar y otro en otra caja.
  let orden = 0;
  for (const asunto of ASUNTOS) {
    orden += 1;
    await baseViva().query(
      'INSERT INTO fuiddatosreal (caja, n_orden, asunto_2, elaborado_por) VALUES ($1, $2, $3, $4)',
      [CAJA, orden, asunto, LIDER.nombre],
    );
  }
  await baseViva().query(
    'INSERT INTO fuiddatosreal (caja, n_orden, asunto_2, elaborado_por) VALUES ($1, $2, $3, $4)',
    [CAJA, 99, 'N/A', LIDER.nombre],
  );
  await baseViva().query(
    'INSERT INTO fuiddatosreal (caja, n_orden, asunto_2, elaborado_por) VALUES ($1, $2, $3, $4)',
    [OTRA_CAJA, 1, 'ASUNTO DE OTRA CAJA', LIDER.nombre],
  );

  const { app } = await import('../app.js');
  servidor = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  const direccion = servidor.address();
  const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
  raiz = `http://127.0.0.1:${puerto}/api`;

  const entrada = await pedir('POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
  expect(entrada.status).toBe(200);
}, 120_000);

afterAll(async () => {
  await new Promise((fin) => servidor?.close(() => fin(undefined)));
});

describe('sugerencias del asunto automático en una caja con varios', () => {
  it('con una sola inicial ya trae lo que empieza así', async () => {
    expect(await sugerencias(CAJA, 'asunto_2', 'M')).toEqual(['MATERIAL DE PRUEBA']);
  });

  it('da igual escribirlo en minúscula, que es como se teclea', async () => {
    expect(await sugerencias(CAJA, 'asunto_2', 'mater')).toEqual(['MATERIAL DE PRUEBA']);
  });

  it('afina según se escribe', async () => {
    expect(await sugerencias(CAJA, 'asunto_2', 'asunto dos')).toEqual(['ASUNTO DOS DE PRUEBA']);
  });

  it('solo sugiere lo de esta caja, no lo de la de al lado', async () => {
    const traidas = await sugerencias(CAJA, 'asunto_2', 'ASUNTO');
    expect(traidas).not.toContain('ASUNTO DE OTRA CAJA');
  });

  it('el marcador N/A no se sugiere: no es un asunto que nadie quiera repetir', async () => {
    expect(await sugerencias(CAJA, 'asunto_2', 'N')).toEqual([]);
  });

  it('un comodín tecleado es un carácter más, no "todo lo que haya"', async () => {
    expect(await sugerencias(CAJA, 'asunto_2', '%')).toEqual([]);
  });

  it('lo que no está en la caja no devuelve nada', async () => {
    expect(await sugerencias(CAJA, 'asunto_2', 'ZZZ')).toEqual([]);
  });

  it('un campo que no admite sugerencias se rechaza', async () => {
    const respuesta = await pedir('GET', `/fuiddatosreal/${CAJA}/suggestions/contrasena?q=A`);
    expect(respuesta.status).toBe(400);
  });
});
