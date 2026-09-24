import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { AJUSTES } from '../../config/esquema.js';
import { consultaSeguimiento } from '../../controllers/reportes.controller.js';
import {
  CAJA_EN_PROCESO,
  CAJA_FINALIZADA,
  SQL_CERRAR_CAJA,
  cambiarEstadoCaja,
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
 * Se prueba el comportamiento que el usuario pidió: que ninguna caja se cierre
 * sola —solo quien la trabaja la da por terminada—, saber con qué caja empezó
 * cada persona, en cuál acabó, y que una caja que cruza de un día a otro no se
 * cuente dos veces.
 */

const TABLAS = `
  /*
   * Solo lo que tocan los ajustes de arranque y las consultas que se prueban.
   * Que 'users' esté aquí no es de adorno: los ajustes la modifican, y una
   * versión que se desplegó sin su migración dejó caída la pantalla de
   * Administración. Aplicarlos aquí contra PostgreSQL de verdad lo habría visto.
   */
  CREATE TABLE users (id serial PRIMARY KEY, nombre text, cc text, rol varchar(255));
  -- No la usa ninguna prueba de este archivo, pero sí uno de los ajustes de
  -- esquema, y aquí se aplican todos: sin la tabla, el ajuste falla y con él
  -- el montaje entero. Es la contrapartida de comprobar los ajustes de verdad.
  CREATE TABLE sub_modulos (
    id serial PRIMARY KEY, codigo text, entidad_remitente text, sede_submodulos text);
  CREATE TABLE moduloscliente (
    id serial PRIMARY KEY, codigo text, acta_transferencia_modulo text,
    fecha_trans_modulo date, created_at timestamp DEFAULT now());
  CREATE TABLE modulos_caja (
    id serial PRIMARY KEY, caja_modulo text, id_modulo_caja int, estado_caja varchar(255));
  CREATE TABLE fuiddatosreal (
    id serial PRIMARY KEY, fecha_del_dato date, caja text, upd text,
    elaborado_por text, nro_acta_transferible text, created_at timestamptz);
  CREATE TABLE asignacion_caja_tecnica (
    id serial PRIMARY KEY, modulo_id int, usuario_id int, upd_inicio text, ultimo_upd text);
`;

const ANA = 'ANA PEREZ (111)';
const BETO = 'BETO GOMEZ (222)';
const LIDIA = 'LIDIA LIDER (444)';
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
  const r = await db.query(numerar(sql), params as never[]);
  return r.affectedRows ?? 0;
};

/** Una persona guarda un registro en una caja: es lo único que hace en el software. */
async function digitar(fecha: string, numeroDeCaja: number, autor: string, upd?: number) {
  reloj += 1;
  await db.query(
    `INSERT INTO fuiddatosreal (fecha_del_dato, caja, upd, elaborado_por, created_at)
     VALUES ($1, $2, $3, $4, $1::date + ($5 || ' minutes')::interval)`,
    [fecha, caja(numeroDeCaja), `UPD${String(upd ?? 1000 + reloj).padStart(7, '0')}`, autor, String(reloj)],
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

beforeAll(async () => {
  // Una sola base para todo el archivo: levantar PostgreSQL cuesta un segundo y
  // hacerlo trece veces se nota en la integración continua.
  db = new PGlite();
  await db.exec(TABLAS);
  for (const ajuste of AJUSTES) await db.exec(ajuste.sql);
});

beforeEach(async () => {
  reloj = 0;
  await db.exec(
    'TRUNCATE fuiddatosreal, modulos_caja, moduloscliente, jornada_caja, asignacion_caja_tecnica RESTART IDENTITY',
  );
  await db.exec(`INSERT INTO moduloscliente (codigo, acta_transferencia_modulo) VALUES ('051', 'ACTA-7')`);
  for (let n = 2400; n <= 2412; n += 1) {
    await db.query('INSERT INTO modulos_caja (caja_modulo, id_modulo_caja, estado_caja) VALUES ($1, 1, NULL)', [caja(n)]);
  }
});

afterAll(async () => {
  await db?.close();
});

describe('ciclo de vida de la caja', () => {
  it('abre la caja en la que se digita', async () => {
    await digitar(LUNES, 2406, ANA);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_EN_PROCESO);
  });

  it('pasar a otra caja no cierra la anterior: solo la persona la cierra', async () => {
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2407, ANA);
    await digitar(LUNES, 2408, ANA);

    // Hubo una versión que cerraba aquí la 2406 y la 2407, y se retiró: quien
    // sabe si una caja está terminada es quien la tiene en las manos.
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null });
    expect(await estadoDe(2407)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null });
    expect(await estadoDe(2408)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null });
  });

  it('el cambio de día tampoco la cierra: se continúa sin pedir nada', async () => {
    await digitar(LUNES, 2406, ANA);
    await digitar(MARTES, 2407, ANA);
    await digitar(MARTES, 2406, ANA);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null });
  });

  it('terminarla se atribuye al día de su último registro, no al día en que se cierra', async () => {
    await digitar(LUNES, 2406, ANA);
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2406)]);
    // La da por terminada el martes, pero el trabajo fue del lunes.
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_FINALIZADA);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_FINALIZADA, cierre: LUNES, finalizada_por: ANA });
  });

  it('digitar en una caja terminada la reabre: es lo que hace el líder (a la técnica se lo impide el controlador)', async () => {
    await digitar(LUNES, 2406, ANA);
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2406)]);
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_FINALIZADA);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_FINALIZADA);

    await digitar(MARTES, 2406, ANA);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null, finalizada_por: null });
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

  it('terminarla deja el cierre anotado en la jornada de su último registro', async () => {
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2406, ANA);
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2406)]);
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_FINALIZADA);

    const { rows: jornadas } = await db.query<{ fecha: string; colaborador: string; resultado: string; registros: number }>(
      'SELECT fecha::text AS fecha, colaborador, resultado, registros FROM jornada_caja WHERE caja_modulo = $1',
      [caja(2406)],
    );
    expect(jornadas).toEqual([{ fecha: LUNES, colaborador: ANA, resultado: 'TERMINADA', registros: 2 }]);
  });

  /*
   * Reabrir no toca el consecutivo. Llegó a borrarse el arranque para que la
   * digitación pidiera uno nuevo, y se quitó: muchas reaperturas son para
   * corregir un registro, no para seguir digitando, y perder el consecutivo de
   * quien solo venía a arreglar algo era un trámite de más.
   */
  it('reabrirla deja intacto el arranque de UPD: se retoma donde se dejó', async () => {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2406)]);
    await db.query(
      `INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id, upd_inicio, ultimo_upd)
       VALUES ($1, 1, 'UPD0001000', 'UPD0001003')`,
      [rows[0].id],
    );
    await digitar(LUNES, 2406, ANA);
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_FINALIZADA);
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_EN_PROCESO);

    const { rows: asignaciones } = await db.query<{ upd_inicio: string | null; ultimo_upd: string | null }>(
      'SELECT upd_inicio, ultimo_upd FROM asignacion_caja_tecnica WHERE modulo_id = $1',
      [rows[0].id],
    );
    expect(asignaciones).toEqual([{ upd_inicio: 'UPD0001000', ultimo_upd: 'UPD0001003' }]);
  });

  it('no hace nada si falta la caja o el autor', async () => {
    await registrarDigitacion(ejecutar, null, ANA);
    await registrarDigitacion(ejecutar, caja(2406), null);
    expect((await estadoDe(2406)).estado_caja).toBeNull();
  });
});

/*
 * La reapertura por el líder: abre la caja y deja firmado quién y cuándo, que
 * es lo que autoriza a la técnica a corregir sus registros de días anteriores.
 * La firma dura lo que dura la caja abierta: cualquier cierre la borra.
 */
describe('reapertura de la caja por el líder', () => {
  async function idDe(numeroDeCaja: number) {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(numeroDeCaja)]);
    return rows[0].id;
  }
  async function marcasDe(numeroDeCaja: number) {
    const { rows } = await db.query<{ reabierta_por: string | null; reabierta_el: string | null }>(
      'SELECT reabierta_por, reabierta_el::text AS reabierta_el FROM modulos_caja WHERE caja_modulo = $1',
      [caja(numeroDeCaja)],
    );
    return rows[0];
  }
  const reabrePorLider = async (numeroDeCaja: number, dia: string) =>
    cambiarEstadoCaja(ejecutar, await idDe(numeroDeCaja), CAJA_EN_PROCESO, { por: LIDIA, el: dia });
  /** La técnica da la caja por terminada: la única forma en que se cierra. */
  const cierraLaTecnica = async (numeroDeCaja: number) =>
    cambiarEstadoCaja(ejecutar, await idDe(numeroDeCaja), CAJA_FINALIZADA);

  it('deja escrito quién la reabrió y qué día, y la caja vuelve a estar en proceso', async () => {
    await digitar(LUNES, 2406, ANA);
    await cierraLaTecnica(2406);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_FINALIZADA);

    await reabrePorLider(2406, MARTES);
    expect(await estadoDe(2406)).toMatchObject({ estado_caja: CAJA_EN_PROCESO, cierre: null, finalizada_por: null });
    expect(await marcasDe(2406)).toEqual({ reabierta_por: LIDIA, reabierta_el: MARTES });
  });

  it('la reapertura de la técnica, sin firma, no deja marca', async () => {
    await digitar(LUNES, 2406, ANA);
    await cierraLaTecnica(2406);
    await cambiarEstadoCaja(ejecutar, await idDe(2406), CAJA_EN_PROCESO);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_EN_PROCESO);
    expect(await marcasDe(2406)).toEqual({ reabierta_por: null, reabierta_el: null });
  });

  it('pasar a otra caja no la cierra ni borra la marca: sigue reabierta', async () => {
    await digitar(LUNES, 2406, ANA);
    await cierraLaTecnica(2406);
    await reabrePorLider(2406, MARTES);
    await digitar(MARTES, 2407, ANA);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_EN_PROCESO);
    expect(await marcasDe(2406)).toEqual({ reabierta_por: LIDIA, reabierta_el: MARTES });
  });

  it('el cierre a mano también la borra', async () => {
    await digitar(LUNES, 2406, ANA);
    await reabrePorLider(2406, MARTES);
    await cambiarEstadoCaja(ejecutar, await idDe(2406), CAJA_FINALIZADA);
    expect((await estadoDe(2406)).estado_caja).toBe(CAJA_FINALIZADA);
    expect(await marcasDe(2406)).toEqual({ reabierta_por: null, reabierta_el: null });
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
      upd_ini: number | null;
      upd_fin: number | null;
      total_cajas: string | number;
      total_registros: string | number;
    }>(consultaSeguimiento('TRUE'));
    return rows.map((f) => ({
      quien: f.colaborador,
      ini: f.caja_ini,
      fin: f.caja_fin,
      updIni: f.upd_ini,
      updFin: f.upd_fin,
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

    // Las tres cuentan el lunes: el último registro de cada una es de ese día.
    expect(await informe()).toEqual([
      { quien: ANA, ini: 2406, fin: 2408, updIni: 1001, updFin: 1004, cerradas: 3, registros: 4 },
    ]);

    // Martes: retoma la 2408, la termina, y sigue con dos más.
    await digitar(MARTES, 2408, ANA);
    await digitar(MARTES, 2409, ANA);
    await digitar(MARTES, 2410, ANA);

    const filas = await informe();
    // La caja que cruzó de un día a otro se ve sola: es final del lunes e inicial
    // del martes. Y deja de contar el lunes para contar el martes, que es cuando
    // se terminó: el lunes baja de tres a dos.
    expect(filas).toEqual([
      { quien: ANA, ini: 2406, fin: 2408, updIni: 1001, updFin: 1004, cerradas: 2, registros: 4 },
      { quien: ANA, ini: 2408, fin: 2410, updIni: 1005, updFin: 1007, cerradas: 3, registros: 3 },
    ]);
    // Cinco cajas trabajadas, cinco contadas, ninguna dos veces.
    expect(filas.reduce((suma, f) => suma + f.cerradas, 0)).toBe(5);
  });

  it('cerrada un día y reabierta al siguiente, la caja cuenta los dos días', async () => {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = $1', [caja(2406)]);
    // Lunes: dos registros y la da por terminada.
    await digitar(LUNES, 2406, ANA);
    await digitar(LUNES, 2406, ANA);
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_FINALIZADA);
    // Martes: la reabre, sigue y la vuelve a terminar.
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_EN_PROCESO);
    await digitar(MARTES, 2406, ANA);
    await cambiarEstadoCaja(ejecutar, rows[0].id, CAJA_FINALIZADA);

    // El lunes no pierde su caja por haberla retomado el martes.
    expect(await informe()).toEqual([
      { quien: ANA, ini: 2406, fin: 2406, updIni: 1001, updFin: 1002, cerradas: 1, registros: 2 },
      { quien: ANA, ini: 2406, fin: 2406, updIni: 1003, updFin: 1003, cerradas: 1, registros: 1 },
    ]);
  });

  it('la caja compartida cuenta para quien digitó su último registro, no para las dos', async () => {
    await digitar(LUNES, 2411, ANA);
    await digitar(LUNES, 2411, BETO);
    await digitar(LUNES, 2412, ANA);

    const filas = await informe();
    // La 2411 cuenta solo para Beto, que digitó su último registro, y la 2412
    // para Ana. La caja compartida no se cuenta dos veces.
    expect(filas.find((f) => f.quien === BETO)).toMatchObject({ cerradas: 1 });
    expect(filas.find((f) => f.quien === ANA)).toMatchObject({ cerradas: 1 });
    expect(filas.reduce((suma, f) => suma + f.cerradas, 0)).toBe(2);
    // En pantalla sigue abierta, porque Beto no se ha movido de ella. Eso es
    // información para él, no un número del informe.
    expect((await estadoDe(2411)).estado_caja).toBe(CAJA_EN_PROCESO);
  });

  it('el cambio de lista de UPD parte la jornada en dos filas, con su rango cada una', async () => {
    // La técnica digita en la misma caja, se le acaba la lista y le dan otra que
    // arranca en otra serie. Antes esto salía en una sola fila que iba del
    // primer UPD al último, dando a entender que se habían usado millones.
    for (const upd of [2950001, 2950002, 2950003]) await digitar(LUNES, 2406, ANA, upd);
    for (const upd of [3100001, 3100002]) await digitar(LUNES, 2406, ANA, upd);

    const filas = await informe();
    expect(filas).toEqual([
      { quien: ANA, ini: 2406, fin: 2406, updIni: 2950001, updFin: 2950003, cerradas: 0, registros: 3 },
      { quien: ANA, ini: 2406, fin: 2406, updIni: 3100001, updFin: 3100002, cerradas: 1, registros: 2 },
    ]);
    // La caja cuenta una sola vez, en el tramo donde está su último registro.
    expect(filas.reduce((suma, f) => suma + f.cerradas, 0)).toBe(1);
  });

  it('un número salteado no parte la fila: eso pasa a diario y no es otra lista', async () => {
    // Entre el 2950002 y el 2950004 falta uno, como cuando un UPD se repetía o
    // se borró después. Sigue siendo la misma lista.
    for (const upd of [2950001, 2950002, 2950004, 2950005]) await digitar(LUNES, 2406, ANA, upd);

    const filas = await informe();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ updIni: 2950001, updFin: 2950005, registros: 4 });
  });

  it('el salto se ve aunque la técnica cambie de caja dentro del mismo tramo', async () => {
    for (const upd of [2950001, 2950002]) await digitar(LUNES, 2406, ANA, upd);
    await digitar(LUNES, 2407, ANA, 2950003);
    // Lista nueva, y sigue en la misma caja 2407.
    await digitar(LUNES, 2407, ANA, 4500001);

    const filas = await informe();
    expect(filas).toEqual([
      { quien: ANA, ini: 2406, fin: 2407, updIni: 2950001, updFin: 2950003, cerradas: 1, registros: 3 },
      { quien: ANA, ini: 2407, fin: 2407, updIni: 4500001, updFin: 4500001, cerradas: 1, registros: 1 },
    ]);
  });

  it('el primero y el último no son el menor y el mayor, sino el orden en que se trabajó', async () => {
    await digitar(LUNES, 2410, ANA);
    await digitar(LUNES, 2406, ANA);
    const [fila] = await informe();
    expect(fila).toMatchObject({ ini: 2410, fin: 2406 });
  });
});
