import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';

/**
 * Quién está trabajando y cómo va su jornada, contra PostgreSQL de verdad.
 *
 * La consulta cruza dos cosas que no viven juntas —la presencia, que está en
 * `users`, y el trabajo, que está en `fuiddatosreal`— con un `FULL JOIN` y una
 * extracción de la cédula desde un texto. Nada de eso se puede comprobar con un
 * doble de la base: o se ejecuta, o no se sabe si funciona.
 *
 * Lo que se prueba es lo que el líder necesita responder de un vistazo: quién
 * entró, a qué hora guardó el primer registro, a qué hora el último, cuántos
 * lleva y si sigue ahí.
 */

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
let db: PGlite;

vi.mock('../../config/db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    // Los `?` del código son la notación de la capa de datos; PGlite usa $n.
    let n = 0;
    const texto = sql.replace(/\?/g, () => `$${++n}`);
    const { rows } = await db.query(texto, params as never[], {
      parsers: { 1082: (v: string) => v, 1114: (v: string) => v, 20: (v: string) => Number(v) },
    });
    return rows;
  },
}));

const { actividadDelEquipo, marcarEscribiendo } = await import('../actividad.controller.js');

const AHORA = '2026-09-18 10:30:00';
const HOY = '2026-09-18';

function peticion(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function respuesta() {
  const res = { body: undefined as unknown, json(cuerpo: unknown) { this.body = cuerpo; return this; } };
  return res as typeof res & Response;
}

type Persona = {
  ultima_escritura: string | null;
  caja_escribiendo: string | null;
  nombre: string;
  cc: string | null;
  registros: number;
  cajas: number;
  primer_registro: string | null;
  ultimo_registro: string | null;
  ultima_actividad: string | null;
  es_usuario: boolean;
  rol: string | null;
};

async function consultar(filtros: Record<string, string> = {}): Promise<Persona[]> {
  const res = respuesta();
  await actividadDelEquipo(peticion(filtros), res);
  return (res.body as { personas: Persona[] }).personas;
}

const quien = (personas: Persona[], nombre: string) => personas.find((p) => p.nombre === nombre);

beforeAll(async () => {
  // Una sola base para todo el archivo: levantar PostgreSQL cuesta un segundo, y
  // hacerlo once veces se nota cuando la suite entera corre en paralelo.
  db = new PGlite();
  for (const archivo of ['01-esquema.sql', '02-triggers.sql']) {
    await db.exec(fs.readFileSync(path.join(RAIZ, 'database', 'supabase', archivo), 'utf8'));
  }
  for (const columna of [
    'ultima_actividad timestamp',
    'ultima_escritura timestamp',
    'caja_escribiendo varchar(255)',
  ]) {
    await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${columna}`);
  }
});

beforeEach(async () => {
  // CASCADE porque otras tablas apuntan a `users` con clave foránea; en una
  // base de prueba vaciarlas también es justo lo que se quiere.
  await db.exec('TRUNCATE users, fuiddatosreal RESTART IDENTITY CASCADE');

  await db.exec(`
    INSERT INTO users (nombre, cc, contrasena, rol, sede, ultima_actividad) VALUES
      ('ANA PEREZ',    '111', 'x', 'TECNICA', 'BARRANQUILLA', '${AHORA}'),
      ('BETO GOMEZ',   '222', 'x', 'TECNICA', 'BARRANQUILLA', '2026-09-18 07:05:00'),
      ('CARO DIAZ',    '333', 'x', 'TECNICA', 'BOGOTA',       NULL),
      ('LIDIA LIDER',  '444', 'x', 'LIDER',   'BARRANQUILLA', '${AHORA}');
  `);
});

afterAll(async () => {
  await db?.close();
});

/** Guarda un registro como si lo hubiera digitado esa persona a esa hora. */
async function digitar(cc: string, nombre: string, caja: string, instante: string, upd: number) {
  await db.query(
    `INSERT INTO fuiddatosreal (fecha_del_dato, caja, upd, elaborado_por, created_at)
     VALUES ($1::timestamp::date, $2, $3, $4, $1::timestamp)`,
    [instante, caja, 'UPD' + String(upd).padStart(7, '0'), `${nombre} (${cc})`],
  );
}

describe('actividad del equipo', () => {
  it('dice a qué hora empezó, a qué hora fue lo último y cuánto lleva', async () => {
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-18 08:02:00', 1);
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-18 09:15:00', 2);
    await digitar('111', 'ANA PEREZ', '051C000002', '2026-09-18 10:20:00', 3);

    const ana = quien(await consultar(), 'ANA PEREZ');
    expect(ana).toMatchObject({ registros: 3, cajas: 2, es_usuario: true, rol: 'TECNICA' });
    expect(String(ana?.primer_registro)).toContain('08:02');
    expect(String(ana?.ultimo_registro)).toContain('10:20');
  });

  it('quien entró pero todavía no ha digitado también aparece, en cero', async () => {
    const beto = quien(await consultar(), 'BETO GOMEZ');
    expect(beto).toMatchObject({ registros: 0, cajas: 0, primer_registro: null, ultimo_registro: null });
    expect(beto?.ultima_actividad).not.toBeNull();
  });

  it('quien nunca ha entrado sale sin marca de presencia', async () => {
    expect(quien(await consultar(), 'CARO DIAZ')).toMatchObject({ ultima_actividad: null, registros: 0 });
  });

  it('el trabajo de quien ya no tiene cuenta no se pierde', async () => {
    await digitar('999', 'EX EMPLEADO', '051C000009', '2026-09-18 08:30:00', 90);
    const ex = quien(await consultar(), 'EX EMPLEADO (999)');
    expect(ex).toMatchObject({ registros: 1, es_usuario: false, cc: '999', rol: null });
  });

  it('el rango acota, y un día pedido entero incluye el día entero', async () => {
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-17 16:00:00', 10);
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-18 08:00:00', 11);
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-18 23:50:00', 12);

    expect(quien(await consultar({ desde: HOY, hasta: HOY }), 'ANA PEREZ')?.registros).toBe(2);
    expect(quien(await consultar({ desde: '2026-09-17', hasta: '2026-09-17' }), 'ANA PEREZ')?.registros).toBe(1);
    expect(quien(await consultar({ desde: '2026-09-17', hasta: HOY }), 'ANA PEREZ')?.registros).toBe(3);
  });

  it('el rango admite horas, para mirar una franja del día', async () => {
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-18 08:00:00', 20);
    await digitar('111', 'ANA PEREZ', '051C000001', '2026-09-18 11:00:00', 21);

    const manana = await consultar({ desde: '2026-09-18 07:00:00', hasta: '2026-09-18 10:00:00' });
    expect(quien(manana, 'ANA PEREZ')?.registros).toBe(1);
  });

  it('se mide por el momento real de guardado, no por la fecha que se escribe', async () => {
    // Un registro con fecha del dato de ayer, guardado hoy: cuenta hoy.
    await db.query(
      `INSERT INTO fuiddatosreal (fecha_del_dato, caja, upd, elaborado_por, created_at)
       VALUES ('2026-01-05', '051C000001', 'UPD0000030', 'ANA PEREZ (111)', '2026-09-18 09:00:00')`,
    );
    expect(quien(await consultar({ desde: HOY, hasta: HOY }), 'ANA PEREZ')?.registros).toBe(1);
  });

  it('los de más actividad reciente salen primero', async () => {
    const personas = await consultar();
    const conMarca = personas.filter((p) => p.ultima_actividad !== null).map((p) => p.nombre);
    expect(conMarca.at(-1)).toBe('BETO GOMEZ');
    expect(personas.at(-1)?.nombre).toBe('CARO DIAZ');
  });

  it('el aviso de escritura queda anotado con su caja', async () => {
    const res = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, end() { return this; } };
    await marcarEscribiendo(
      { session: { user: { id: 1 } }, body: { caja: '051C004431' } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(204);

    const ana = quien(await consultar(), 'ANA PEREZ');
    expect(ana?.ultima_escritura).not.toBeNull();
    expect(ana?.caja_escribiendo).toBe('051C004431');
  });

  it('escribir cuenta como presencia aunque no se haya guardado nada', async () => {
    // CARO DIAZ no tiene marca de actividad ni registros; solo teclea.
    await marcarEscribiendo(
      { session: { user: { id: 3 } }, body: { caja: '051C000007' } } as unknown as Request,
      { status() { return this; }, end() { return this; } } as unknown as Response,
    );
    const caro = quien(await consultar(), 'CARO DIAZ');
    expect(caro?.ultima_escritura).not.toBeNull();
    expect(caro?.registros).toBe(0);
  });

  it('la respuesta lleva el rango y el reloj del servidor', async () => {
    const res = respuesta();
    await actividadDelEquipo(peticion({ desde: HOY, hasta: HOY }), res);
    const cuerpo = res.body as { desde: string; hasta: string; ahora: string };
    expect(cuerpo.desde).toBe('2026-09-18 00:00:00');
    // El día entero termina al empezar el siguiente; la consulta compara con <.
    expect(cuerpo.hasta).toBe('2026-09-18 24:00:00');
    expect(Number.isNaN(Date.parse(cuerpo.ahora))).toBe(false);
  });
});
