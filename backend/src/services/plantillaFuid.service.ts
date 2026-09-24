import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { FUID_COLUMNS } from './zohoSheet.service.js';
import { VALOR_NO_DILIGENCIADO } from '../config/constants.js';
import { soloNombre } from '../utils/format.js';
import { sinDiligenciar } from '../utils/noDiligenciado.js';

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
/**
 * Raíz de `backend/`, deducida de la ubicación de este archivo.
 *
 * No se usa `process.cwd()`: en producción el servidor arranca con
 * `node backend/dist/server.js` **desde la raíz del repositorio**, así que el
 * directorio de trabajo no es `backend/` y la plantilla se buscaba donde no
 * está. El síntoma no se parecía a la causa: al sincronizar el inventario, la
 * excepción no era un error de Zoho, así que el módulo la reportaba como
 * "Error desconocido al subir a Zoho Sheet".
 *
 * Este archivo vive en `src/services/` al ejecutar con tsx y en
 * `dist/services/` una vez compilado; en los dos casos, dos niveles arriba es
 * `backend/`.
 */
export const RAIZ_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const RUTA_PLANTILLA = path.join(RAIZ_BACKEND, 'assets', 'plantilla', 'F-PSD-001.xlsx');

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
 * Columnas que no se escriben tal cual están guardadas.
 *
 * Dos. El número de orden, que sale como el consecutivo de la caja. Y
 * `elaborado_por`, que se guarda como "NOMBRE (CC)" porque los
 * informes de producción cruzan al digitador por esa cédula, pero el FUID se le
 * entrega al cliente y la cédula de quien digitó no pinta nada ahí. Al líder le
 * tocaba borrarla a mano de cada fila antes de entregar.
 *
 * Se transforma aquí, al escribir, y no en la base: cambiar lo guardado dejaría
 * a los informes de producción sin con qué cruzar al digitador.
 *
 * El número de acta se escribe tal cual: este es el inventario que recibe el
 * cliente y no se le cambia el formato. El "ACTA 122-2026" con el año va solo
 * en el seguimiento de inventario (`reportes.controller.ts`).
 */
const AL_ESCRIBIR: Readonly<Record<string, (valor: unknown, registro: Record<string, unknown>) => unknown>> = {
  // El "N° de orden" del formato es el consecutivo dentro de la caja, sin los
  // huecos de los registros borrados; el número guardado solo ordena.
  n_orden: (valor, registro) => registro.n_orden_caja ?? valor,
  elaborado_por: (v) => soloNombre(v),
};

/**
 * Vuelca los registros en la hoja, uno por fila, a partir de la fila 8.
 *
 * El orden de las columnas no se repite aquí: se toma de `FUID_COLUMNS`, que es
 * el mismo que usan la hoja de Zoho y la exportación del inventario. Así, si
 * algún día se añade una columna al FUID, se añade en un solo sitio.
 *
 * Este es el único punto por el que pasan todos los archivos FUID que produce el
 * sistema —la descarga del inventario, la del acta, la plantilla y lo que se sube
 * a Zoho—, así que lo que se ajuste aquí sale igual en todos.
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
      const guardado = (registro as Record<string, unknown>)[campo];
      const valor = AL_ESCRIBIR[campo] ? AL_ESCRIBIR[campo](guardado, registro as Record<string, unknown>) : guardado;
      if (COLUMNAS_FECHA.has(campo)) {
        const fecha = comoFecha(valor);
        if (fecha) {
          celda.value = fecha;
          celda.numFmt = FORMATO_FECHA;
          return;
        }
      }
      /*
       * Ninguna celda del inventario se entrega en blanco.
       *
       * Lo que no se diligenció se guarda como `N/A` en las columnas de texto,
       * pero las de fecha no admiten el literal y guardan NULL: sin esto, un
       * registro sin fechas extremas salía con dos huecos en el Excel que
       * recibe el cliente, y un hueco no dice si el dato falta o si nadie lo
       * miró. El propio instructivo del FUID lo pide así: "cuando la
       * documentación no tenga fecha se anotará N/A".
       */
      celda.value = sinDiligenciar(valor) ? VALOR_NO_DILIGENCIADO : (valor as ExcelJS.CellValue);
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
