import ExcelJS from 'exceljs';

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

/** Safe filename: Inventario_<id>_<codigo>.xlsx (no invalid chars, spaces -> _). */
export function inventarioFilename(id: number | string, codigoCliente: unknown): string {
  const codigo = String(codigoCliente ?? 'sin_codigo').replace(/[\\/:*?"<>|\s]+/g, '_');
  return `Inventario_${id}_${codigo}.xlsx`;
}