import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { RAIZ_BACKEND } from './plantillaFuid.service.js';
import { soloNombre } from '../utils/format.js';

/**
 * El formato oficial de seguimiento: F-PSD-IDA-001 SEGUIMIENTO DE INVENTARIO,
 * versión 002 del 4 de noviembre de 2025.
 *
 * Una fila por jornada, cliente y colaborador, con el rango de cajas, el rango
 * de UPD y cuántos registros salieron. Hasta ahora se llenaba a mano.
 *
 * **Por qué este servicio edita el XML del archivo en vez de usar ExcelJS, como
 * hace el formato del inventario.** El archivo que entregó el cliente lleva un
 * modo de filtro activo, cientos de rangos protegidos, docenas de formatos
 * condicionales y una cadena de cálculo de 319 KB. ExcelJS reescribe todo eso a
 * su manera y Excel rechaza el resultado: una copia hecha con esa librería sin
 * cambiar nada —solo abrir y guardar— ya no abre sin pedir reparación. Así que
 * aquí el libro se trata como lo que es, un zip: se reescribe únicamente la hoja
 * de datos y cada otra parte se deja byte a byte como venía. Lo que no se toca no
 * se puede romper.
 *
 * La plantilla de `assets/plantilla/` la produce `scripts/plantilla/
 * preparar-seguimiento.mts` a partir del archivo original: le quita las filas
 * históricas, la cadena de cálculo, el nombre reservado del autofiltro, los
 * nombres de los digitadores que quedaban en la tabla de cadenas y la ruta
 * interna de red de los metadatos. Nada de eso debe salir en un documento que se
 * entrega a un cliente.
 */

const RUTA_PLANTILLA = path.join(RAIZ_BACKEND, 'assets', 'plantilla', 'F-PSD-IDA-001.xlsx');

/** Parte del zip donde vive la hoja SEGUIMIENTO. Es la primera hoja del libro. */
export const PARTE_HOJA = 'xl/worksheets/sheet1.xml';

/** Los datos empiezan en la fila 9; arriba van el membrete, los totales y los encabezados. */
export const PRIMERA_FILA_DATOS = 9;

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
 * Qué campo va en cada columna. La hoja empieza en la B; la A es un margen
 * estrecho y oculto del membrete. La M no lleva dato pero sí borde, así que se
 * emite vacía con su estilo.
 */
const COLUMNAS: ReadonlyArray<readonly [string, keyof FilaSeguimiento | null]> = [
  ['B', 'fecha'],
  ['C', 'codigo_cliente'],
  ['D', 'caja_ini'],
  ['E', 'caja_fin'],
  ['F', 'total_cajas'],
  ['G', 'upd_ini'],
  ['H', 'upd_fin'],
  ['I', 'total_registros'],
  ['J', 'colaborador'],
  ['K', 'tipo_documental'],
  ['L', 'acta'],
  ['M', null],
];

const NUMERICOS: ReadonlySet<keyof FilaSeguimiento> = new Set([
  'caja_ini',
  'caja_fin',
  'total_cajas',
  'upd_ini',
  'upd_fin',
  'total_registros',
]);

/* ───────────────────────── utilidades de XML ───────────────────────── */

export function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Número de serie de Excel para una fecha `AAAA-MM-DD`: días desde el 30 de
 * diciembre de 1899. Se calcula en UTC a propósito, para que la zona horaria del
 * servidor no corra el día. Devuelve null si el texto no es una fecha.
 */
export function serialDeFecha(valor: unknown): number | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const aaaa = valor.getFullYear();
    const mm = String(valor.getMonth() + 1).padStart(2, '0');
    const dd = String(valor.getDate()).padStart(2, '0');
    return serialDeFecha(`${aaaa}-${mm}-${dd}`);
  }
  if (typeof valor !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
  if (!m) return null;
  const dia = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = Date.UTC(1899, 11, 30);
  const serial = Math.round((dia - base) / 86_400_000);
  return Number.isFinite(serial) ? serial : null;
}

/** Número de la fila a partir de su etiqueta `<row r="9" …>`. */
function numeroDeFila(filaXml: string): number {
  const m = /^<row\b[^>]*\br="(\d+)"/.exec(filaXml);
  return m ? Number(m[1]) : NaN;
}

/** Las etiquetas `<row>` de un `<sheetData>`, en orden. */
function filasDe(cuerpoSheetData: string): string[] {
  return [...cuerpoSheetData.matchAll(/<row\b[^>]*\/>|<row\b[^>]*>.*?<\/row>/gs)].map((m) => m[0]);
}

/**
 * Estilo por columna de la fila modelo, y los atributos de la propia fila.
 *
 * La fila 9 de la plantilla no lleva datos, pero sí el estilo de una fila de
 * datos: bordes de la rejilla, Arial Narrow y el formato de fecha. Se lee de ahí
 * en vez de fijarlo en el código para que siga atado al archivo real.
 */
interface Modelo {
  atributosFila: string;
  estiloPorColumna: Map<string, string>;
}

function modeloDe(filaXml: string): Modelo {
  const cabecera = /^<row\b([^>]*?)\/?>/.exec(filaXml);
  if (!cabecera) throw new Error('La fila modelo del formato no tiene la forma esperada');
  // Sin el número ni el estado oculto: el número lo pone cada fila, y el estado
  // oculto es justo lo que dejaba el documento en blanco.
  const atributosFila = cabecera[1].replace(/\s+r="\d+"/, '').replace(/\s+hidden="1"/, '');
  const estiloPorColumna = new Map<string, string>();
  for (const celdaXml of filaXml.matchAll(/<c\b([^>]*?)\/?>/g)) {
    const ref = /\br="([A-Z]+)\d+"/.exec(celdaXml[1]);
    const estilo = /\bs="(\d+)"/.exec(celdaXml[1]);
    if (ref && estilo) estiloPorColumna.set(ref[1], estilo[1]);
  }
  return { atributosFila, estiloPorColumna };
}

/** Una celda con su estilo y, si lo hay, su valor. */
function celda(
  columna: string,
  fila: number,
  estilo: string | undefined,
  valor: unknown,
  esNumero: boolean,
): string {
  const s = estilo ? ` s="${estilo}"` : '';
  const ref = `${columna}${fila}`;
  if (valor == null || valor === '') return `<c r="${ref}"${s}/>`;
  if (esNumero) {
    const n = Number(valor);
    return Number.isFinite(n) ? `<c r="${ref}"${s}><v>${n}</v></c>` : `<c r="${ref}"${s}/>`;
  }
  // Cadena en línea, y no en la tabla de cadenas compartidas del libro: así no
  // hay que reescribir esa tabla ni reindexar las celdas que ya la usan.
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${escaparXml(String(valor))}</t></is></c>`;
}

/** La fila `numero` con los datos de `registro`, siguiendo el modelo. */
function filaDeDatos(modelo: Modelo, numero: number, registro: FilaSeguimiento): string {
  const celdas = COLUMNAS.map(([columna, campo]) => {
    const estilo = modelo.estiloPorColumna.get(columna);
    if (!campo) return celda(columna, numero, estilo, null, false);
    if (campo === 'fecha') return celda(columna, numero, estilo, serialDeFecha(registro.fecha), true);
    if (campo === 'colaborador') return celda(columna, numero, estilo, soloNombre(registro.colaborador), false);
    return celda(columna, numero, estilo, registro[campo], NUMERICOS.has(campo));
  });
  return `<row r="${numero}"${modelo.atributosFila}>${celdas.join('')}</row>`;
}

/** La fila modelo, vacía: solo estilo. Es lo que queda cuando no hay datos. */
function filaVacia(modelo: Modelo, numero: number): string {
  const celdas = COLUMNAS.map(([columna]) =>
    celda(columna, numero, modelo.estiloPorColumna.get(columna), null, false),
  );
  return `<row r="${numero}"${modelo.atributosFila}>${celdas.join('')}</row>`;
}

/* ───────────────────────── la hoja ───────────────────────── */

/**
 * Reescribe la hoja SEGUIMIENTO: conserva las filas 1 a 8 tal cual —membrete,
 * totales, encabezados— y pone debajo una fila por registro. Todo lo demás de la
 * hoja queda como estaba, salvo lo que hacía que el documento saliera en blanco o
 * pidiera reparación:
 *
 * - Fuera el autofiltro. Traía un criterio aplicado que ocultaba las filas que no
 *   encajaban en él, y las recién escritas nunca encajan.
 * - Fuera `filterMode` de las propiedades de la hoja: dice que hay filas
 *   filtradas, y sin autofiltro es una incoherencia que Excel señala.
 * - La vista abre en la fila 9, con los encabezados congelados. Venía guardada
 *   en la 8760, muy por debajo de cualquier dato.
 * - La dimensión declara solo lo que hay. Venía en `A1:X1048567`.
 * - El aviso de "número guardado como texto" se amplía a la columna C desde la
 *   fila 9: los códigos de cliente van como texto a propósito ("054") y no hace
 *   falta un triángulo verde en cada uno.
 *
 * Es idempotente: aplicada sobre una hoja ya reescrita da el mismo resultado.
 */
export function reescribirHoja(xml: string, filas: ReadonlyArray<FilaSeguimiento>): string {
  const ini = xml.indexOf('<sheetData>');
  const fin = xml.indexOf('</sheetData>');
  if (ini < 0 || fin < 0) throw new Error('La hoja del formato no tiene datos (sheetData)');

  const originales = filasDe(xml.slice(ini + '<sheetData>'.length, fin));
  const cabecera = originales.filter((f) => numeroDeFila(f) < PRIMERA_FILA_DATOS);
  const filaModelo = originales.find((f) => numeroDeFila(f) === PRIMERA_FILA_DATOS);
  if (cabecera.length !== PRIMERA_FILA_DATOS - 1 || !filaModelo) {
    throw new Error('La hoja del formato no trae las filas de cabecera y la fila modelo que se esperan');
  }
  const modelo = modeloDe(filaModelo);

  const datos =
    filas.length > 0
      ? filas.map((registro, i) => filaDeDatos(modelo, PRIMERA_FILA_DATOS + i, registro))
      : [filaVacia(modelo, PRIMERA_FILA_DATOS)];

  let salida =
    xml.slice(0, ini) +
    '<sheetData>' +
    cabecera.join('') +
    datos.join('') +
    '</sheetData>' +
    xml.slice(fin + '</sheetData>'.length);

  const ultimaFila = PRIMERA_FILA_DATOS - 1 + Math.max(filas.length, 1);
  salida = salida
    .replace(/<sheetPr\b([^>]*?)\s+filterMode="1"([^>]*)\/>/, '<sheetPr$1$2/>')
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:M${ultimaFila}"/>`)
    .replace(/<autoFilter\b[^>]*\/>/s, '')
    .replace(/<autoFilter\b[^>]*>.*?<\/autoFilter>/s, '')
    .replace(/(<pane\b[^>]*?)\s+topLeftCell="[^"]*"/, `$1 topLeftCell="A${PRIMERA_FILA_DATOS}"`)
    .replace(
      /<selection pane="bottomLeft" activeCell="[^"]*" sqref="[^"]*"\/>/,
      `<selection pane="bottomLeft" activeCell="B${PRIMERA_FILA_DATOS}" sqref="B${PRIMERA_FILA_DATOS}"/>`,
    )
    .replace(/<ignoredError sqref="C\d+:C(\d+)"/, `<ignoredError sqref="C${PRIMERA_FILA_DATOS}:C$1"`);

  return salida;
}

/* ───────────────────────── el libro ───────────────────────── */

/**
 * Deja el libro en un estado que Excel abre sin pedir reparación.
 *
 * - Fuera la cadena de cálculo (`calcChain.xml`), que enumera las celdas con
 *   fórmula del archivo original: miles de referencias a filas que ya no
 *   existen. Excel la reconstruye sola al abrir.
 * - Fuera el nombre reservado `_xlnm._FilterDatabase`, que acompañaba al
 *   autofiltro y queda huérfano sin él.
 * - `fullCalcOnLoad`, para que los `SUBTOTAL` de la fila 6 se recalculen sobre lo
 *   que se acaba de escribir en vez de enseñar el resultado guardado de los
 *   datos históricos.
 * - Fuera la ruta interna de red que el archivo guarda en sus metadatos.
 *
 * Idempotente: se aplica también al generar, por si algún día la plantilla se
 * reemplaza por una copia fresca del original.
 */
/**
 * Escribe una parte del zip sin crear entradas de carpeta. jszip añade `xl/`,
 * `docProps/`… al escribir un archivo dentro de ellas; el original no las lleva,
 * y la regla de este servicio es no meter en el zip nada que el original no tenga.
 */
export function escribirParte(zip: JSZip, parte: string, contenido: string): void {
  zip.file(parte, contenido, { createFolders: false });
}

export async function prepararLibro(zip: JSZip): Promise<void> {
  zip.remove('xl/calcChain.xml');

  const patchear = async (parte: string, cambio: (xml: string) => string) => {
    const archivo = zip.file(parte);
    if (!archivo) return;
    escribirParte(zip, parte, cambio(await archivo.async('string')));
  };

  await patchear('[Content_Types].xml', (xml) =>
    xml.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''),
  );
  await patchear('xl/_rels/workbook.xml.rels', (xml) =>
    xml.replace(/<Relationship\b[^>]*Target="calcChain\.xml"[^>]*\/>/, ''),
  );
  await patchear('xl/workbook.xml', (xml) =>
    xml
      .replace(/<definedName name="_xlnm\._FilterDatabase"[^>]*>.*?<\/definedName>/gs, '')
      .replace(/<definedNames>\s*<\/definedNames>/, '')
      .replace(/<definedNames\/>/, '')
      .replace(/<calcPr\b([^>]*?)\/>/, (todo, attrs: string) =>
        /fullCalcOnLoad=/.test(attrs) ? todo : `<calcPr${attrs} fullCalcOnLoad="1"/>`,
      )
      .replace(/<mc:AlternateContent\b[^>]*>.*?absPath.*?<\/mc:AlternateContent>/s, ''),
  );
}

/** Abre la plantilla como zip. */
export async function abrirPlantillaSeguimiento(): Promise<JSZip> {
  if (!fs.existsSync(RUTA_PLANTILLA)) {
    throw new Error(`No se encuentra el formato F-PSD-IDA-001 en: ${RUTA_PLANTILLA}`);
  }
  // Sin entradas de carpeta: el archivo original no las lleva, y la regla de este
  // servicio es no meter en el zip nada que el original no tenga.
  const zip = await JSZip.loadAsync(fs.readFileSync(RUTA_PLANTILLA), { createFolders: false });
  if (!zip.file(PARTE_HOJA)) throw new Error('El formato F-PSD-IDA-001 no tiene la hoja SEGUIMIENTO');
  return zip;
}

/** Genera el seguimiento en el formato oficial y lo devuelve como buffer. */
export async function construirSeguimientoInventario(
  filas: ReadonlyArray<FilaSeguimiento>,
): Promise<Buffer> {
  const zip = await abrirPlantillaSeguimiento();
  const hoja = await zip.file(PARTE_HOJA)!.async('string');
  escribirParte(zip, PARTE_HOJA, reescribirHoja(hoja, filas));
  await prepararLibro(zip);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/** `Seguimiento_Inventario_2026-09-16.xlsx`, o con el rango cuando se acota. */
export function seguimientoFilename(desde?: string | null, hasta?: string | null, hoy = ''): string {
  const limpio = (v: unknown) => String(v ?? '').replace(/[\\/:*?"<>|\s]+/g, '_');
  if (desde && hasta) return `Seguimiento_Inventario_${limpio(desde)}_a_${limpio(hasta)}.xlsx`;
  if (desde) return `Seguimiento_Inventario_desde_${limpio(desde)}.xlsx`;
  if (hasta) return `Seguimiento_Inventario_hasta_${limpio(hasta)}.xlsx`;
  return `Seguimiento_Inventario_${limpio(hoy)}.xlsx`;
}
