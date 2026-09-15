import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { FUID_COLUMNS } from './zohoSheet.service.js';

/**
 * El formato oficial del inventario: F-PSD-001 ÚNICO DE INVENTARIO DOCUMENTAL
 * (FUID), versión 001 del 3 de abril de 2021.
 *
 * Todo lo que el software entrega como inventario sale de aquí, para que el
 * archivo que recibe el cliente lleve el membrete, el código del formato y la
 * hoja de control de cambios, y no una tabla suelta. La estructura del archivo
 * es la que manda: la cabecera ocupa las filas 1 a 7 (logo, título, código,
 * versión, página, los grupos "No. DOCUMENTO", "FECHAS EXTREMAS", "No. UNIDAD
 * DE CONSERVACIÓN" y "REGISTRO DE ENTRADA", y los 27 encabezados), así que los
 * registros empiezan en la fila 8.
 *
 * El archivo de `assets` es el original con las filas vacías preformateadas
 * recortadas: traía 32.652, que pesaban 2,7 MB y tardaban casi dos segundos en
 * abrirse en cada descarga. Se conserva la fila 8 como modelo de estilo y cada
 * fila que se escribe copia sus bordes, así que el resultado se ve igual.
 */
const RUTA_PLANTILLA = path.resolve(process.cwd(), 'assets', 'plantilla', 'F-PSD-001.xlsx');

/** Nombre de la hoja del formato. La segunda hoja es el control de cambios. */
export const HOJA_FORMATO = 'F-PSD-001';

/** Primera fila de datos: debajo de los 27 encabezados. */
export const PRIMERA_FILA_DATOS = 8;

/** Columnas que llevan fecha y se escriben como fecha, no como texto. */
const COLUMNAS_FECHA = new Set(['fecha_inicial', 'fecha_final', 'fecha_del_dato', 'fecha_transferencia']);

const FORMATO_FECHA = 'DD/MM/YYYY';

/** `2026-09-02`, con o sin hora detrás. Es lo que devuelve el driver para `date`. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
/** `7/07/2023` o `07/07/2023`: el formato con el que se digita y se lee en papel. */
const DIA_MES_ANIO = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Convierte a un `Date` del día indicado, o `null` si no es una fecha.
 *
 * Los componentes se pasan uno a uno al constructor, que los interpreta en la
 * zona local. Es la única forma de que el día no se mueva: el driver devuelve
 * las columnas `date` como el texto `2026-09-02`, y `new Date('2026-09-02')` lo
 * lee como medianoche **UTC**; al bajarlo a medianoche local en Colombia
 * (UTC-5) retrocedía al día anterior, y el inventario salía con todas las
 * fechas un día antes de lo que dice la base.
 *
 * Lo que no encaje en ninguno de los dos formatos se devuelve como `null` y se
 * escribe tal cual, en vez de perderse.
 */
export function comoFecha(valor: unknown): Date | null {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  const texto = String(valor).trim();
  const iso = ISO.exec(texto);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dma = DIA_MES_ANIO.exec(texto);
  if (dma) return diaValido(Number(dma[3]), Number(dma[2]), Number(dma[1]));
  return null;
}

/** Construye el día en hora local, o `null` si no existe en el calendario. */
function diaValido(anio: number, mes: number, dia: number): Date | null {
  const fecha = new Date(anio, mes - 1, dia);
  const existe =
    fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
  return existe ? fecha : null;
}

/** Abre el formato oficial y devuelve el libro con su hoja de datos. */
export async function abrirPlantillaFuid(): Promise<{
  libro: ExcelJS.Workbook;
  hoja: ExcelJS.Worksheet;
}> {
  if (!fs.existsSync(RUTA_PLANTILLA)) {
    throw new Error(`No se encuentra el formato F-PSD-001 en: ${RUTA_PLANTILLA}`);
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(RUTA_PLANTILLA);
  const hoja = libro.getWorksheet(HOJA_FORMATO) ?? libro.worksheets[0];
  if (!hoja) throw new Error('El formato F-PSD-001 no tiene una hoja de datos');
  return { libro, hoja };
}

/**
 * Vuelca los registros en la hoja, uno por fila, a partir de la fila 8.
 *
 * El orden de las columnas no se repite aquí: se toma de `FUID_COLUMNS`, que es
 * el mismo que usan la hoja de Zoho y la exportación del inventario. Así, si
 * algún día se añade una columna al FUID, se añade en un solo sitio.
 */
export function escribirFilasFuid<T extends object>(
  hoja: ExcelJS.Worksheet,
  filas: ReadonlyArray<T>,
): number {
  // Estilo de la fila 8 del formato: los bordes de la rejilla del inventario.
  const modelo = FUID_COLUMNS.map((_, indice) => hoja.getRow(PRIMERA_FILA_DATOS).getCell(indice + 1).style);

  filas.forEach((registro, indice) => {
    const fila = hoja.getRow(PRIMERA_FILA_DATOS + indice);
    FUID_COLUMNS.forEach(([, campo], columna) => {
      const celda = fila.getCell(columna + 1);
      celda.style = { ...modelo[columna] };
      const valor = (registro as Record<string, unknown>)[campo];
      if (COLUMNAS_FECHA.has(campo)) {
        const fecha = comoFecha(valor);
        if (fecha) {
          celda.value = fecha;
          celda.numFmt = FORMATO_FECHA;
          return;
        }
      }
      celda.value = valor == null || valor === '' ? null : (valor as ExcelJS.CellValue);
    });
    fila.commit();
  });

  return filas.length;
}

/** Genera el inventario en el formato oficial y lo devuelve como buffer. */
export async function construirInventarioFuid<T extends object>(
  filas: ReadonlyArray<T>,
): Promise<Buffer> {
  const { libro, hoja } = await abrirPlantillaFuid();
  escribirFilasFuid(hoja, filas);
  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
