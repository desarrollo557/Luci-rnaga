import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';
import { fechaHoyLocal } from '../utils/format.js';

/**
 * Reabrir una caja terminada: la técnica lo pide, el líder lo autoriza, y los
 * dos se enteran al instante.
 *
 * Se recorre con la aplicación Express tal como se despliega, con sesiones
 * por cookie y con la conexión abierta de eventos del servidor de verdad,
 * porque lo que se promete es "de manera inmediata, sin ningún retraso": eso
 * solo se puede comprobar escuchando la conexión y midiendo cuánto tarda en
 * llegar el aviso después de que la otra persona pulse.
 *
 * Y sobre todo lo que **no** debe poder pasar: que la técnica reabra una caja
 * por su cuenta, ni cambiando el estado ni digitando en ella, y que "la
 * continúo otro día" siga existiendo.
 */

vi.mock('pg', () => moduloPgFalso());

const CLIENTE = { codigo: '077', entidad: 'ALCALDIA DE PRUEBA REAPERTURA' };
const ACTA = 'ACTA-REAPERTURA-001';
const caja = (n: number) => CLIENTE.codigo + 'C' + String(n).padStart(6, '0');
const LIDER = { cc: '7700001', nombre: 'LIDER REAPERTURA', contrasena: 'Clave.Lider1' };
const TECNICA = { cc: '7700002', nombre: 'TECNICA REAPERTURA', contrasena: 'Clave.Tecnica1' };
const LIDER_BOGOTA = { cc: '7700003', nombre: 'LIDER DE BOGOTA', contrasena: 'Clave.Bogota1' };
const firma = (p: { nombre: string; cc: string }) => `${p.nombre} (${p.cc})`;

/** Cuánto se le concede a un aviso "inmediato" para llegar por la conexión abierta. */
const PLAZO_DEL_AVISO_MS = 3_000;

let servidor: Server;
let raiz: string;

interface Notificacion {
  id: number;
  usuario_id: number;
  tipo: string;
  mensaje: string;
  caja_id: number | null;
  caja_modulo: string | null;
  solicitud_id: number | null;
  leida_en: string | null;
}

interface Solicitud {
  id: number;
  caja_id: number;
  caja_modulo: string;
  solicitante: string;
  estado: string;
}

/** Cliente HTTP con cookies: una sesión por persona, como en un navegador. */
function sesion() {
  const s = {
    cookie: '',
    async pedir(metodo: string, ruta: string, cuerpo?: unknown) {
      const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
      if (s.cookie) cabeceras.Cookie = s.cookie;
      const respuesta = await fetch(raiz + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const recibidas = respuesta.headers.getSetCookie?.() ?? [];
      if (recibidas.length > 0) s.cookie = recibidas.map((c) => c.split(';')[0]).join('; ');
      return respuesta;
    },
  };
  return s;
}
type Sesion = ReturnType<typeof sesion>;

/** Pide y exige que salga bien; si no, el error dice qué respondió el servidor. */
async function json<T>(s: Sesion, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const respuesta = await s.pedir(metodo, ruta, cuerpo);
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

/** Una respuesta que se espera fallida: el código y el cuerpo, para comprobarlos. */
async function fallo(s: Sesion, metodo: string, ruta: string, cuerpo?: unknown) {
  const respuesta = await s.pedir(metodo, ruta, cuerpo);
  const texto = await respuesta.text();
  let datos: { error?: string; message?: string; code?: string } = {};
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { error: texto };
  }
  return { status: respuesta.status, ...datos };
}

/**
 * Escucha la conexión abierta de esta persona, como lo haría `EventSource`
 * en el navegador. Resuelve cuando el servidor confirma la conexión, para que
 * lo que se haga después ya tenga a quién llegarle.
 */
async function escuchar(s: Sesion) {
  const control = new AbortController();
  const cola: Notificacion[] = [];
  const esperando: Array<(n: Notificacion) => void> = [];
  let conectado!: () => void;
  const conexion = new Promise<void>((listo) => {
    conectado = listo;
  });

  const respuesta = await fetch(raiz + '/notificaciones/stream', {
    headers: { Cookie: s.cookie },
    signal: control.signal,
  });
  expect(respuesta.status).toBe(200);
  expect(respuesta.headers.get('content-type')).toContain('text/event-stream');

  const lector = respuesta.body!.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decodificador.decode(value, { stream: true });
        let corte: number;
        while ((corte = pendiente.indexOf('\n\n')) >= 0) {
          const bloque = pendiente.slice(0, corte);
          pendiente = pendiente.slice(corte + 2);
          let evento = 'message';
          let datos = '';
          for (const linea of bloque.split('\n')) {
            if (linea.startsWith('event:')) evento = linea.slice(6).trim();
            else if (linea.startsWith('data:')) datos += linea.slice(5).trim();
          }
          if (evento === 'conectado') conectado();
          if (evento === 'notificacion') {
            const n = JSON.parse(datos) as Notificacion;
            const receptor = esperando.shift();
            if (receptor) receptor(n);
            else cola.push(n);
          }
        }
      }
    } catch {
      // Se cerró: es lo esperado al terminar.
    }
  })();

  await conexion;
  return {
    /** El siguiente aviso, o un error claro si no llega en el plazo. */
    siguiente: () =>
      new Promise<Notificacion>((listo, falla) => {
        const encolado = cola.shift();
        if (encolado) {
          listo(encolado);
          return;
        }
        const reloj = setTimeout(
          () => falla(new Error(`no llegó ningún aviso por la conexión abierta en ${PLAZO_DEL_AVISO_MS} ms`)),
          PLAZO_DEL_AVISO_MS,
        );
        esperando.push((n) => {
          clearTimeout(reloj);
          listo(n);
        });
      }),
    cerrar: () => control.abort(),
  };
}

async function estadoDe(cajaModulo: string) {
  const { rows } = await baseViva().query<{ estado_caja: string | null; reabierta_por: string | null }>(
    'SELECT estado_caja, reabierta_por FROM modulos_caja WHERE caja_modulo = $1',
    [cajaModulo],
  );
  return rows[0];
}

async function contar(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await baseViva().query<{ n: number | string }>(sql, params as never[]);
  return Number(rows[0].n);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'secreto-de-prueba-suficientemente-largo-1234567890';
  process.env.PG_HOST ??= 'memoria';
  process.env.PG_USER ??= 'prueba';
  process.env.PG_PASSWORD ??= 'prueba';

  await reiniciarBase();
  const personas: [typeof LIDER, string, string][] = [
    [LIDER, 'LIDER', 'BARRANQUILLA'],
    [TECNICA, 'TECNICA', 'BARRANQUILLA'],
    [LIDER_BOGOTA, 'LIDER', 'BOGOTA'],
  ];
  for (const [persona, rol, sede] of personas) {
    await baseViva().query(
      'INSERT INTO users (nombre, cc, contrasena, rol, sede) VALUES ($1, $2, $3, $4, $5)',
      [persona.nombre, persona.cc, await bcrypt.hash(persona.contrasena, 10), rol, sede],
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
  // Las conexiones abiertas de eventos mantendrían vivo el servidor.
  servidor?.closeAllConnections?.();
  await new Promise((fin) => servidor?.close(() => fin(undefined)));
});

describe('reabrir una caja terminada: la técnica pide, el líder autoriza', () => {
  it('el aviso le llega al líder al instante, y a la técnica cuando la caja está disponible', async () => {
    const lider = sesion();
    await json(lider, 'POST', '/login', { cc: LIDER.cc, contrasena: LIDER.contrasena });
    const tec = sesion();
    await json(tec, 'POST', '/login', { cc: TECNICA.cc, contrasena: TECNICA.contrasena });
    const bogota = sesion();
    await json(bogota, 'POST', '/login', { cc: LIDER_BOGOTA.cc, contrasena: LIDER_BOGOTA.contrasena });

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
    const { rows } = await baseViva().query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(1)]);
    const cajaId = rows[0].id;

    // ── La técnica digita y da la caja por terminada ─────────────────────
    const registro = (upd: string, asunto: string) => ({
      caja: caja(1),
      upd,
      fecha_del_dato: fechaHoyLocal(),
      asunto_2: 'HISTORIA CLINICA',
      asunto_3: asunto,
      elaborado_por: firma(TECNICA),
      sede: 'BARRANQUILLA',
      nro_acta_transferible: ACTA,
    });
    await json(tec, 'POST', '/fuiddatosreal', registro('UPD7700001', 'PACIENTE 1'));
    expect((await estadoDe(caja(1))).estado_caja).toBe('EN PROCESO');

    // "La continúo otro día" ya no existe.
    const continua = await fallo(tec, 'POST', `/modulos_caja/${cajaId}/jornada`, { resultado: 'CONTINUA' });
    expect(continua.status, '"la continúo otro día" se retiró').toBe(400);
    expect((await estadoDe(caja(1))).estado_caja).toBe('EN PROCESO');

    await json(tec, 'POST', `/modulos_caja/${cajaId}/jornada`, { resultado: 'TERMINADA' });
    expect((await estadoDe(caja(1))).estado_caja).toBe('FINALIZADO');

    // ── Lo que la técnica NO puede hacer: reabrirla por su cuenta ─────────
    const aMano = await fallo(tec, 'PATCH', `/modulos_caja/${cajaId}/cambiarEstado`, { estado_caja: 'EN PROCESO' });
    expect(aMano.status, 'cambiar el estado a mano no reabre').toBe(403);
    expect(aMano.code).toBe('REAPERTURA_REQUIERE_LIDER');
    expect(aMano.error).toContain('autorización del líder');

    const digitando = await fallo(tec, 'POST', '/fuiddatosreal', registro('UPD7700002', 'PACIENTE 2'));
    expect(digitando.status, 'digitar en una caja terminada tampoco la reabre').toBe(403);
    expect(digitando.code).toBe('REAPERTURA_REQUIERE_LIDER');
    expect(await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = $1', [caja(1)])).toBe(1);
    expect((await estadoDe(caja(1))).estado_caja).toBe('FINALIZADO');

    // ── La solicitud le llega al líder de la sede al instante ─────────────
    const oidoDelLider = await escuchar(lider);
    const oidoDeBogota = await escuchar(bogota);

    const pedida = await json<{ solicitud: Solicitud; nueva: boolean }>(
      tec,
      'POST',
      `/modulos_caja/${cajaId}/solicitar-reapertura`,
    );
    expect(pedida.nueva).toBe(true);
    expect(pedida.solicitud).toMatchObject({ caja_id: cajaId, caja_modulo: caja(1), estado: 'PENDIENTE', solicitante: firma(TECNICA) });

    const avisoAlLider = await oidoDelLider.siguiente();
    expect(avisoAlLider).toMatchObject({
      tipo: 'SOLICITUD_REAPERTURA',
      caja_id: cajaId,
      solicitud_id: pedida.solicitud.id,
    });
    expect(avisoAlLider.mensaje).toContain(caja(1));

    // En la campana también, para cuando no estaba conectado.
    const campanaDelLider = await json<{ notificaciones: Notificacion[]; sin_leer: number }>(lider, 'GET', '/notificaciones');
    expect(campanaDelLider.sin_leer).toBe(1);
    expect(campanaDelLider.notificaciones[0]).toMatchObject({ id: avisoAlLider.id, leida_en: null });

    // El líder de otra sede ni se entera ni puede atenderla.
    await expect(oidoDeBogota.siguiente()).rejects.toThrow('no llegó ningún aviso');
    expect(await json<Solicitud[]>(bogota, 'GET', '/solicitudes_reapertura?estado=PENDIENTE')).toEqual([]);
    const ajena = await fallo(bogota, 'POST', `/solicitudes_reapertura/${pedida.solicitud.id}/aprobar`);
    expect(ajena.status, 'un líder de otra sede no autoriza').toBe(403);
    expect((await estadoDe(caja(1))).estado_caja).toBe('FINALIZADO');

    // Volver a pedirla no duplica nada.
    const repetida = await json<{ solicitud: Solicitud; nueva: boolean }>(tec, 'POST', `/modulos_caja/${cajaId}/solicitar-reapertura`);
    expect(repetida.nueva).toBe(false);
    expect(repetida.solicitud.id).toBe(pedida.solicitud.id);
    expect(await contar('SELECT COUNT(*) AS n FROM solicitud_reapertura')).toBe(1);
    expect((await json<{ sin_leer: number }>(lider, 'GET', '/notificaciones')).sin_leer, 'un solo aviso').toBe(1);

    // Cada quien ve lo suyo.
    const pendientesDelLider = await json<Solicitud[]>(lider, 'GET', '/solicitudes_reapertura?estado=PENDIENTE');
    expect(pendientesDelLider.map((s) => s.id)).toEqual([pedida.solicitud.id]);
    const misSolicitudes = await json<Solicitud[]>(tec, 'GET', `/solicitudes_reapertura?caja_id=${cajaId}`);
    expect(misSolicitudes.map((s) => s.estado)).toEqual(['PENDIENTE']);

    // ── El líder aprueba: la caja se reabre y la técnica lo sabe al instante ──
    const oidoDeLaTecnica = await escuchar(tec);
    const aprobada = await json<{ solicitud: Solicitud; message: string }>(
      lider,
      'POST',
      `/solicitudes_reapertura/${pedida.solicitud.id}/aprobar`,
    );
    expect(aprobada.solicitud.estado).toBe('APROBADA');
    expect(await estadoDe(caja(1))).toEqual({ estado_caja: 'EN PROCESO', reabierta_por: firma(LIDER) });

    const avisoALaTecnica = await oidoDeLaTecnica.siguiente();
    expect(avisoALaTecnica).toMatchObject({ tipo: 'REAPERTURA_APROBADA', caja_id: cajaId, solicitud_id: pedida.solicitud.id });
    expect(avisoALaTecnica.mensaje).toContain('disponible para editar');

    const campanaDeLaTecnica = await json<{ notificaciones: Notificacion[]; sin_leer: number }>(tec, 'GET', '/notificaciones');
    expect(campanaDeLaTecnica.sin_leer).toBe(1);
    expect(campanaDeLaTecnica.notificaciones[0].tipo).toBe('REAPERTURA_APROBADA');

    // Y ya puede digitar.
    await json(tec, 'POST', '/fuiddatosreal', registro('UPD7700002', 'PACIENTE 2'));
    expect(await contar('SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = $1', [caja(1)])).toBe(2);

    // Leer los avisos los deja en cero; aprobar dos veces no se puede.
    await json(tec, 'POST', '/notificaciones/leidas', {});
    expect((await json<{ sin_leer: number }>(tec, 'GET', '/notificaciones')).sin_leer).toBe(0);
    expect((await fallo(lider, 'POST', `/solicitudes_reapertura/${pedida.solicitud.id}/aprobar`)).status).toBe(409);

    // ── El líder rechaza: la caja sigue terminada y la técnica lo sabe ────
    await json(tec, 'POST', `/modulos_caja/${cajaId}/jornada`, { resultado: 'TERMINADA' });
    const segunda = await json<{ solicitud: Solicitud }>(tec, 'POST', `/modulos_caja/${cajaId}/solicitar-reapertura`);
    await oidoDelLider.siguiente();
    await json(lider, 'POST', `/solicitudes_reapertura/${segunda.solicitud.id}/rechazar`);
    const rechazo = await oidoDeLaTecnica.siguiente();
    expect(rechazo).toMatchObject({ tipo: 'REAPERTURA_RECHAZADA', solicitud_id: segunda.solicitud.id });
    expect((await estadoDe(caja(1))).estado_caja).toBe('FINALIZADO');
    expect((await json<Solicitud[]>(tec, 'GET', `/solicitudes_reapertura?caja_id=${cajaId}`)).map((s) => s.estado)).toEqual([
      'RECHAZADA',
      'APROBADA',
    ]);

    // ── Si el líder la reabre a mano con una solicitud pendiente, vale igual ──
    const tercera = await json<{ solicitud: Solicitud }>(tec, 'POST', `/modulos_caja/${cajaId}/solicitar-reapertura`);
    await oidoDelLider.siguiente();
    const aMano2 = await json<{ message: string }>(lider, 'PATCH', `/modulos_caja/${cajaId}/cambiarEstado`, { estado_caja: 'EN PROCESO' });
    expect(aMano2.message).toContain(firma(TECNICA));
    const avisoPorReaperturaManual = await oidoDeLaTecnica.siguiente();
    expect(avisoPorReaperturaManual).toMatchObject({ tipo: 'REAPERTURA_APROBADA', solicitud_id: tercera.solicitud.id });
    expect(await estadoDe(caja(1))).toEqual({ estado_caja: 'EN PROCESO', reabierta_por: firma(LIDER) });
    expect(await contar("SELECT COUNT(*) AS n FROM solicitud_reapertura WHERE estado = 'PENDIENTE'")).toBe(0);

    // Una caja abierta no se pide.
    const abierta = await fallo(tec, 'POST', `/modulos_caja/${cajaId}/solicitar-reapertura`);
    expect(abierta.status).toBe(409);
    expect(abierta.code).toBe('CAJA_YA_ABIERTA');

    // ── Al cerrar las pestañas, el servidor suelta las conexiones ─────────
    oidoDelLider.cerrar();
    oidoDeBogota.cerrar();
    oidoDeLaTecnica.cerrar();
    const { conexionesAbiertas } = await import('../services/notificaciones.service.js');
    for (let intento = 0; intento < 20 && conexionesAbiertas() > 0; intento += 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(conexionesAbiertas(), 'ninguna conexión queda colgada').toBe(0);
  }, 180_000);
});
