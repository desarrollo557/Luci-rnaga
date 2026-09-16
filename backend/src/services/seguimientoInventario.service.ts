import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { RAIZ_BACKEND } from './plantillaFuid.service.js';
import { soloNombre } from '../utils/format.js';

/**
 * El formato oficial de seguimiento: F-PSD-IDA-001 SEGUIMIENTO DE INVENTARIO,
 * versión 002 del 4 de noviembre de 2025.
 *
 * Es el documento con el que se reporta cuánto avanzó cada persona cada día:
 * una fila por jornada, cliente y colaborador, con el rango de cajas, el rango
 * de UPD y cuántos registros salieron. Hasta ahora se llenaba a mano.
 *
 * Se parte del archivo original, no de una hoja creada desde cero, para que el
 * membrete, el logo, el código del formato y la rejilla sean exactamente los del
 * documento aprobado. Del archivo que entregó el cliente se quitaron las filas
 * históricas y se dejó la fila 9 vacía como modelo de estilo, igual que hace el
 * F-PSD-001 del inventario.
 */

const RUTA_PLANTILLA = path.join(RAIZ_BACKEND, 'assets', 'plantilla', 'F-PSD-IDA-001.xlsx');

export const HOJA_SEGUIMIENTO = 'SEGUIMIENTO';

/** Los datos empiezan en la fila 9; arriba van el membrete, los totales y los encabezados. */
const PRIMERA_FILA_DATOS = 9;

/**
 * Celdas que totalizan las columnas con `SUBTOTAL`. Vienen del formato original y
 * se conservan, pero hay que borrarles el resultado guardado: el archivo trae
 * cacheado el total de los datos históricos, y sin limpiarlo el documento nuevo
 * enseñaría esa cifra vieja hasta que alguien lo abriera y Excel recalculara.
 */
const CELDAS_TOTAL: ReadonlyArray<readonly [string, string]> = [
  ['F6', 'SUBTOTAL(9,F9:F9993)'],
  ['I6', 'SUBTOTAL(9,I9:I9995)'],
];

/**
 * Una fila del seguimiento: lo que una persona sacó en un día, para un cliente y
 * un acta.
 */
export interface FilaSeguimiento {
  fecha: string | null;
  codigo_cliente: string | null;
  caja_ini: number | null;
  caja_fin: number | null;
  total_cajas: number | null;
  upd_ini: number | null;
  upd_fin: number | null;
  total_registros: number | null;
  colaborador: string | null;
  tipo_documental: string | null;
  acta: string | null;
}

/**
 * Columnas del formato, en su orden. La letra se deja explícita porque la hoja
 * empieza en la B: la A es un margen estrecho del membrete.
 */
const COLUMNAS: ReadonlyArray<readonly [number, keyof FilaSeguimiento]> = [
  [2, 'fecha'],
  [3, 'codigo_cliente'],
  [4, 'caja_ini'],
  [5, 'caja_fin'],
  [6, 'total_cajas'],
  [7, 'upd_ini'],
  [8, 'upd_fin'],
  [9, 'total_registros'],
  [10, 'colaborador'],
  [11, 'tipo_documental'],
  [12, 'acta'],
];

/**
 * La fecha como `Date` sin que el día se mueva.
 *
 * El driver devuelve las columnas `date` como el texto `2026-09-02`, que
 * `new Date()` interpreta como medianoche UTC; en Colombia eso es el día
 * anterior. Se arma en hora local, igual que en el formato del inventario.
 */
function comoFecha(valor: unknown): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== 'string') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
  if (!iso) return null;
  return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
}

/** Abre el formato oficial y devuelve su hoja de seguimiento. */
export async function abrirFormatoSeguimiento(): Promise<{
  libro: ExcelJS.Workbook;
  hoja: ExcelJS.Worksheet;
}> {
  if (!fs.existsSync(RUTA_PLANTILLA)) {
    throw new Error(`No se encuentra el formato F-PSD-IDA-001 en: ${RUTA_PLANTILLA}`);
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(RUTA_PLANTILLA);
  const hoja = libro.getWorksheet(HOJA_SEGUIMIENTO);
  if (!hoja) throw new Error('El formato F-PSD-IDA-001 no tiene la hoja SEGUIMIENTO');
  return { libro, hoja };
}

/**
 * Vuelca las filas en la hoja a partir de la fila 9, copiando el estilo de esa
 * fila modelo: bordes de la rejilla, Arial Narrow y el formato de fecha.
 */
export function escribirFilasSeguimiento(
  hoja: ExcelJS.Worksheet,
  filas: ReadonlyArray<FilaSeguimiento>,
): number {
  const modelo = COLUMNAS.map(([columna]) => hoja.getRow(PRIMERA_FILA_DATOS).getCell(columna).style);

  filas.forEach((registro, indice) => {
    const fila = hoja.getRow(PRIMERA_FILA_DATOS + indice);
    COLUMNAS.forEach(([columna, campo], posicion) => {
      const celda = fila.getCell(columna);
      celda.style = { ...modelo[posicion] };

      if (campo === 'fecha') {
        celda.value = comoFecha(registro.fecha);
        return;
      }
      if (campo === 'colaborador') {
        // Sin la cédula, igual que en el FUID: el seguimiento también sale del
        // sistema hacia fuera.
        celda.value = (soloNombre(registro.colaborador) as ExcelJS.CellValue) ?? null;
        return;
      }
      const valor = registro[campo];
      celda.value = valor == null || valor === '' ? null : (valor as ExcelJS.CellValue);
    });
    fila.commit();
  });

  // Los totales vuelven a ser solo la fórmula: sin resultado guardado, Excel los
  // calcula al abrir sobre los datos que acaban de escribirse.
  for (const [celda, formula] of CELDAS_TOTAL) {
    hoja.getCell(celda).value = { formula, date1904: false };
  }

  return filas.length;
}

/** Genera el seguimiento en el formato oficial y lo devuelve como buffer. */
export async function construirSeguimientoInventario(
  filas: ReadonlyArray<FilaSeguimiento>,
): Promise<Buffer> {
  const { libro, hoja } = await abrirFormatoSeguimiento();
  escribirFilasSeguimiento(hoja, filas);
  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** `Seguimiento_Inventario_2026-09-16.xlsx`, o con el rango cuando se acota. */
export function seguimientoFilename(desde?: string | null, hasta?: string | null, hoy = ''): string {
  const limpio = (v: unknown) => String(v ?? '').replace(/[\\/:*?"<>|\s]+/g, '_');
  if (desde && hasta) return `Seguimiento_Inventario_${limpio(desde)}_a_${limpio(hasta)}.xlsx`;
  if (desde) return `Seguimiento_Inventario_desde_${limpio(desde)}.xlsx`;
  if (hasta) return `Seguimiento_Inventario_hasta_${limpio(hasta)}.xlsx`;
  return `Seguimiento_Inventario_${limpio(hoy)}.xlsx`;
}
