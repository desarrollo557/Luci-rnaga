import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { query } from '../config/db.js';
import type { FuidDato } from '../types/db.js';

const TEMPLATE_PATH = path.resolve(process.cwd(), 'assets', 'plantilla', 'PLANTILLA.xlsx');
const TEMP_DIR = path.resolve(process.cwd(), 'temp');

export interface PlantillaFiltros {
  caja?: string;
  entidad_remitente?: string;
}

function formatDateNoTime(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Genera el archivo .xlsx a partir de la plantilla y devuelve la ruta de salida. */
export async function generarPlantilla(
  fileName: string,
  filtros: PlantillaFiltros,
): Promise<{ outputPath: string; count: number }> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`La plantilla no existe en: ${TEMPLATE_PATH}`);
  }

  let sql = `SELECT
      n_orden, codigo, entidad_remitente, entidad_productora,
      unidad_administrativa, oficina_productora, objeto, serie, subserie,
      asunto, numero_doc, numero_doc_hasta, fecha_inicial,
      fecha_final, caja, upd, tomo, otro, caja_interna, folios, soporte,
      frecuencia, notas, elaborado_por, fecha_del_dato, nro_acta_transferible,
      fecha_transferencia
    FROM fuiddatosreal WHERE 1=1`;
  const params: unknown[] = [];

  if (filtros.caja) {
    sql += ' AND caja = ?';
    params.push(filtros.caja);
  }
  if (filtros.entidad_remitente) {
    sql += ' AND entidad_remitente LIKE ?';
    params.push(`%${filtros.entidad_remitente}%`);
  }

  const rows = await query<FuidDato>(sql, params);
  if (!rows || rows.length === 0) {
    throw new Error('No se encontraron datos en la base de datos.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    throw new Error('La plantilla no tiene una hoja válida');
  }

  let startRow = 8;
  rows.forEach((dato) => {
    const row = worksheet.getRow(startRow++);
    row.getCell(1).value = dato.n_orden;
    row.getCell(2).value = dato.codigo;
    row.getCell(3).value = dato.entidad_remitente;
    row.getCell(4).value = dato.entidad_productora;
    row.getCell(5).value = dato.unidad_administrativa;
    row.getCell(6).value = dato.oficina_productora;
    row.getCell(7).value = dato.objeto;
    row.getCell(8).value = dato.serie;
    row.getCell(9).value = dato.subserie;
    row.getCell(10).value = dato.asunto;
    row.getCell(11).value = dato.numero_doc;
    row.getCell(12).value = dato.numero_doc_hasta;

    const fechaInicial = formatDateNoTime(dato.fecha_inicial);
    if (fechaInicial) {
      row.getCell(13).value = fechaInicial;
      row.getCell(13).numFmt = 'DD/MM/YYYY';
    }
    const fechaFinal = formatDateNoTime(dato.fecha_final);
    if (fechaFinal) {
      row.getCell(14).value = fechaFinal;
      row.getCell(14).numFmt = 'DD/MM/YYYY';
    }
    row.getCell(15).value = dato.caja;
    row.getCell(16).value = dato.upd;
    row.getCell(17).value = dato.tomo;
    row.getCell(18).value = dato.otro;
    row.getCell(19).value = dato.caja_interna;
    row.getCell(20).value = dato.folios;
    row.getCell(21).value = dato.soporte;
    row.getCell(22).value = dato.frecuencia;
    row.getCell(23).value = dato.notas;
    row.getCell(24).value = dato.elaborado_por;
    const fechaDelDato = formatDateNoTime(dato.fecha_del_dato);
    if (fechaDelDato) {
      row.getCell(25).value = fechaDelDato;
      row.getCell(25).numFmt = 'DD/MM/YYYY';
    }
    row.getCell(26).value = dato.nro_acta_transferible;
    const fechaTransferencia = formatDateNoTime(dato.fecha_transferencia);
    if (fechaTransferencia) {
      row.getCell(27).value = fechaTransferencia;
      row.getCell(27).numFmt = 'DD/MM/YYYY';
    }
    row.commit();
  });

  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = path.join(TEMP_DIR, `${safeName}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);

  return { outputPath, count: rows.length };
}
