import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Comprobación de esquema del arranque.
 *
 * Existe por un incidente: se desplegó una versión que leía una columna nueva
 * antes de que nadie ejecutara su migración, y la pantalla de Administración se
 * quedó respondiendo 500 hasta que alguien se acordó del SQL pendiente.
 *
 * Lo que se prueba es lo que volvería a dejar el sistema caído, o peor: que un
 * fallo aquí no tumbe el arranque entero, y que nadie cuele en esta lista un
 * cambio destructivo o que no se pueda repetir. Se ejecuta en cada arranque, así
 * que un `DROP` o un `UPDATE` colado aquí se aplicaría una y otra vez.
 */

const consultasEjecutadas: string[] = [];
let fallaLaConsulta = false;

vi.mock('../db.js', () => ({
  query: vi.fn(async (sql: string) => {
    consultasEjecutadas.push(sql);
    if (fallaLaConsulta) throw new Error('permiso denegado');
    return [];
  }),
}));

const { asegurarEsquema } = await import('../esquema.js');

beforeEach(() => {
  consultasEjecutadas.length = 0;
  fallaLaConsulta = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('qué se ejecuta al arrancar', () => {
  it('aplica todos los ajustes y los cuenta', async () => {
    const resultado = await asegurarEsquema();
    expect(consultasEjecutadas.length).toBeGreaterThan(0);
    expect(resultado.aplicados).toBe(consultasEjecutadas.length);
    expect(resultado.fallidos).toBe(0);
  });

  it('asegura la columna del segundo perfil, que es el caso que lo motivó', async () => {
    await asegurarEsquema();
    const juntas = consultasEjecutadas.join('\n');
    expect(juntas).toContain('rol_secundario');
    expect(juntas).toContain('ADD COLUMN IF NOT EXISTS');
  });
});

describe('los ajustes son seguros de repetir en cada arranque', () => {
  it('ninguno borra ni transforma datos', async () => {
    await asegurarEsquema();
    for (const sql of consultasEjecutadas) {
      const normalizado = sql.toUpperCase();
      expect(normalizado, sql).not.toMatch(/\bDROP\s+TABLE\b/);
      expect(normalizado, sql).not.toMatch(/\bDROP\s+COLUMN\b/);
      expect(normalizado, sql).not.toMatch(/\bDELETE\s+FROM\b/);
      expect(normalizado, sql).not.toMatch(/\bTRUNCATE\b/);
      expect(normalizado, sql).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/);
    }
  });

  it('cada uno se protege de haberse aplicado ya', async () => {
    await asegurarEsquema();
    for (const sql of consultasEjecutadas) {
      const normalizado = sql.toUpperCase();
      const seProtege =
        normalizado.includes('IF NOT EXISTS') || normalizado.includes('IF EXISTS');
      expect(seProtege, `sin guarda de idempotencia:\n${sql}`).toBe(true);
    }
  });

  it('ejecutarlos dos veces pide exactamente lo mismo', async () => {
    await asegurarEsquema();
    const primera = [...consultasEjecutadas];
    consultasEjecutadas.length = 0;
    await asegurarEsquema();
    expect(consultasEjecutadas).toEqual(primera);
  });
});

describe('un fallo no puede tumbar el arranque', () => {
  it('no lanza cuando la base rechaza el ajuste', async () => {
    fallaLaConsulta = true;
    await expect(asegurarEsquema()).resolves.toBeDefined();
  });

  it('cuenta los fallos y deja constancia de qué hay que aplicar a mano', async () => {
    fallaLaConsulta = true;
    const resultado = await asegurarEsquema();
    expect(resultado.aplicados).toBe(0);
    expect(resultado.fallidos).toBeGreaterThan(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('un ajuste que falla no impide intentar los siguientes', async () => {
    fallaLaConsulta = true;
    const resultado = await asegurarEsquema();
    // Se intentaron todos, no se paró en el primero.
    expect(consultasEjecutadas.length).toBe(resultado.fallidos);
  });
});
