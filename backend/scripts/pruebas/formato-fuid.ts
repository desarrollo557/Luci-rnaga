/**
 * Comprueba que el inventario sale en el formato oficial F-PSD-001.
 *
 *   npx tsx scripts/pruebas/formato-fuid.ts
 *
 * Genera el inventario con los registros reales de la base y vuelve a abrir el
 * archivo para verificar lo que las pruebas unitarias no pueden ver: que el
 * membrete, el logo, las celdas combinadas y los 27 encabezados siguen ahí
 * despues de escribir los datos, que hay una fila por registro a partir de la
 * 8 y que las fechas se escriben como fecha.
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { query } from '../../src/config/db.js';
import { construirInventarioFuid } from '../../src/services/plantillaFuid.service.js';

const SALIDA = process.env.SALIDA_FORMATO ?? path.resolve(process.cwd(), 'temp', 'formato-fuid.xlsx');

const filas = await query<Record<string, unknown>>(
  `SELECT n_orden, codigo, entidad_remitente, entidad_productora, unidad_administrativa,
          oficina_productora, objeto, serie, subserie, asunto, numero_doc, numero_doc_hasta,
          fecha_inicial, fecha_final, caja, upd, tomo, otro, caja_interna, folios, soporte,
          frecuencia, notas, elaborado_por, fecha_del_dato, nro_acta_transferible, fecha_transferencia
     FROM fuiddatosreal ORDER BY caja, n_orden NULLS LAST, upd`,
);
console.log('registros reales leidos:', filas.length);

const inicio = Date.now();
const buffer = await construirInventarioFuid(filas);
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, buffer);
console.log('generado en', Date.now() - inicio, 'ms | peso:', (buffer.length / 1024).toFixed(1), 'KB');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SALIDA);
const ws = wb.getWorksheet('F-PSD-001')!;
const texto = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const r = v as { richText?: { text: string }[]; text?: string };
    return (r.richText ? r.richText.map((t) => t.text).join('') : (r.text ?? '')).trim();
  }
  return String(v ?? '').trim();
};

const comprobaciones: [string, boolean, string][] = [
  ['conserva las dos hojas', wb.worksheets.length === 2, wb.worksheets.map((w) => w.name).join(', ')],
  ['conserva el logo', ws.getImages().length === 1, String(ws.getImages().length)],
  ['conserva las celdas combinadas', Object.keys((ws as unknown as { _merges: object })._merges).length === 12, ''],
  ['titulo del formato', texto(ws.getRow(3).getCell(4).value) === 'ÚNICO DE INVENTARIO DOCUMENTAL (FUID)', texto(ws.getRow(3).getCell(4).value)],
  ['codigo del formato', texto(ws.getRow(1).getCell(26).value) === 'F-PSD-001', texto(ws.getRow(1).getCell(26).value)],
  ['grupo No. DOCUMENTO', texto(ws.getRow(6).getCell(11).value) === 'No. DOCUMENTO', texto(ws.getRow(6).getCell(11).value)],
  ['encabezado 1 = N° Orden', texto(ws.getRow(7).getCell(1).value) === 'N° Orden', texto(ws.getRow(7).getCell(1).value)],
  ['encabezado 27 = FECHA DE TRANSFERENCIA', texto(ws.getRow(7).getCell(27).value) === 'FECHA DE TRANSFERENCIA', texto(ws.getRow(7).getCell(27).value)],
  ['los datos empiezan en la fila 8', texto(ws.getRow(8).getCell(16).value) !== '', 'UPD=' + texto(ws.getRow(8).getCell(16).value)],
];

// Todas las filas de la base deben estar, y ninguna de más.
const ultima = 7 + filas.length;
comprobaciones.push([
  'escribe una fila por registro',
  texto(ws.getRow(ultima).getCell(16).value) !== '' && texto(ws.getRow(ultima + 1).getCell(16).value) === '',
  `ultima fila ${ultima}`,
]);
// El primer registro debe coincidir campo a campo con la base.
const primero = filas[0];
comprobaciones.push([
  'el primer registro coincide con la base',
  texto(ws.getRow(8).getCell(16).value) === String(primero.upd ?? '').trim() &&
    texto(ws.getRow(8).getCell(15).value) === String(primero.caja ?? '').trim(),
  `caja ${texto(ws.getRow(8).getCell(15).value)} / upd ${texto(ws.getRow(8).getCell(16).value)}`,
]);
comprobaciones.push([
  'las fechas salen como fecha, no como texto',
  ws.getRow(8).getCell(25).value instanceof Date || filas[0].fecha_del_dato == null,
  String(ws.getRow(8).getCell(25).numFmt ?? '-'),
]);
comprobaciones.push([
  'las filas nuevas heredan los bordes del formato',
  Boolean(ws.getRow(Math.min(ultima, 20)).getCell(1).border?.left),
  '',
]);

let fallos = 0;
for (const [nombre, ok, detalle] of comprobaciones) {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK ' : 'MAL'}  ${nombre}${detalle ? '  → ' + detalle : ''}`);
}
console.log(fallos === 0 ? '\nTodo en verde' : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
