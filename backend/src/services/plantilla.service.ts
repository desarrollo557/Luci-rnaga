import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { query } from '../config/db.js';
import { sqlOrdenEnCaja } from './fuid.service.js';
import type { FuidDato } from '../types/db.js';
import { RAIZ_BACKEND, abrirPlantillaFuid, escribirFilasFuid } from './plantillaFuid.service.js';

// Junto al resto de `backend/`, no donde se haya arrancado el proceso.
const TEMP_DIR = path.join(RAIZ_BACKEND, 'temp');

export interface PlantillaFiltros {
  caja?: string;
  entidad_remitente?: string;
  /**
   * Devuelve el formato en blanco, sin consultar la base.
   *
   * Sin esta bandera, una petición sin filtros arrastra la tabla completa
   * (más de 80.000 registros), que es justo lo contrario de lo que espera
   * quien pide "la plantilla general".
   */
  vacia?: boolean;
}

/** Genera el archivo .xlsx a partir de la plantilla y devuelve la ruta de salida. */
export async function generarPlantilla(
  fileName: string,
  filtros: PlantillaFiltros,
): Promise<{ outputPath: string; count: number }> {
  const rows = filtros.vacia ? [] : await consultarDatos(filtros);
  const { libro, hoja } = await abrirPlantillaFuid();
  return escribirFilas(libro, hoja, rows, fileName);
}

async function consultarDatos(filtros: PlantillaFiltros): Promise<FuidDato[]> {
  let sql = `SELECT
      f.n_orden, o.n_orden_caja, f.codigo, f.entidad_remitente, f.entidad_productora,
      f.unidad_administrativa, f.oficina_productora, f.objeto, f.serie, f.subserie,
      f.asunto, f.numero_doc, f.numero_doc_hasta, f.fecha_inicial,
      f.fecha_final, f.caja, f.upd, f.tomo, f.otro, f.caja_interna, f.folios, f.soporte,
      f.frecuencia, f.notas, f.elaborado_por, f.fecha_del_dato, f.nro_acta_transferible,
      f.fecha_transferencia
    FROM fuiddatosreal f
    JOIN ${sqlOrdenEnCaja()} o ON o.id = f.id
    WHERE 1=1`;
  const params: unknown[] = [];

  if (filtros.caja) {
    sql += ' AND f.caja = ?';
    params.push(filtros.caja);
  }
  if (filtros.entidad_remitente) {
    sql += ' AND f.entidad_remitente LIKE ?';
    params.push(`%${filtros.entidad_remitente}%`);
  }

  // Sin orden explícito, el motor devuelve las filas como le conviene y el
  // inventario salía descolocado: los registros van por el consecutivo de la
  // caja, que es como se leen en el papel.
  sql += ' ORDER BY f.caja, o.n_orden_caja';

  const rows = await query<FuidDato>(sql, params);
  if (!rows || rows.length === 0) {
    throw new Error('No se encontraron datos en la base de datos.');
  }
  return rows;
}

/** Vuelca los registros en el formato y lo guarda en el directorio temporal. */
async function escribirFilas(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  rows: FuidDato[],
  fileName: string,
): Promise<{ outputPath: string; count: number }> {
  escribirFilasFuid(worksheet, rows);

  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = path.join(TEMP_DIR, `${safeName}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);

  return { outputPath, count: rows.length };
}
