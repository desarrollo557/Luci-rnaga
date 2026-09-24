import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';
import { fechaHoyLocal } from '../utils/format.js';

/**
 * Quien ya digitó en una caja no vuelve a indicar el UPD de arranque.
 *
 * El consecutivo de cada persona en cada caja se anota en
 * `asignacion_caja_tecnica` (`upd_inicio`, `ultimo_upd`), pero eso es un espejo
 * de lo que ya está escrito en `fuiddatosreal`. Un espejo se puede perder: las
 * cajas reabiertas antes del 24 de septiembre de 2026 lo perdieron, porque
 * entonces la reapertura borraba el arranque a propósito. Aquella reapertura ya
 * no borra nada, pero las filas que quedaron vacías siguen ahí, y con ellas el
 * diálogo pidiendo un arranque a alguien que lleva registros en esa caja.
 *
 * Lo que se comprueba aquí es que el servidor mira los registros antes de
 * preguntar: si la persona ya digitó en esa caja, el consecutivo sale de su
 * mayor UPD ahí y no se le pregunta nada. Así se arregla lo ya roto sin tocar
 * la base, y no vuelve a importar que el espejo se pierda.
 *
 * Recorre la aplicación Express tal como se despliega; lo único sustituido es
 * el motor de la base, por otro PostgreSQL de verdad. Los clientes, las cajas y
 * los asuntos son inventados.
 */

vi.mock('pg', () => moduloPgFalso());

const CLIENTE = { codigo: '088', entidad: 'ENTIDAD DE PRUEBA OCHENTA Y OCHO' };
const ACTA = '400';
const CAJA_TRABAJADA = CLIENTE.codigo + 'C000001';
const CAJA_NUEVA = CLIENTE.codigo + 'C000002';
const CAJA_COMPARTIDA = CLIENTE.codigo + 'C000003';

const LIDER = { cc: '8800001', nombre: 'LIDER ESPEJO', contrasena: 'Clave.Lider1' };
const TECNICA = { cc: '8800002', nombre: 'TECNICA ESPEJO', contrasena: 'Clave.Tecnica1' };
const COMPANERA = { cc: '8800003', nombre: 'TECNICA VECINA', contrasena: 'Clave.Tecnica2' };
const FIRMA = `${TECNICA.nombre} (${TECNICA.cc})`;
const FIRMA_VECINA = `${COMPANERA.nombre} (${COMPANERA.cc})`;
const HOY = fechaHoyLocal();

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
type Sesion = ReturnType<typeof sesion>;

async function json<T>(pedir: Sesion, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
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

type SiguienteUpd = { upd: string | null; requiere_inicio?: boolean; message?: string };

/** Deja el espejo de esa caja como lo dejaban las reaperturas de entonces: vacío. */
async function borrarElEspejo(caja: string) {
  await baseViva().query(
    `UPDATE asignacion_caja_tecnica
        SET upd_inicio = NULL, ultimo_upd = NULL
      WHERE modulo_id = (SELECT id FROM modulos_caja WHERE caja_modulo = $1)`,
    [caja],
  );
}

async function espejoDe(caja: string, cc: string) {
  const { rows } = await baseViva().query<{ upd_inicio: string | null; ultimo_upd: string | null }>(
    `SELECT act.upd_inicio, act.ultimo_upd
       FROM asignacion_caja_tecnica act
       JOIN modulos_caja mc ON mc.id = act.modulo_id
       JOIN users u ON u.id = act.usuario_id
      WHERE mc.caja_modulo = $1 AND u.cc = $2`,
    [caja, cc],
  );
  return rows[0];
}

let tec: Sesion;
let vecina: Sesion;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'secreto-de-prueba-suficientemente-largo-1234567890';
  process.env.PG_HOST ??= 'memoria';
  process.env.PG_USER ??= 'prueba';
  process.env.PG_PASSWORD ??= 'prueba';

  await reiniciarBase();
  for (const [persona, rol] of [
    [LIDER, 'LIDER'],
    [TECNICA, 'TECNICA'],
    [COMPANERA, 'TECNICA'],
  ] as const) {
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

  // ── El líder monta el cliente, el acta y tres cajas ────────────────────
  const lider = sesion();
  await json(lider, 'POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
  await json(lider, 'POST', '/sub_modulos', {
    codigo: CLIENTE.codigo,
    entidad_remitente: CLIENTE.entidad,
    sede_submodulos: 'BARRANQUILLA',
  });
  const clientes = await json<{ id: number; codigo: string }[]>(lider, 'GET', '/sub_modulos');
  const cliente = clientes.find((c) => c.codigo === CLIENTE.codigo)!;
  await json(lider, 'POST', '/moduloscliente', {
    codigo: CLIENTE.codigo,
    entidad_remitente: CLIENTE.entidad,
    acta_transferencia_modulo: ACTA,
    fecha_trans_modulo: '2026-09-01',
    id_submodulo: cliente.id,
  });
  const actas = await json<{ id: number; acta_transferencia_modulo: string }[]>(lider, 'GET', '/moduloscliente');
  const acta = actas.find((a) => a.acta_transferencia_modulo === ACTA)!;
  const tecnicas = await json<{ id: number; cc: string }[]>(lider, 'GET', '/usuarios/TECNICA');
  const ids = [TECNICA, COMPANERA].map((p) => tecnicas.find((u) => u.cc === p.cc)!.id);
  await json(lider, 'POST', '/modulos_caja/serie', {
    id_modulo_caja: acta.id,
    entidad_remitente_caja: CLIENTE.entidad,
    acta_trans_caja: ACTA,
    fecha_trans_caja: '2026-09-01',
    entidad_productora_caja: CLIENTE.entidad,
    unidad_administrativa_caja: 'SECRETARIA DE PRUEBA',
    oficina_productora_caja: 'ARCHIVO DE PRUEBA',
    objeto_caja: 'TRANSFERENCIA PRIMARIA',
    estado_caja: 'EN PROCESO',
    usuarios_tecnica: ids,
    numero_inicial: '000001',
    numero_final: '000003',
  });

  tec = sesion();
  await json(tec, 'POST', '/login', { cc: TECNICA.cc, contrasena: TECNICA.contrasena });
  vecina = sesion();
  await json(vecina, 'POST', '/login', { cc: COMPANERA.cc, contrasena: COMPANERA.contrasena });
}, 120_000);

afterAll(async () => {
  await new Promise((fin) => servidor?.close(() => fin(undefined)));
});

const registro = (caja: string, upd: string, firma: string, asunto: string) => ({
  caja,
  upd,
  fecha_del_dato: HOY,
  asunto_2: 'ASUNTO DE PRUEBA',
  asunto_3: asunto,
  elaborado_por: firma,
  sede: 'BARRANQUILLA',
  nro_acta_transferible: ACTA,
});

describe('el consecutivo sale de los registros cuando el espejo está vacío', () => {
  it('con registros propios en la caja no se pide el arranque, se sigue desde el mayor', async () => {
    const siguiente = () => json<SiguienteUpd>(tec, 'GET', `/modulos_caja/next-upd/${CAJA_TRABAJADA}`);

    // Trabaja la caja como cualquier día: fija el arranque y digita tres.
    expect((await siguiente()).requiere_inicio, 'la primera vez sí lo pide').toBe(true);
    await json(tec, 'PUT', `/modulos_caja/${CAJA_TRABAJADA}/upd-inicio`, { numero: '7000001' });
    for (const [i, upd] of ['UPD7000001', 'UPD7000002', 'UPD7000003'].entries()) {
      await json(tec, 'POST', '/fuiddatosreal', registro(CAJA_TRABAJADA, upd, FIRMA, `DOCUMENTO ${i + 1}`));
    }
    expect((await siguiente()).upd).toBe('UPD7000004');

    // Lo que dejaron las reaperturas viejas: el espejo en blanco.
    await borrarElEspejo(CAJA_TRABAJADA);
    expect(await espejoDe(CAJA_TRABAJADA, TECNICA.cc)).toEqual({ upd_inicio: null, ultimo_upd: null });

    // Y aun así no se le pregunta nada: sus registros dicen dónde iba.
    const respuesta = await siguiente();
    expect(respuesta.requiere_inicio, 'no se pide arranque a quien ya digitó ahí').toBeFalsy();
    expect(respuesta.upd, 'el siguiente de su mayor UPD en la caja').toBe('UPD7000004');
  }, 120_000);

  it('al guardar el siguiente registro el espejo vuelve a quedar al día', async () => {
    await json(tec, 'POST', '/fuiddatosreal', registro(CAJA_TRABAJADA, 'UPD7000004', FIRMA, 'DOCUMENTO 4'));
    expect((await espejoDe(CAJA_TRABAJADA, TECNICA.cc))?.ultimo_upd).toBe('UPD7000004');
    const respuesta = await json<SiguienteUpd>(tec, 'GET', `/modulos_caja/next-upd/${CAJA_TRABAJADA}`);
    expect(respuesta.upd).toBe('UPD7000005');
  }, 120_000);

  it('en una caja donde no ha digitado sí se le pide el arranque', async () => {
    const respuesta = await json<SiguienteUpd>(tec, 'GET', `/modulos_caja/next-upd/${CAJA_NUEVA}`);
    expect(respuesta.requiere_inicio, 'la primera vez en una caja sigue preguntando').toBe(true);
    expect(respuesta.upd).toBeNull();
  }, 120_000);

  it('no se continúa por el UPD de la compañera: cada quien lleva el suyo', async () => {
    // La compañera trabaja la caja compartida y se le borra el espejo.
    await json(vecina, 'PUT', `/modulos_caja/${CAJA_COMPARTIDA}/upd-inicio`, { numero: '7500001' });
    await json(vecina, 'POST', '/fuiddatosreal', registro(CAJA_COMPARTIDA, 'UPD7500001', FIRMA_VECINA, 'DOCUMENTO A'));
    await json(vecina, 'POST', '/fuiddatosreal', registro(CAJA_COMPARTIDA, 'UPD7500002', FIRMA_VECINA, 'DOCUMENTO B'));
    await borrarElEspejo(CAJA_COMPARTIDA);

    // A ella se le retoma su consecutivo...
    const suyo = await json<SiguienteUpd>(vecina, 'GET', `/modulos_caja/next-upd/${CAJA_COMPARTIDA}`);
    expect(suyo.upd).toBe('UPD7500003');

    // ...y a quien no ha digitado en esa caja se le sigue pidiendo el arranque,
    // aunque la caja ya tenga registros de otra persona.
    const ajeno = await json<SiguienteUpd>(tec, 'GET', `/modulos_caja/next-upd/${CAJA_COMPARTIDA}`);
    expect(ajeno.requiere_inicio, 'el consecutivo de la compañera no es el suyo').toBe(true);
    expect(ajeno.upd).toBeNull();
  }, 120_000);
});
