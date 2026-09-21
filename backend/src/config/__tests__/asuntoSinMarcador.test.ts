import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { AJUSTES } from '../esquema.js';

/**
 * El asunto compuesto no lleva el marcador N/A.
 *
 * Nace de una celda del inventario Excel: "APROVECHAMIENTOS N/A". El asunto
 * manual quedó sin diligenciar, se guardó con el marcador como cualquier otro
 * campo, y el trigger que une los dos asuntos lo pegó al automático. Lo que se
 * comprueba aquí, contra PostgreSQL de verdad porque la lógica vive en el
 * trigger: que el asunto se arma solo con lo que tiene texto, y que los
 * asuntos ya guardados con el marcador pegado se recomponen una sola vez al
 * arrancar, sin dejar rastro en el historial ni mover `updated_at`.
 */

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
let db: PGlite;

async function insertar(asunto2: string | null, asunto3: string | null, upd: string) {
  await db.query(
    `INSERT INTO fuiddatosreal (caja, upd, asunto_2, asunto_3, asunto, elaborado_por, created_at, updated_at)
     VALUES ('051C000001', $1, $2, $3, 'LO QUE MANDE EL FORMULARIO', 'ANA PEREZ (111)',
             '2026-09-18 10:00:00', '2026-09-18 10:00:00')`,
    [upd, asunto2, asunto3],
  );
}

async function asuntoDe(upd: string) {
  const { rows } = await db.query<{ asunto: string; updated_at: string }>(
    'SELECT asunto, updated_at::text AS updated_at FROM fuiddatosreal WHERE upd = $1',
    [upd],
  );
  return rows[0];
}

async function filasEnHistorial() {
  const { rows } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM historial');
  return rows[0].n;
}

beforeAll(async () => {
  db = new PGlite();
  for (const archivo of ['01-esquema.sql', '02-triggers.sql']) {
    await db.exec(fs.readFileSync(path.join(RAIZ, 'database', 'supabase', archivo), 'utf8'));
  }
});

beforeEach(async () => {
  await db.exec('TRUNCATE fuiddatosreal, historial RESTART IDENTITY');
});

afterAll(async () => {
  await db?.close();
});

describe('cómo se compone el asunto', () => {
  beforeAll(async () => {
    for (const ajuste of AJUSTES) await db.exec(ajuste.sql);
  });

  it('con el manual sin diligenciar, el asunto es solo el automático', async () => {
    await insertar('APROVECHAMIENTOS', 'N/A', 'UPD0000001');
    expect((await asuntoDe('UPD0000001')).asunto).toBe('APROVECHAMIENTOS');
  });

  it('con los dos diligenciados, los une con un espacio', async () => {
    await insertar('APROVECHAMIENTOS', 'PACIENTE 4', 'UPD0000002');
    expect((await asuntoDe('UPD0000002')).asunto).toBe('APROVECHAMIENTOS PACIENTE 4');
  });

  it('el marcador tampoco entra por el lado del automático', async () => {
    await insertar('N/A', 'PACIENTE 4', 'UPD0000003');
    expect((await asuntoDe('UPD0000003')).asunto).toBe('PACIENTE 4');
  });

  it('con los dos sin diligenciar, el asunto es el marcador, como cualquier texto vacío', async () => {
    await insertar('N/A', 'N/A', 'UPD0000004');
    expect((await asuntoDe('UPD0000004')).asunto).toBe('N/A');
    await insertar(null, '', 'UPD0000005');
    expect((await asuntoDe('UPD0000005')).asunto).toBe('N/A');
  });

  it('al corregir el manual, el asunto se vuelve a componer sin el marcador', async () => {
    await insertar('APROVECHAMIENTOS', 'N/A', 'UPD0000006');
    await db.query(`UPDATE fuiddatosreal SET asunto_3 = 'ACTA 12' WHERE upd = 'UPD0000006'`);
    expect((await asuntoDe('UPD0000006')).asunto).toBe('APROVECHAMIENTOS ACTA 12');
    await db.query(`UPDATE fuiddatosreal SET asunto_3 = 'N/A' WHERE upd = 'UPD0000006'`);
    expect((await asuntoDe('UPD0000006')).asunto).toBe('APROVECHAMIENTOS');
  });
});

describe('los asuntos ya guardados con el marcador pegado', () => {
  it('se recomponen una sola vez al arrancar, sin tocar el historial ni updated_at', async () => {
    await insertar('APROVECHAMIENTOS', 'N/A', 'UPD0000010');
    await insertar('CONTRATOS', 'PROVEEDOR X', 'UPD0000011');
    await insertar(null, null, 'UPD0000012');
    /*
     * Lo que dejaron el trigger anterior y la base antigua, escrito por debajo
     * del trigger: cambiar solo `asunto` no lo vuelve a componer. Así queda un
     * asunto con el marcador pegado, uno bien compuesto y uno heredado con
     * texto propio y los dos campos vacíos, que ni se mira.
     */
    await db.query(`UPDATE fuiddatosreal SET asunto = 'APROVECHAMIENTOS N/A' WHERE upd = 'UPD0000010'`);
    await db.query(`UPDATE fuiddatosreal SET asunto = 'ASUNTO DE LA BASE ANTIGUA' WHERE upd = 'UPD0000012'`);
    const pegado = await asuntoDe('UPD0000010');
    expect(pegado.asunto).toBe('APROVECHAMIENTOS N/A');
    const historialAntes = await filasEnHistorial();

    for (const ajuste of AJUSTES) await db.exec(ajuste.sql);

    expect(await asuntoDe('UPD0000010')).toEqual({ asunto: 'APROVECHAMIENTOS', updated_at: pegado.updated_at });
    expect((await asuntoDe('UPD0000011')).asunto).toBe('CONTRATOS PROVEEDOR X');
    expect((await asuntoDe('UPD0000012')).asunto).toBe('ASUNTO DE LA BASE ANTIGUA');
    expect(await filasEnHistorial(), 'la corrección del sistema no es una edición').toBe(historialAntes);

    // Los triggers quedan encendidos: una edición normal sí deja rastro.
    await db.query(`UPDATE fuiddatosreal SET asunto_3 = 'AHORA SI' WHERE upd = 'UPD0000010'`);
    expect(await filasEnHistorial()).toBe(historialAntes + 1);
    expect((await asuntoDe('UPD0000010')).asunto).toBe('APROVECHAMIENTOS AHORA SI');

    // Y la segunda pasada no toca nada.
    for (const ajuste of AJUSTES) await db.exec(ajuste.sql);
    expect(await filasEnHistorial()).toBe(historialAntes + 1);
  });
});
