import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirPlantillaFuid, comoFecha, escribirFilasFuid } from '../plantillaFuid.service.js';
import { FUID_COLUMNS } from '../zohoSheet.service.js';
import { soloNombre } from '../../utils/format.js';

/**
 * Las fechas del inventario oficial.
 *
 * El inventario salía con todas las fechas un día antes de lo que dice la base.
 * El driver devuelve las columnas `date` como el texto `2026-09-02`, que
 * `new Date()` interpreta como medianoche UTC; al normalizarla a medianoche
 * local en Colombia (UTC-5) el reloj retrocedía al día anterior. En un
 * inventario que se entrega firmado, una fecha de transferencia corrida un día
 * no es un detalle de presentación.
 *
 * Estas pruebas fijan el día que sale, no la hora, porque es el día lo que se
 * imprime con el formato DD/MM/YYYY.
 */

/** El día, tal como se vería en la celda. */
function dia(valor: unknown): string | null {
  const fecha = comoFecha(valor);
  if (!fecha) return null;
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

describe('el día no se mueve al pasar a la celda', () => {
  it('respeta el día que devuelve el driver para una columna date', () => {
    expect(dia('2026-09-02')).toBe('02/09/2026');
  });

  it('respeta el día cuando viene con la hora detrás', () => {
    expect(dia('2026-09-02T05:00:00.000Z')).toBe('02/09/2026');
    expect(dia('2026-09-02 00:00:00')).toBe('02/09/2026');
  });

  it('respeta el día de un objeto Date', () => {
    expect(dia(new Date(2026, 8, 2, 23, 30))).toBe('02/09/2026');
  });

  it('el primero de enero no retrocede al año anterior', () => {
    // El caso que delata el error de zona horaria: con el desfase, esta fecha
    // salía como 31/12/2024.
    expect(dia('2025-01-01')).toBe('01/01/2025');
  });
});

describe('el formato con el que se digita', () => {
  it('acepta 7/07/2023 y lo entiende como día/mes/año', () => {
    expect(dia('7/07/2023')).toBe('07/07/2023');
  });

  it('acepta el mismo formato con dos dígitos', () => {
    expect(dia('07/07/2023')).toBe('07/07/2023');
  });

  it('no confunde el día con el mes', () => {
    // 13 no puede ser un mes, así que si saliera 13 como mes estaría invertido.
    expect(dia('13/05/2024')).toBe('13/05/2024');
  });
});

describe('lo que no es una fecha se deja pasar sin inventar una', () => {
  it('vacío, nulo y sin dato', () => {
    expect(comoFecha(null)).toBeNull();
    expect(comoFecha(undefined)).toBeNull();
    expect(comoFecha('')).toBeNull();
  });

  it('el marcador de campo no diligenciado', () => {
    expect(comoFecha('N/A')).toBeNull();
  });

  it('un texto cualquiera', () => {
    expect(comoFecha('SIN FECHA')).toBeNull();
  });

  it('un día que no existe en el calendario', () => {
    expect(comoFecha('2025-02-30')).toBeNull();
    expect(comoFecha('31/02/2025')).toBeNull();
  });

  it('una fecha inválida', () => {
    expect(comoFecha(new Date('vaya'))).toBeNull();
  });
});

describe('el formato se encuentra desde cualquier directorio de arranque', () => {
  const directorioOriginal = process.cwd();
  afterEach(() => process.chdir(directorioOriginal));

  it('lo abre aunque el proceso arranque fuera de backend/', async () => {
    // Es lo que hace producción: `node backend/dist/server.js` desde la raíz
    // del repositorio. Con la ruta atada a `process.cwd()`, el formato se
    // buscaba en `<raíz>/assets` en vez de `<raíz>/backend/assets`, y el
    // inventario fallaba al descargarse y al subirse a Zoho Sheet.
    process.chdir(path.resolve(directorioOriginal, '..'));
    const { hoja } = await abrirPlantillaFuid();
    expect(hoja.name).toBe('F-PSD-001');
  });

  it('conserva la cabecera y los 27 encabezados', async () => {
    const { hoja } = await abrirPlantillaFuid();
    expect(hoja.getRow(7).getCell(1).value).toBe('N° Orden');
    expect(hoja.getRow(7).getCell(27).value).toBe('FECHA DE TRANSFERENCIA');
  });
});

/**
 * La cédula del digitador no sale en el archivo que se entrega.
 *
 * `elaborado_por` se guarda como "NOMBRE (CC)" porque los informes de producción
 * cruzan al digitador con la tabla de usuarios por esa cédula. Pero el FUID se le
 * entrega al cliente, y al líder le tocaba borrar las cédulas a mano de cada fila
 * antes de mandarlo.
 *
 * Lo que se prueba es que se quite **al escribir el archivo** y no en otro sitio:
 * si algún día alguien decidiera limpiarlo en la base, producción se quedaría sin
 * con qué cruzar al digitador y nadie lo notaría hasta ver los informes vacíos.
 */
describe('el nombre sin la cédula', () => {
  it('quita la cédula del final', () => {
    expect(soloNombre('SALLY PINEDA (1046812542)')).toBe('SALLY PINEDA');
  });

  it('quita la cédula aunque no haya espacio antes del paréntesis', () => {
    expect(soloNombre('SALLY PINEDA(1046812542)')).toBe('SALLY PINEDA');
  });

  it('un nombre sin cédula se queda igual', () => {
    expect(soloNombre('SALLY PINEDA')).toBe('SALLY PINEDA');
    expect(soloNombre('N/A')).toBe('N/A');
  });

  it('conserva los paréntesis que no están al final', () => {
    expect(soloNombre('FUNDACION (FUNDES) DEL CARIBE (900123)')).toBe('FUNDACION (FUNDES) DEL CARIBE');
  });

  it('si al quitarlo no queda nada, se devuelve el original', () => {
    // Una celda vacía dice menos que un dato raro.
    expect(soloNombre('(1046812542)')).toBe('(1046812542)');
  });

  it('lo que no es texto pasa sin tocarse', () => {
    expect(soloNombre(null)).toBeNull();
    expect(soloNombre(undefined)).toBeUndefined();
    expect(soloNombre(42)).toBe(42);
  });
});

describe('el archivo generado no lleva cédulas', () => {
  /** Índice de la columna "ELABORADO POR" dentro del formato oficial. */
  const COLUMNA_ELABORADO = FUID_COLUMNS.findIndex(([, campo]) => campo === 'elaborado_por') + 1;
  const COLUMNA_NOTAS = FUID_COLUMNS.findIndex(([, campo]) => campo === 'notas') + 1;
  const PRIMERA_FILA = 8;

  it('escribe solo el nombre en la columna ELABORADO POR', async () => {
    const { hoja } = await abrirPlantillaFuid();
    escribirFilasFuid(hoja, [
      { elaborado_por: 'SALLY PINEDA (1046812542)', notas: 'SIN NOVEDAD' },
      { elaborado_por: 'DEV TECNICO (987654321)', notas: 'N/A' },
    ]);
    expect(hoja.getRow(PRIMERA_FILA).getCell(COLUMNA_ELABORADO).value).toBe('SALLY PINEDA');
    expect(hoja.getRow(PRIMERA_FILA + 1).getCell(COLUMNA_ELABORADO).value).toBe('DEV TECNICO');
  });

  it('no queda ningún número de cédula en esa columna', async () => {
    const { hoja } = await abrirPlantillaFuid();
    escribirFilasFuid(hoja, [{ elaborado_por: 'SALLY PINEDA (1046812542)' }]);
    const celda = String(hoja.getRow(PRIMERA_FILA).getCell(COLUMNA_ELABORADO).value ?? '');
    expect(celda).not.toContain('1046812542');
    expect(celda).not.toContain('(');
  });

  it('las demás columnas se escriben tal cual están guardadas', async () => {
    const { hoja } = await abrirPlantillaFuid();
    escribirFilasFuid(hoja, [{ elaborado_por: 'X (1)', notas: 'CARPETA (COPIA) DETERIORADA' }]);
    expect(hoja.getRow(PRIMERA_FILA).getCell(COLUMNA_NOTAS).value).toBe('CARPETA (COPIA) DETERIORADA');
  });
});
