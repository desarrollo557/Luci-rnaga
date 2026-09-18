import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';

/**
 * El historial de digitación de una caja, contra PostgreSQL de verdad.
 *
 * Esto nace de un caso concreto: un auxiliar dejó una caja a medias una tarde
 * y la retomó al día siguiente. Sus registros de la víspera seguían guardados,
 * pero la pantalla de la caja solo tenía una fecha —"Actualizada"— que se
 * había movido al día nuevo, así que parecía que la caja se hubiera empezado
 * esa mañana. Lo que se comprueba aquí es que cada día de trabajo sobrevive
 * como una fila propia, con lo que se hizo en él.
 *
 * Va contra una base real porque la consulta se apoya en cosas que un doble no
 * reproduce: el agrupado por fecha, el `FILTER` que descarta los UPD con otro
 * formato y el orden de las jornadas sin fecha.
 */

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
let db: PGlite;

/** Lanza el SQL del código —que usa `?`— contra PGlite, que usa `$n`. */
async function ejecutar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  let n = 0;
  const texto = sql.replace(/\?/g, () => `$${++n}`);
  const { rows } = await db.query(texto, params as never[], {
    parsers: { 1082: (v: string) => v, 1114: (v: string) => v, 20: (v: string) => Number(v) },
  });
  return rows as T[];
}

/** Lo que devuelve `queryResult`: cuántas filas cambió y el id insertado. */
async function ejecutarConResultado(sql: string, params: unknown[] = []) {
  let n = 0;
  const texto = sql.replace(/\?/g, () => `$${++n}`);
  const r = await db.query(texto, params as never[]);
  return { affectedRows: r.affectedRows ?? r.rows.length, insertId: 0 };
}

vi.mock('../../config/db.js', () => ({
  query: (sql: string, params: unknown[] = []) => ejecutar(sql, params),
  queryOne: async (sql: string, params: unknown[] = []) => (await ejecutar(sql, params))[0],
  queryResult: (sql: string, params: unknown[] = []) => ejecutarConResultado(sql, params),
  // La transacción no aporta nada en una base de prueba de un solo hilo: lo que
  // se comprueba es lo que queda escrito, no el aislamiento.
  withTransaction: (fn: (conn: unknown) => Promise<unknown>) =>
    fn({ query: ejecutar, queryResult: ejecutarConResultado }),
  getConnection: async () => {
    throw new Error('no hace falta una transacción en estas pruebas');
  },
}));

// La caja siempre está asignada: el permiso se prueba donde vive, no aquí.
vi.mock('../../services/jerarquia.service.js', () => ({
  tieneCajaAsignada: async () => true,
  fueraDeSuSede: async () => false,
  sedeDeActa: async () => null,
  sedeDeCaja: async () => null,
}));

const { listJornadasDeCaja, declararJornadaDeCaja } = await import('../modulosCaja.controller.js');
const { fechaHoyLocal } = await import('../../utils/format.js');

interface Jornada {
  fecha: string | null;
  colaborador: string | null;
  registros: number;
  upd_desde: string | null;
  upd_hasta: string | null;
  primera: string | null;
  ultima: string | null;
}

function respuesta() {
  const res = {
    body: undefined as unknown,
    codigo: 200,
    status(codigo: number) {
      this.codigo = codigo;
      return this;
    },
    json(cuerpo: unknown) {
      this.body = cuerpo;
      return this;
    },
  };
  return res as typeof res & Response;
}

async function historialDe(cajaId: number): Promise<Jornada[]> {
  const res = respuesta();
  await listJornadasDeCaja({ params: { id: String(cajaId) } } as unknown as Request, res);
  return res.body as Jornada[];
}

const CAJA = '054C004432';
const JORGE = 'JORGE BLANCO (1140822315)';
const SARA = 'SARA MEJIA (1012345678)';

beforeAll(async () => {
  db = new PGlite();
  for (const archivo of ['01-esquema.sql', '02-triggers.sql']) {
    await db.exec(fs.readFileSync(path.join(RAIZ, 'database', 'supabase', archivo), 'utf8'));
  }
  // Los mismos ajustes que el servidor aplica al arrancar: aquí viven las
  // columnas de cierre de la caja, que el volcado base todavía no trae.
  const { AJUSTES } = await import('../../config/esquema.js');
  for (const ajuste of AJUSTES) await db.exec(ajuste.sql);
});

beforeEach(async () => {
  await db.exec('TRUNCATE modulos_caja, fuiddatosreal, jornada_caja RESTART IDENTITY CASCADE');
  await db.exec(`
    INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja, fecha_trans_caja)
    VALUES ('${CAJA}', 'CLINICA', '178', '2026-09-01')
  `);
});

afterAll(async () => {
  await db?.close();
});

/** Guarda un registro como si esa persona lo hubiera digitado a esa hora. */
async function digitar(
  autor: string,
  instante: string,
  upd: string | null,
  caja: string = CAJA,
  fecha?: string | null,
) {
  await db.query(
    `INSERT INTO fuiddatosreal (fecha_del_dato, caja, upd, elaborado_por, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamp)`,
    [fecha === undefined ? instante.slice(0, 10) : fecha, caja, upd, autor, instante],
  );
}

describe('historial de digitación de una caja', () => {
  it('conserva el día anterior cuando la caja se retoma al siguiente', async () => {
    // El caso del auxiliar: una tarde larga y una continuación corta.
    await digitar(JORGE, '2026-09-17 14:23:37', 'UPD3737260');
    await digitar(JORGE, '2026-09-17 16:58:57', 'UPD3737261');
    await digitar(JORGE, '2026-09-18 07:53:49', 'UPD3737262');

    const historial = await historialDe(1);
    expect(historial).toHaveLength(2);
    expect(historial[0]).toMatchObject({
      fecha: '2026-09-17',
      colaborador: JORGE,
      registros: 2,
      upd_desde: 'UPD3737260',
      upd_hasta: 'UPD3737261',
    });
    expect(historial[1]).toMatchObject({ fecha: '2026-09-18', registros: 1 });
    // Lo que se perdía: el total de la caja es la suma de los dos días.
    expect(historial.reduce((suma, j) => suma + Number(j.registros), 0)).toBe(3);
  });

  it('separa a cada persona dentro del mismo día', async () => {
    await digitar(JORGE, '2026-09-17 08:00:00', 'UPD0000001');
    await digitar(SARA, '2026-09-17 14:00:00', 'UPD0000002');
    await digitar(SARA, '2026-09-17 15:00:00', 'UPD0000003');

    const historial = await historialDe(1);
    expect(historial.map((j) => [j.colaborador, Number(j.registros)])).toEqual([
      [JORGE, 1],
      [SARA, 2],
    ]);
  });

  it('las horas salen del reloj y el tramo de UPD del menor al mayor', async () => {
    await digitar(JORGE, '2026-09-17 08:05:00', 'UPD0000010');
    await digitar(JORGE, '2026-09-17 17:40:00', 'UPD0000004');

    const [jornada] = await historialDe(1);
    expect(jornada.upd_desde).toBe('UPD0000004');
    expect(jornada.upd_hasta).toBe('UPD0000010');
    expect(String(jornada.primera)).toContain('08:05');
    expect(String(jornada.ultima)).toContain('17:40');
  });

  it('un UPD con otro formato no ensancha el tramo, pero su registro sí cuenta', async () => {
    await digitar(JORGE, '2026-09-17 08:00:00', 'UPD0000050');
    await digitar(JORGE, '2026-09-17 09:00:00', 'N/A');

    const [jornada] = await historialDe(1);
    expect(Number(jornada.registros)).toBe(2);
    expect(jornada.upd_desde).toBe('UPD0000050');
    expect(jornada.upd_hasta).toBe('UPD0000050');
  });

  it('los registros sin fecha se cuentan igual, al final de la lista', async () => {
    await digitar(JORGE, '2026-09-17 08:00:00', 'UPD0000001');
    await digitar(JORGE, '2026-09-10 08:00:00', 'UPD0000002', CAJA, null);

    const historial = await historialDe(1);
    expect(historial.map((j) => j.fecha)).toEqual(['2026-09-17', null]);
    expect(historial.reduce((suma, j) => suma + Number(j.registros), 0)).toBe(2);
  });

  it('no mezcla el trabajo de otra caja', async () => {
    await db.exec(`
      INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja, fecha_trans_caja)
      VALUES ('054C004433', 'CLINICA', '178', '2026-09-01')
    `);
    await digitar(JORGE, '2026-09-17 08:00:00', 'UPD0000001');
    await digitar(JORGE, '2026-09-17 09:00:00', 'UPD0000002', '054C004433');

    expect(await historialDe(1)).toHaveLength(1);
    expect(Number((await historialDe(1))[0].registros)).toBe(1);
  });

  it('una caja sin digitar devuelve la lista vacía, no un error', async () => {
    expect(await historialDe(1)).toEqual([]);
  });
});

/** Quien digita, tal como llega en la sesión. */
const SESION = { id: 7, nombre: 'Jorge Blanco', cc: '1140822315', rol: 'TECNICA' };

/** Declara el cierre de la jornada de hoy sobre la caja. */
async function declarar(cajaId: number, resultado: string) {
  const res = respuesta();
  await declararJornadaDeCaja(
    {
      params: { id: String(cajaId) },
      body: { resultado },
      session: { user: SESION },
    } as unknown as Request,
    res,
  );
  return res;
}

describe('cierre de jornada declarado por quien digita', () => {
  it('deja registrado el día aunque la caja siga abierta mañana', async () => {
    const hoy = fechaHoyLocal();
    await digitar(JORGE, `${hoy} 08:00:00`, 'UPD0000001');
    await digitar(JORGE, `${hoy} 16:30:00`, 'UPD0000002');

    const res = await declarar(1, 'CONTINUA');
    expect(res.codigo).toBe(200);

    const { rows: jornadas } = await db.query<{
      resultado: string;
      registros: number;
      colaborador: string;
      usuario_id: number;
    }>('SELECT resultado, registros, colaborador, usuario_id FROM jornada_caja');
    const [jornada] = jornadas;
    expect(jornada).toMatchObject({
      resultado: 'CONTINUA',
      registros: 2,
      colaborador: JORGE,
      usuario_id: 7,
    });

    // Lo que importa: la caja NO se cierra, y aun así el día queda contado.
    const { rows: cajas } = await db.query<{ estado_caja: string }>(
      'SELECT estado_caja FROM modulos_caja WHERE id = 1',
    );
    expect(cajas[0].estado_caja).toBe('EN PROCESO');
    expect((await historialDe(1))[0]).toMatchObject({ resultado: 'CONTINUA', registros_declarados: 2 });
  });

  it('darla por terminada cierra la caja con la jornada de su último registro', async () => {
    const hoy = fechaHoyLocal();
    await digitar(JORGE, `${hoy} 08:00:00`, 'UPD0000001');

    await declarar(1, 'TERMINADA');

    const { rows: cajas } = await db.query<{
      estado_caja: string;
      fecha_finalizacion: string;
      finalizada_por: string;
    }>(
      `SELECT estado_caja, fecha_finalizacion::text AS fecha_finalizacion, finalizada_por
         FROM modulos_caja WHERE id = 1`,
    );
    expect(cajas[0]).toMatchObject({
      estado_caja: 'FINALIZADO',
      fecha_finalizacion: hoy,
      finalizada_por: JORGE,
    });
    expect((await historialDe(1))[0].resultado).toBe('TERMINADA');
  });

  it('cambiar de opinión el mismo día corrige lo declarado, no lo duplica', async () => {
    const hoy = fechaHoyLocal();
    await digitar(JORGE, `${hoy} 08:00:00`, 'UPD0000001');

    await declarar(1, 'CONTINUA');
    await declarar(1, 'TERMINADA');

    const filas = await db.query<{ resultado: string }>('SELECT resultado FROM jornada_caja');
    expect(filas.rows).toHaveLength(1);
    expect(filas.rows[0].resultado).toBe('TERMINADA');
  });

  it('cada persona cierra su propia jornada sobre la misma caja', async () => {
    const hoy = fechaHoyLocal();
    await digitar(JORGE, `${hoy} 08:00:00`, 'UPD0000001');
    await digitar(SARA, `${hoy} 09:00:00`, 'UPD0000002');
    await db.exec(
      `INSERT INTO jornada_caja (caja_modulo, fecha, colaborador, resultado, registros)
       VALUES ('${CAJA}', '${hoy}', '${SARA}', 'TERMINADA', 1)`,
    );

    await declarar(1, 'CONTINUA');

    const historial = await historialDe(1);
    expect(historial.map((j) => [j.colaborador, j.resultado])).toEqual([
      [JORGE, 'CONTINUA'],
      [SARA, 'TERMINADA'],
    ]);
  });

  it('un resultado que no existe se rechaza sin tocar nada', async () => {
    const res = await declarar(1, 'QUIZAS');
    expect(res.codigo).toBe(400);
    expect((await db.query('SELECT 1 FROM jornada_caja')).rows).toHaveLength(0);
  });

  it('una caja que no existe devuelve 404', async () => {
    expect((await declarar(999, 'TERMINADA')).codigo).toBe(404);
  });
});
