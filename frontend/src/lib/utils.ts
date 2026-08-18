import * as XLSX from 'xlsx';

/**
 * Exporta datos a un archivo Excel (.xlsx) y dispara la descarga.
 * @param title Título de la hoja (aparece en la primera fila)
 * @param headers Encabezados de columna [ { label, key } ]
 * @param rows Filas de datos (objetos con valores por key)
 * @param fileName Nombre del archivo (sin extensión)
 */
export function exportExcel(
  title: string,
  headers: { label: string; key: string }[],
  rows: any[],
  fileName: string = 'reporte'
) {
  // 1. Construir la matriz de filas: [header..., ...rowData]
  const worksheetData: any[] = [];

  // Fila de encabezados
  worksheetData.push(headers.map((h) => h.label));

  // Filas de datos
  for (const row of rows) {
    worksheetData.push(
      headers.map((h) => {
        const value = row[h.key] ?? '';
        // Convertir a string si es número/boolean/null/undefined
        return value != null ? String(value) : '';
      })
    );
  }

  // 2. Crear libro y hoja
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Opcional: ancho de columna automático
  if (worksheet['!cols'] === undefined) {
    worksheet['!cols'] = headers.map(() => ({ wch: 25 }));
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, title);

  // 3. Generar blob y disparar descarga
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export { XLSX };