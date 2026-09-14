import * as XLSX from 'xlsx';

/**
 * Dispara la descarga de un blob en el navegador.
 *
 * Centraliza los tres detalles que hacen fallar una descarga: el enlace debe
 * estar en el documento antes de pulsarlo (Firefox ignora el click en un nodo
 * suelto), debe retirarse después, y la URL temporal no puede revocarse en el
 * mismo tick porque algunos navegadores cancelan la transferencia en curso.
 */
export function descargarBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

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

  descargarBlob(blob, `${fileName}.xlsx`);
}

export { XLSX };
/**
 * Fecha de hoy en formato `YYYY-MM-DD`, tomada del calendario **local**.
 *
 * No usa `toISOString()` a propósito: ese método convierte a UTC, y en Colombia
 * (UTC-5) cualquier momento posterior a las 19:00 ya cae en el día siguiente en
 * UTC. Un formulario abierto a las 20:00 quedaría fechado mañana.
 */
export function fechaHoyISO(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}
