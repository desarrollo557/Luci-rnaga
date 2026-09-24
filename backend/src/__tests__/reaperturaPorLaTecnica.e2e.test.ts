import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';
import { fechaHoyLocal, fechaLocal } from '../utils/format.js';

/**
 * La técnica cierra su caja, la reabre al día siguiente y sigue.
 *
 * Es el caso que la operación describió y que tiene que salir bien de punta a
 * punta: un auxiliar trabaja una caja, la da por terminada, y al día siguiente
 * la reabre él mismo —sin pedir permiso a nadie— y continúa. Lo que se
 * comprueba, con la aplicación Express tal como se despliega:
 *
 * - que reabrir es suyo y no del líder;
 * - que al reabrir se le vuelve a pedir el UPD con el que continúa, y que el
 *   siguiente UPD parte del número que él indique;
 * - que el seguimiento cuenta lo de cada día: los registros del día anterior y
 *   la caja terminada ese día, y los registros y el cierre del día en que la
 *   reabrió;
 * - y que puede bajar su propio inventario general, en el formato FUID.
 */

vi.mock('pg', () => moduloPgFalso());

const CLIENTE = { codigo: '066', entidad: 'GOBERNACION DE PRUEBA' };
const ACTA = '122';
const CAJA = CLIENTE.codigo + 'C000001';
const LIDER = { cc: '6600001', nombre: 'LIDER RETOMA', contrasena: 'Clave.Lider1' };
const TECNICA = { cc: '6600002', nombre: 'TECNICA RETOMA', contrasena: 'Clave.Tecnica1' };
const FIRMA = `${TECNICA.nombre} (${TECNICA.cc})`;
const HOY = fechaHoyLocal();
const AYER = fechaLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));

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
type Sesion = ReturnType<typeof sesion>;

/** Pide y exige que salga bien; si no, el error dice qué respondió el servidor. */
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

async function estadoDeLaCaja() {
  const { rows } = await baseViva().query<{ estado_caja: string | null; reabierta_por: string | null }>(
    'SELECT estado_caja, reabierta_por FROM modulos_caja WHERE caja_modulo = $1',
    [CAJA],
  );
  return rows[0];
}

async function jornadasAnotadas() {
  const { rows } = await baseViva().query<{ fecha: string; colaborador: string; resultado: string; registros: number }>(
    'SELECT fecha::text AS fecha, colaborador, resultado, registros FROM jornada_caja WHERE caja_modulo = $1 ORDER BY fecha',
    [CAJA],
  );
  return rows;
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
    [TECNICA, 'TECNICA'],
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
}, 120_000);

afterAll(async () => {
  await new Promise((fin) => servidor?.close(() => fin(undefined)));
});

describe('la técnica cierra su caja, la reabre al día siguiente y sigue', () => {
  it('reabre por sí misma, vuelve a indicar el UPD, y el seguimiento cuenta los dos días', async () => {
    const lider = sesion();
    await json(lider, 'POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
    const tec = sesion();
    await json(tec, 'POST', '/login', { cc: TECNICA.cc, contrasena: TECNICA.contrasena });

    // ── El líder monta el cliente, el acta y la caja, y asigna a la técnica ──
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
    const tecnica = tecnicas.find((u) => u.cc === TECNICA.cc)!;
    await json(lider, 'POST', '/modulos_caja/serie', {
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
      numero_inicial: '000001',
      numero_final: '000001',
    });
    const { rows } = await baseViva().query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [CAJA]);
    const cajaId = rows[0].id;

    const registro = (upd: string, fecha: string, asunto: string) => ({
      caja: CAJA,
      upd,
      fecha_del_dato: fecha,
      asunto_2: 'CONTRATOS',
      asunto_3: asunto,
      elaborado_por: FIRMA,
      sede: 'BARRANQUILLA',
      nro_acta_transferible: ACTA,
    });
    type SiguienteUpd = { upd: string | null; requiere_inicio?: boolean; message?: string };
    const siguienteUpd = () => json<SiguienteUpd>(tec, 'GET', `/modulos_caja/next-upd/${CAJA}`);

    // ── Día 1: arranca la caja, digita y la da por terminada ─────────────
    // La primera vez en la caja se le pide el UPD con el que arranca.
    expect((await siguienteUpd()).requiere_inicio, 'la primera vez pide el arranque').toBe(true);
    await json(tec, 'PUT', `/modulos_caja/${CAJA}/upd-inicio`, { numero: '5000001' });
    expect((await siguienteUpd()).upd).toBe('UPD5000001');

    await json(tec, 'POST', '/fuiddatosreal', registro('UPD5000001', AYER, 'CONTRATO 1'));
    await json(tec, 'POST', '/fuiddatosreal', registro('UPD5000002', AYER, 'CONTRATO 2'));
    expect((await siguienteUpd()).upd, 'sigue su propio consecutivo').toBe('UPD5000003');

    // La da por terminada. El cierre se atribuye al día del último registro y
    // queda anotado en esa jornada, con sus dos registros.
    await json(tec, 'PATCH', `/modulos_caja/${cajaId}/cambiarEstado`, { estado_caja: 'FINALIZADO' });
    expect(await estadoDeLaCaja()).toEqual({ estado_caja: 'FINALIZADO', reabierta_por: null });
    expect(await jornadasAnotadas()).toEqual([{ fecha: AYER, colaborador: FIRMA, resultado: 'TERMINADA', registros: 2 }]);

    // ── Día 2: la reabre ella misma y continúa ───────────────────────────
    const reabierta = await json<{ message: string }>(tec, 'PATCH', `/modulos_caja/${cajaId}/cambiarEstado`, {
      estado_caja: 'EN PROCESO',
    });
    expect(reabierta.message).toContain('UPD');
    // Sin firma: la reapertura de la propia técnica no autoriza corregir días anteriores.
    expect(await estadoDeLaCaja()).toEqual({ estado_caja: 'EN PROCESO', reabierta_por: null });

    // Y en ese momento, no antes, se le vuelve a pedir el UPD con el que sigue.
    const trasReabrir = await siguienteUpd();
    expect(trasReabrir.requiere_inicio, 'al reabrir se pide el arranque de nuevo').toBe(true);
    expect(trasReabrir.message).toContain('reabrió');

    // Indica una lista nueva, y el siguiente UPD parte de ahí, no del último de ayer.
    await json(tec, 'PUT', `/modulos_caja/${CAJA}/upd-inicio`, { numero: '6000001' });
    expect((await siguienteUpd())).toMatchObject({ upd: 'UPD6000001', requiere_inicio: false });
    await json(tec, 'POST', '/fuiddatosreal', registro('UPD6000001', HOY, 'CONTRATO 3'));
    expect((await siguienteUpd()).upd).toBe('UPD6000002');

    // Termina la jornada de hoy desde la digitación.
    await json(tec, 'POST', `/modulos_caja/${cajaId}/jornada`, { resultado: 'TERMINADA' });
    expect((await estadoDeLaCaja()).estado_caja).toBe('FINALIZADO');
    expect(await jornadasAnotadas()).toEqual([
      { fecha: AYER, colaborador: FIRMA, resultado: 'TERMINADA', registros: 2 },
      { fecha: HOY, colaborador: FIRMA, resultado: 'TERMINADA', registros: 1 },
    ]);

    // ── El seguimiento registra los dos días, cada uno con lo suyo ───────
    const { consultaSeguimiento } = await import('../controllers/reportes.controller.js');
    const { rows: seguimiento } = await baseViva().query<{
      fecha: string;
      total_cajas: number | string;
      total_registros: number | string;
      upd_ini: number;
      upd_fin: number;
      acta: string;
    }>(
      // La fecha como texto: leída directamente de la base llegaría como objeto.
      `SELECT fecha::text AS fecha, total_cajas, total_registros, upd_ini, upd_fin, acta
         FROM (${consultaSeguimiento(`f.caja = '${CAJA}'`)}) t`,
    );
    expect(
      seguimiento.map((f) => ({
        fecha: f.fecha,
        cajas: Number(f.total_cajas),
        registros: Number(f.total_registros),
        upd: [f.upd_ini, f.upd_fin],
      })),
    ).toEqual([
      { fecha: AYER, cajas: 1, registros: 2, upd: [5000001, 5000002] },
      { fecha: HOY, cajas: 1, registros: 1, upd: [6000001, 6000001] },
    ]);
    expect(seguimiento[0].acta).toMatch(/^ACTA 122-\d{4}$/);

    // Por la API del líder sale lo mismo: dos jornadas, tres registros.
    const resumen = await json<{ jornadas: number; registros: number }>(
      lider,
      'GET',
      `/seguimiento-inventario/resumen?desde=${AYER}&hasta=${HOY}&persona=${encodeURIComponent(FIRMA)}`,
    );
    expect(resumen).toEqual({ jornadas: 2, registros: 3 });

    // ── Su propio inventario general, en el formato FUID ─────────────────
    const descarga = await tec('GET', '/inventario/mio/excel');
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toContain('spreadsheetml');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await descarga.arrayBuffer()));
    const hoja = libro.getWorksheet('F-PSD-001')!;
    const upds = [8, 9, 10].map((fila) => hoja.getRow(fila).getCell(16).value);
    expect(upds, 'sus tres registros, en el orden de la caja').toEqual(['UPD5000001', 'UPD5000002', 'UPD6000001']);
    expect(hoja.getRow(11).getCell(1).value, 'y ninguno más').toBeNull();

    // Acotado a hoy, solo lo de hoy.
    const deHoy = await tec('GET', `/inventario/mio/excel?desde=${HOY}`);
    expect(deHoy.status).toBe(200);
    const libroDeHoy = new ExcelJS.Workbook();
    await libroDeHoy.xlsx.load(Buffer.from(await deHoy.arrayBuffer()));
    const hojaDeHoy = libroDeHoy.getWorksheet('F-PSD-001')!;
    expect(hojaDeHoy.getRow(8).getCell(16).value).toBe('UPD6000001');
    expect(hojaDeHoy.getRow(9).getCell(1).value).toBeNull();

    // Quien no ha digitado nada recibe un motivo, no un archivo vacío.
    const sinNada = await lider('GET', '/inventario/mio/excel');
    expect(sinNada.status).toBe(404);
  }, 180_000);
});
