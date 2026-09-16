/**
 * Prepara la plantilla del seguimiento de inventario a partir del archivo
 * original que entregó el cliente.
 *
 *   npx tsx scripts/plantilla/preparar-seguimiento.mts "<ruta al original>.xlsx"
 *
 * Deja `assets/plantilla/F-PSD-IDA-001.xlsx` listo para que el servicio le
 * escriba filas debajo de la cabecera. Qué hace, y por qué cada cosa:
 *
 * - Conserva cada parte del zip byte a byte salvo las que toca explícitamente.
 *   Este archivo lleva rangos protegidos, formatos condicionales y extensiones
 *   que ninguna librería de Excel para Node reescribe bien: si se abre y se
 *   guarda con ExcelJS, Excel pide reparación. Por eso no se pasa por ninguna.
 * - Quita las 8.947 filas históricas y deja la fila 9 vacía como modelo de
 *   estilo, igual que hace el formato F-PSD-001 del inventario.
 * - Quita el autofiltro, el modo de filtro, la cadena de cálculo y el nombre
 *   reservado del filtro, que son lo que hacía que el documento saliera en
 *   blanco o pidiera reparación (ver `prepararLibro` y `reescribirHoja`).
 * - Poda la tabla de cadenas compartidas: traía 826 textos, y casi todos eran
 *   nombres de digitadores y códigos de los datos históricos. Un documento que
 *   se entrega a un cliente no debe llevar dentro los nombres de quien digitó.
 * - Limpia los metadatos: la ruta interna de red y el nombre de la última persona
 *   que guardó el archivo.
 *
 * Se ejecuta una vez y se versiona el resultado. No corre en producción.
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {
  PARTE_HOJA,
  escribirParte,
  prepararLibro,
  reescribirHoja,
} from '../../src/services/seguimientoInventario.service.js';

const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) {
  console.error('Uso: npx tsx scripts/plantilla/preparar-seguimiento.mts "<ruta al original>.xlsx"');
  process.exit(1);
}
const destino = path.resolve('assets', 'plantilla', 'F-PSD-IDA-001.xlsx');

// Sin entradas de carpeta: el original no las lleva y no hay que añadir nada.
const zip = await JSZip.loadAsync(fs.readFileSync(origen), { createFolders: false });

// 1. La hoja: cabecera intacta, filas históricas fuera, fila 9 como modelo.
const hoja = await zip.file(PARTE_HOJA)!.async('string');
escribirParte(zip, PARTE_HOJA, reescribirHoja(hoja, []));

// 2. El libro: sin cadena de cálculo, sin nombre de filtro, con recálculo al abrir.
await prepararLibro(zip);

// 3. Tabla de cadenas: solo lo que las hojas siguen usando.
const partesHoja = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
const usados = new Set<number>();
const textos = new Map<string, string>();
for (const parte of partesHoja) {
  const xml = await zip.file(parte)!.async('string');
  textos.set(parte, xml);
  for (const m of xml.matchAll(/<c\b[^>]*\bt="s"[^>]*><v>(\d+)<\/v>/g)) usados.add(Number(m[1]));
}
const sst = await zip.file('xl/sharedStrings.xml')!.async('string');
const entradas = [...sst.matchAll(/<si>.*?<\/si>/gs)].map((m) => m[0]);
const conservados = [...usados].sort((a, b) => a - b);
const nuevoIndice = new Map(conservados.map((viejo, nuevo) => [viejo, nuevo]));
const cabeceraSst = /^[\s\S]*?<sst\b[^>]*>/.exec(sst)![0].replace(
  /\bcount="\d+"\s+uniqueCount="\d+"/,
  `count="${conservados.length}" uniqueCount="${conservados.length}"`,
);
escribirParte(zip, 'xl/sharedStrings.xml', cabeceraSst + conservados.map((i) => entradas[i]).join('') + '</sst>');
for (const [parte, xml] of textos) {
  escribirParte(
    zip,
    parte,
    xml.replace(/(<c\b[^>]*\bt="s"[^>]*>)<v>(\d+)<\/v>/g, (_t, apertura: string, i: string) => {
      const n = nuevoIndice.get(Number(i));
      if (n === undefined) throw new Error(`Cadena ${i} referenciada pero no conservada`);
      return `${apertura}<v>${n}</v>`;
    }),
  );
}

// 4. Metadatos: nada personal ni interno.
const core = await zip.file('docProps/core.xml')!.async('string');
escribirParte(
  zip,
  'docProps/core.xml',
  core
    .replace(/<dc:creator>.*?<\/dc:creator>/s, '<dc:creator>Luciérnaga</dc:creator>')
    .replace(/<cp:lastModifiedBy>.*?<\/cp:lastModifiedBy>/s, '<cp:lastModifiedBy>Luciérnaga</cp:lastModifiedBy>')
    .replace(/<cp:lastPrinted>.*?<\/cp:lastPrinted>/s, ''),
);

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(
  destino,
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }),
);

const bytes = fs.statSync(destino).size;
console.log(`Plantilla escrita en ${destino}`);
console.log(`  cadenas conservadas: ${conservados.length} de ${entradas.length}`);
console.log(`  tamaño: ${Math.round(bytes / 1024)} KB`);
