import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { Request, Response } from 'express';

/**
 * Seguimiento de inventario: resumen previo y descarga.
 *
 * La base de datos se simula; lo que se comprueba es lo que hay entre la
 * petición y el archivo: que el resumen y la descarga filtren exactamente igual
 * (si contaran distinto, la pantalla anunciaría una cifra y el archivo traería
 * otra), que el archivo que sale sea un libro válido con las filas pedidas y
 * la cabecera que dice cuántas lleva, y que sin datos se explique por qué.
 */

const consultas: { sql: string; params: unknown[] }[] = [];
let respuestas: unknown[][] = [];

vi.mock('../../config/db.js', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    return respuestas.shift() ?? [];
  }),
}));
vi.mock('../../services/audit.service.js', () => ({ audit: vi.fn(async () => undefined) }));

import { descargarSeguimientoInventario, resumenSeguimientoInventario } from '../reportes.controller.js';

function peticion(query: Record<string, string> = {}): Request {
  // La auditoría de la descarga firma con quien está en sesión.
  return { query, session: { user: { id: 1, nombre: 'DEV LIDER', rol: 'LIDER' } } } as unknown as Request;
}

function respuesta() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(codigo: number) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo: unknown) {
      this.body = cuerpo;
      return this;
    },
    setHeader(nombre: string, valor: string) {
      this.headers[nombre.toLowerCase()] = String(valor);
      return this;
    },
    send(cuerpo: unknown) {
      this.body = cuerpo;
      return this;
    },
  };
  return res as typeof res & Response;
}

/**
 * La condición WHERE de los filtros, para comparar dos consultas.
 *
 * El filtro de la petición va en una sola línea, al final del primer bloque de
 * la consulta, justo antes de `),`. Buscarlo así lo distingue de los otros
 * `WHERE` que lleva el SQL —los de `FILTER (WHERE …)` y los de las subconsultas
 * que miran los cierres anotados— que no son filtros de la petición.
 */
const condicionDe = (sql: string) =>
  /\sWHERE\s+([^\n]*)\n\s*\),/.exec(sql)?.[1].replace(/\s+/g, ' ').trim();

const jornada = (n: number) => ({
  fecha: `2026-09-${String(n).padStart(2, '0')}`,
  codigo_cliente: '001',
  caja_ini: n,
  caja_fin: n + 2,
  total_cajas: 3,
  upd_ini: 100 * n,
  upd_fin: 100 * n + 40,
  total_registros: 41,
  colaborador: 'ANA PÉREZ (1234567)',
  tipo_documental: null,
  acta: 'ACTA-7',
});

beforeEach(() => {
  consultas.length = 0;
  respuestas = [];
});

describe('resumen del seguimiento', () => {
  it('cuenta jornadas y registros sobre la misma consulta agrupada, y responde números', async () => {
    respuestas = [[{ jornadas: '12', registros: '480' }]];
    const res = respuesta();
    await resumenSeguimientoInventario(peticion({ desde: '2026-09-01', hasta: '2026-09-15' }), res);

    expect(res.body).toEqual({ jornadas: 12, registros: 480 });
    expect(consultas).toHaveLength(1);
    const { sql, params } = consultas[0];
    expect(sql).toMatch(/SELECT COUNT\(\*\) AS jornadas/);
    expect(sql).toMatch(/SUM\(t\.total_registros\)/);
    expect(sql).toMatch(/FROM \(\s*WITH base AS/);
    expect(sql).toMatch(/GROUP BY/);
    expect(params).toEqual(['2026-09-01', '2026-09-15']);
  });

  it('sin filtros no manda parámetros y responde ceros cuando no hay nada', async () => {
    respuestas = [[{ jornadas: 0, registros: null }]];
    const res = respuesta();
    await resumenSeguimientoInventario(peticion(), res);

    expect(res.body).toEqual({ jornadas: 0, registros: 0 });
    expect(consultas[0].params).toEqual([]);
    expect(condicionDe(consultas[0].sql)).toBe('TRUE');
  });

  it('filtra exactamente igual que la descarga', async () => {
    const filtros = { desde: '2026-09-01', hasta: '2026-09-15', persona: 'ANA PÉREZ (1234567)' };
    respuestas = [[{ jornadas: 1, registros: 1 }], [jornada(1)]];
    await resumenSeguimientoInventario(peticion(filtros), respuesta());
    await descargarSeguimientoInventario(peticion(filtros), respuesta());

    expect(consultas).toHaveLength(2);
    expect(condicionDe(consultas[0].sql)).toBe(condicionDe(consultas[1].sql));
    expect(consultas[0].params).toEqual(consultas[1].params);
    expect(consultas[1].params).toEqual(['2026-09-01', '2026-09-15', 'ANA PÉREZ (1234567)']);
  });
});

describe('descarga del seguimiento', () => {
  it('responde un libro válido con una fila por jornada y dice cuántas lleva', async () => {
    respuestas = [[jornada(1), jornada(2), jornada(3)]];
    const res = respuesta();
    await descargarSeguimientoInventario(peticion({ desde: '2026-09-01', hasta: '2026-09-03' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['x-total-jornadas']).toBe('3');
    expect(res.headers['access-control-expose-headers']).toContain('X-Total-Jornadas');
    expect(res.headers['content-disposition']).toContain('Seguimiento_Inventario');
    expect(Buffer.isBuffer(res.body)).toBe(true);

    const zip = await JSZip.loadAsync(res.body as Buffer);
    const hoja = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(hoja).toContain('<row r="9"');
    expect(hoja).toContain('<row r="11"');
    expect(hoja).not.toContain('<row r="12"');
    // Sin la cédula: el documento se entrega a un cliente.
    expect(hoja).toContain('ANA PÉREZ');
    expect(hoja).not.toContain('1234567');
    expect(hoja).toContain('ACTA-7');
  });

  it('sin jornadas responde 404 y distingue base vacía de filtros que dejan todo fuera', async () => {
    respuestas = [[], [{ total: 0 }]];
    let res = respuesta();
    await descargarSeguimientoInventario(peticion(), res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/todavía no hay registros/i);

    respuestas = [[], [{ total: 1500 }]];
    res = respuesta();
    await descargarSeguimientoInventario(peticion({ desde: '2030-01-01' }), res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/ningún registro encaja/i);
    expect((res.body as { error: string }).error).toMatch(/registros digitados en total/);
  });
});
