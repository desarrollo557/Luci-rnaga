import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRECUENCIAS_VALIDAS,
  LONGITUD_MAXIMA_FUID,
  OTROS_VALIDOS,
  SOPORTES_VALIDOS,
} from '../../config/constants.js';

/**
 * El frontend repite tres cosas que define el backend: los catálogos cerrados
 * (`lib/catalogos.ts`) y las longitudes máximas (`lib/limites.ts`).
 *
 * No se importan directamente porque el backend compila con `rootDir: "src"` y
 * sacar esos archivos de ahí cambiaría la ruta de `dist/server.js`. Por la misma
 * razón esta prueba los lee como texto en lugar de importarlos: un `import` a
 * una ruta fuera de `src` rompería `tsc`.
 *
 * Sin esta comprobación, editar una lista en un lado y no en el otro dejaría al
 * usuario eligiendo en un desplegable un valor que el servidor rechaza, o
 * escribiendo un texto que se corta al guardar.
 */

const RAIZ_FRONTEND = resolve(process.cwd(), '..', 'frontend', 'src', 'lib');

function leerFuente(archivo: string): string {
  const ruta = resolve(RAIZ_FRONTEND, archivo);
  try {
    return readFileSync(ruta, 'utf8');
  } catch {
    throw new Error(`No se encontró ${ruta}. Si el archivo se movió, actualiza esta prueba.`);
  }
}

/** Extrae `export const NOMBRE = ['A', 'B'] as const;` */
function listaExportada(fuente: string, nombre: string): string[] {
  const encontrado = new RegExp(`export const ${nombre} = \\[([^\\]]*)\\]`).exec(fuente);
  if (!encontrado) throw new Error(`No se encontró la lista ${nombre} en el frontend`);
  return [...encontrado[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/** Extrae `campo: 255,` de un objeto exportado. */
function mapaExportado(fuente: string, nombre: string): Record<string, number> {
  const inicio = fuente.indexOf(`export const ${nombre} = {`);
  if (inicio < 0) throw new Error(`No se encontró el mapa ${nombre} en el frontend`);
  const fin = fuente.indexOf('} as const;', inicio);
  const cuerpo = fuente.slice(inicio, fin);
  const salida: Record<string, number> = {};
  for (const m of cuerpo.matchAll(/^\s*([a-z_0-9]+):\s*(\d+),/gm)) {
    salida[m[1]] = Number(m[2]);
  }
  return salida;
}

describe('los catálogos del frontend coinciden con los del backend', () => {
  const fuente = leerFuente('catalogos.ts');

  it('soporte', () => {
    expect(listaExportada(fuente, 'OPCIONES_SOPORTE')).toEqual([...SOPORTES_VALIDOS]);
  });

  it('frecuencia', () => {
    expect(listaExportada(fuente, 'OPCIONES_FRECUENCIA')).toEqual([...FRECUENCIAS_VALIDAS]);
  });

  it('otro', () => {
    expect(listaExportada(fuente, 'OPCIONES_OTRO')).toEqual([...OTROS_VALIDOS]);
  });
});

describe('las longitudes máximas del frontend coinciden con las del backend', () => {
  const mapaFrontend = mapaExportado(leerFuente('limites.ts'), 'LONGITUD_MAXIMA_FUID');

  it('cubre exactamente los mismos campos', () => {
    expect(Object.keys(mapaFrontend).sort()).toEqual(Object.keys(LONGITUD_MAXIMA_FUID).sort());
  });

  it('asigna a cada campo el mismo máximo', () => {
    expect(mapaFrontend).toEqual({ ...LONGITUD_MAXIMA_FUID });
  });
});
