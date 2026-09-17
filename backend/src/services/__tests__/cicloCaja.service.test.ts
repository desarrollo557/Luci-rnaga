import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { AJUSTES } from '../../config/esquema.js';
import { SEGUIMIENTO_AGRUPACION, SEGUIMIENTO_QUERY } from '../../controllers/reportes.controller.js';
import {
  CAJA_EN_PROCESO,
  CAJA_FINALIZADA,
  SQL_CERRAR_CAJA,
  registrarDigitacion,
} from '../cicloCaja.service.js';

/**
 * Ciclo de vida de la caja, contra un PostgreSQL de verdad.
 *
 * Estas consultas no se pueden comprobar con un doble de la base: toda su
 * lógica está dentro del SQL —un LATERAL que busca el último registro, un
 * `DISTINCT ON`, la elección de la fecha— y un doble solo demostraría que se
 * llamó a la función. Por eso la prueba levanta PostgreSQL en memoria, crea las
 * tablas que hacen falta y reproduce dos jornadas de trabajo reales.
 *
 * Se prueba el comportamiento que el usuario pidió: saber con qué caja empezó
 * cada persona, en cuál acabó, cuál quedó a medias para el día siguiente, y que
 * una caja que cruza de un día a otro no se cuente dos veces.
 */

const TABLAS = `
  /*
   * Solo lo que tocan los ajustes de arranque y las consultas que se prueban.
   * Que 'users' esté aquí no es de adorno: los ajustes la modifican, y una
   * versión que se desplegó sin su migración dejó caída la pantalla de
   * Administración. Aplicarlos aquí contra PostgreSQL de verdad lo habría visto.
   */
  CREATE TABLE users (id serial PRIMARY KEY, nombre text, cc text, rol varchar(255));
  CREATE TABLE moduloscliente (id serial PRIMARY KEY, codigo text, acta_transferencia_modulo text);
  CREATE TABLE modulos_caja (
    id serial PRIMARY KEY, caja_modulo text, id_modulo_caja int, estado_caja varchar(255));
  CREATE TABLE fuiddatosreal (
    id serial PRIMARY KEY, fecha_del_dato date, caja text, upd text,
    elaborado_por text, nro_acta_transferible text, created_at timestamptz);
`;

const ANA = 'ANA PEREZ (111)';
const BETO = 'BETO GOMEZ (222)';
const LUNES = '2026-09-14';
const MARTES = '2026-09-15';
const caja = (n: number) => `051C${String(n).padStart(6, '0')}`;

let db: PGlite;
let reloj = 0;

/** Traduce los `?` del código a los `$n` de PostgreSQL, como hace la capa de datos. */
const numerar = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};
const ejecutar = async (sql: string, params: unknown[] = []) => {
  await db.query(numerar(sql), params as never[]);
};

/** Una persona guarda un registro en una caja: es lo único que hace en el software. */
async function digitar(fecha: string, numeroDeCaja: number, autor: string) {
  reloj += 1;
  await db.query(
    `INSERT INTO fuiddatosreal (fecha_del_dato, caja, upd, elaborado_por, created_at)
     VALUES ($1, $2, $3, $4, $1::date + ($5 || ' minutes')::interval)`,
    [fecha, caja(numeroDeCaja), `UPD${1000 + reloj}`, autor, String(reloj)],
  );
  await registrarDigitacion(ejecutar, caja(numeroDeCaja), autor);
}

async function estadoDe(numeroDeCaja: number) {
  const { rows } = await db.query<{ estado_caja: string; cierre: string | null; finalizada_por: string | null }>(
    `SELECT estado_caja, fecha_finalizacion::text AS cierre, finalizada_por
       FROM modulos_caja WHERE caja_modulo = $1`,
    [caja(numeroDeCaja)],
  );
  return rows[0];
}

beforeEach(async () => {
  db = new PGlite();
  reloj = 0;
  await db.exec(TABLAS);
  await db.exec(`INSERT INTO moduloscliente (codigo, acta_transferencia_modulo) VALUES ('051', 'ACTA-7')`);
  for (let n = 2400; n <= 2412; n += 1) {
    await db.query('INSERT INTO modulos_caja (caja_modulo, id_modulo_caja, estado_caja) VALUES ($1, 1, NULL)', [caja(n)]);
  }
  // Las columnas las crea el propio arranque: así se prueba el ajuste real.
  for (const ajuste of AJUSTES) await db.exec(ajuste.sql);
});

afterAll(async () => {
  await db?.close();
});

describe('ciclo de vida de la caja', () => {
  it('abre la caja en la que se digita', async () => {
    await digitar(LUNES, 2406, ANA);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_EN_PROCESO);
  });

  it('cierra la caja anterior al empezar otra, y deja abierta solo la actual', async () => {
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2407, ANA);
    await digitar(LUNES, 2408, ANA);

    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_FINALIZADA, cierre: LUNES, finalizada_por: ANA });
    expect(await estadoDe(2407)).toMatchObject({ estado_caja: CAJA_FINALIZADA, cierre: LUNES });
    // La última del día se queda abierta: es la que se continúa mañana.
    expect(await estadoDe(2408)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null });
  });

  it('atribuye el cierre al día del último registro, no al día en que se cierra', async () => {
    await digitar(LUNES, 2406, ANA);
    // Se va el lunes con la caja abierta y el martes empieza otra distinta.
    await digitar(MARTES, 2407, ANA);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_FINALIZADA, cierre: LUNES });
  });

  it('reabre la caja si alguien vuelve a digitar en ella', async () => {
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2407, ANA);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_FINALIZADA);

    await digitar(MARTES, 2406, ANA);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null });

    // Y al pasar a otra vuelve a cerrarse, ahora con la fecha nueva.
    await digitar(MARTES, 2408, ANA);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_FINALIZADA, cierre: MARTES });
  });

  it('no cierra la caja de otra persona que sigue trabajando en ella', async () => {
    await digitar(LUNES, 2411, ANA);
    await digitar(LUNES, 2411, BETO);
    // Ana pasa a otra caja, pero el último registro de la 2411 es de Beto.
    await digitar(LUNES, 2412, ANA);
    expect(await estadoDe(2411)).toMatchObject({ estado_caja: CAJA_EN_PROCESO });
  });

  it('el cierre a mano también se atribuye a quien digitó el último registro', async () => {
    await digitar(LUNES, 2411, ANA);
    await digitar(LUNES, 2411, BETO);
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2411)]);
    await ejecutar(SQL_CERRAR_CAJA, [rows[0].id]);
    expect(await estadoDe(2411)).toMatchObject({ estado_caja: CAJA_FINALIZADA, cierre: LUNES, finalizada_por: BETO });
  });

  it('una caja sin registros se cierra con el día de hoy y sin nadie a quien atribuirla', async () => {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2400)]);
    await ejecutar(SQL_CERRAR_CAJA, [rows[0].id]);
    const estado = await estadoDe(2400);
    expect(estado.estado_caja).toBe(CAJA_FINALIZADA);
    expect(estado.cierre).not.toBeNull();
    expect(estado.finalizada_por).toBeNull();
  });

  it('no hace nada si falta la caja o el autor', async () => {
    await registrarDigitacion(ejecutar, null, ANA);
    await registrarDigitacion(ejecutar, caja(2406), null);
    expect((await estadoDe(2406)).estado_caja).toBeNull();
  });
});

describe('ajustes de arranque', () => {
  it('se pueden aplicar dos veces seguidas sin fallar', async () => {
    for (const ajuste of AJUSTES) await expect(db.exec(ajuste.sql)).resolves.toBeDefined();
  });

  it('rellena la jornada de cierre de las cajas finalizadas antes de este cambio', async () => {
    // Una caja como las que ya existen en producción: finalizada, sin fecha.
    await db.query(`UPDATE modulos_caja SET estado_caja = 'FINALIZADO', fecha_finalizacion = NULL WHERE caja_modulo = $1`, [caja(2400)]);
    await db.query(
      `INSERT INTO fuiddatosreal (fecha_del_dato, caja, upd, elaborado_por, created_at)
       VALUES ($1, $2, 'UPD0000001', $3, '2026-09-10 10:00-05')`,
      ['2026-09-10', caja(2400), ANA],
    );

    for (const ajuste of AJUSTES) await db.exec(ajuste.sql);

    // Sin esto, los seguimientos de fechas anteriores saldrían con cero cajas.
    expect(await estadoDe(2400)).toMatchObject({ cierre: '2026-09-10', finalizada_por: ANA });
  });
});

/**
 * Las tres columnas de caja del formato oficial, calculadas sobre las mismas
 * jornadas que arriba. Es la prueba que de verdad importa: lo que el cliente
 * recibe en el Excel.
 */
describe('columnas del seguimiento de inventario', () => {
  const informe = async () => {
    const { rows } = await db.query<{
      fecha: string;
      colaborador: string;
      caja_ini: number | null;
      caja_fin: number | null;
      total_cajas: string | number;
      total_registros: string | number;
    }>(`${SEGUIMIENTO_QUERY} WHERE TRUE ${SEGUIMIENTO_AGRUPACION}`);
    return rows.map((f) => ({
      quien: f.colaborador,
      ini: f.caja_ini,
      fin: f.caja_fin,
      cerradas: Number(f.total_cajas),
      registros: Number(f.total_registros),
    }));
  };

  it('dice con qué caja se empezó, en cuál se acabó y cuántas quedaron terminadas', async () => {
    // Lunes: tres cajas, la última queda a medias.
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2407, ANA);
    await digitar(LUNES, 2408, ANA);

    expect(await informe()).toEqual([{ quien: ANA, ini: 2406, fin: 2408, cerradas: 2, registros: 4 }]);

    // Martes: retoma la 2408, la termina, y sigue con dos más.
    await digitar(MARTES, 2408, ANA);
    await digitar(MARTES, 2409, ANA);
    await digitar(MARTES, 2410, ANA);

    const filas = await informe();
    // La caja que cruzó de un día a otro se ve sola: cierra el lunes y abre el martes.
    expect(filas).toEqual([
      { quien: ANA, ini: 2406, fin: 2408, cerradas: 2, registros: 4 },
      { quien: ANA, ini: 2408, fin: 2410, cerradas: 2, registros: 3 },
    ]);
    // Y no se cuenta dos veces: cuatro cajas cerradas en total, la 2410 sigue abierta.
    expect(filas.reduce((suma, f) => suma + f.cerradas, 0)).toBe(4);
  });

  it('la caja compartida cuenta para quien digitó su último registro, no para las dos', async () => {
    await digitar(LUNES, 2411, ANA);
    await digitar(LUNES, 2411, BETO);
    await digitar(LUNES, 2412, ANA);

    const filas = await informe();
    expect(filas.find((f) => f.quien === ANA)).toMatchObject({ cerradas: 0 });
    expect(filas.find((f) => f.quien === BETO)).toMatchObject({ cerradas: 0 });
    // La 2411 sigue abierta porque Beto no se ha movido; nadie la cuenta todavía.
    expect((await estadoDe(2411)).estado_caja).toBe(CAJA_EN_PROCESO);

    // Cuando Beto pasa a otra caja, la 2411 se cierra y cuenta solo para él.
    await digitar(LUNES, 2410, BETO);
    const despues = await informe();
    expect(despues.find((f) => f.quien === BETO)?.cerradas).toBe(1);
    // Ana no se lleva nada: la 2412, la única que ella tiene, sigue abierta.
    expect(despues.find((f) => f.quien === ANA)?.cerradas).toBe(0);
  });

  it('el primero y el último no son el menor y el mayor, sino el orden en que se trabajó', async () => {
    await digitar(LUNES, 2410, ANA);
    await digitar(LUNES, 2406, ANA);
    const [fila] = await informe();
    expect(fila).toMatchObject({ ini: 2410, fin: 2406 });
  });
});
