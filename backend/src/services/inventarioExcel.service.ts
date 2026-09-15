import ExcelJS from 'exceljs';
import { construirInventarioFuid } from './plantillaFuid.service.js';

const LABELS: Record<string, string> = {
  ITEMS: 'ID',
  CODIGO_DEL_CLIENTE: 'Código del Cliente',
  CLIENTE: 'Cliente',
  No_ACTA: 'N° Acta',
  FECHA_TRANSFERENCIA: 'Fecha Transferencia',
  X200: 'X200',
  X300: 'X300',
  X400: 'X400',
  NC: 'NC',
  TOTAL_CAJAS: 'Total Cajas',
  ANEXOS: 'Anexos',
  FECHA_ENTREGA_CUSTODIA: 'Fecha Entrega Custodia',
  FUNCIONARIO: 'Funcionario',
  ESTADO_DEL_INVENTARIO: 'Estado del Inventario',
  CAJAS_PROCESADAS: 'Cajas Procesadas',
  CAJA_INICIAR: 'Caja Iniciar',
  CAJ_FIN: 'Caja Fin',
  REGISTROS_PROCESADOS: 'Registros Procesados',
  FECHA_ENTREGA: 'Fecha Entrega',
  INICIO_INVENTARIO: 'Inicio Inventario',
  FIN_INVENTARIO: 'Fin Inventario',
  ESTADO_ENTREGA: 'Estado Entrega',
  MES_ENTREGA_PACA: 'Mes Entrega Paca',
};

const ORDER = ['ITEMS', ...Object.keys(LABELS).filter((k) => k !== 'ITEMS')];

/** Builds an .xlsx buffer with one header row (brand red) and one data row. */
export async function buildInventarioExcel(data: Record<string, unknown>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Inventario');

  ws.columns = ORDER.map((key) => ({
    header: LABELS[key] ?? key,
    key,
    width: 24,
  }));

  const row: Record<string, unknown> = {};
  for (const key of ORDER) {
    row[key] = data[key] ?? '';
  }
  ws.addRow(row);

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB91C1C' } } };
  });

  const dataRow = ws.getRow(2);
  dataRow.alignment = { vertical: 'middle' };
  dataRow.eachCell((cell) => {
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ORDER.length } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Safe filename: Inventario_<cliente>_<codigo>_<YYYY-MM-DD>.xlsx (no invalid chars, spaces -> _). */
export function inventarioFilename(cliente: unknown, codigoCliente: unknown, fechaCreacion: unknown): string {
  const clean = (v: unknown, fallback: string) =>
    String(v ?? fallback).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
  const clienteName = clean(cliente, 'sin_cliente');
  const codigo = clean(codigoCliente, 'sin_codigo');
  const raw = fechaCreacion instanceof Date ? fechaCreacion.toISOString() : String(fechaCreacion ?? new Date().toISOString());
  const fecha = raw.slice(0, 10);
  return `Inventario_${clienteName}_${codigo}_${fecha}.xlsx`;
}

/**
 * Inventario de un cliente en el formato oficial F-PSD-001.
 *
 * Antes se armaba una hoja desde cero, con una fila de encabezados en rojo y
 * nada más: servía para revisar, pero no era el formato que se entrega. Ahora
 * sale del mismo archivo que el resto del inventario, con membrete, código de
 * formato y control de cambios, y los registros a partir de la fila 8.
 */
export async function buildInventarioFuidExcel<T extends object>(filas: T[]): Promise<Buffer> {
  return construirInventarioFuid(filas);
}

/** Safe filename: Inventario_FUID_<cliente>_<codigo>_<YYYY-MM-DD>.xlsx (no invalid chars, spaces -> _). */
export function inventarioFuidFilename(cliente: unknown, codigoCliente: unknown, fechaCreacion: unknown): string {
  const clean = (v: unknown, fallback: string) =>
    String(v ?? fallback).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
  const clienteName = clean(cliente, 'sin_cliente');
  const codigo = clean(codigoCliente, 'sin_codigo');
  const raw = fechaCreacion instanceof Date ? fechaCreacion.toISOString() : String(fechaCreacion ?? new Date().toISOString());
  const fecha = raw.slice(0, 10);
  return `Inventario_FUID_${clienteName}_${codigo}_${fecha}.xlsx`;
}