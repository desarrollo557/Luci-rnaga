import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  abrirFormatoSeguimiento,
  construirSeguimientoInventario,
  escribirFilasSeguimiento,
  seguimientoFilename,
  type FilaSeguimiento,
} from '../seguimientoInventario.service.js';

/**
 * El formato oficial de seguimiento, F-PSD-IDA-001.
 *
 * Es un documento que se entrega firmado, así que lo que se comprueba aquí no es
 * que "se genere un Excel" sino que salga siendo el formato aprobado: su
 * membrete, su logo, su código de versión y su rejilla. Si el archivo se
 * construyera desde cero en vez de partir del original, nada de eso fallaría de
 * forma visible en las pruebas y sí en la entrega.
 *
 * Las fechas se comprueban aparte porque ya mordieron una vez en el inventario:
 * el driver devuelve las columnas `date` como texto y, al convertirlas mal, el
 * día retrocedía uno.
 */

const FILA: FilaSeguimiento = {
  fecha: '2026-09-15',
  codigo_cliente: '054',
  caja_ini: 2406,
  caja_fin: 2410,
  total_cajas: 5,
  upd_ini: 1040018,
  upd_fin: 1040493,
  total_registros: 476,
  colaborador: 'GLORIA CASTAÑEDA (1046812542)',
  tipo_documental: null,
  acta: 'ACTA-001',
};

/** Genera el archivo y lo vuelve a abrir, como haría quien lo recibe. */
async function generarYAbrir(filas: FilaSeguimiento[]): Promise<ExcelJS.Worksheet> {
  const buffer = await construirSeguimientoInventario(filas);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro.getWorksheet('SEGUIMIENTO')!;
}

describe('el archivo es el formato aprobado, no uno parecido', () => {
  it('conserva el membrete y el código de versión', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getCell('D3').value).toBe('SEGUIMIENTO DE INVENTARIO');
    expect(hoja.getCell('L1').value).toBe('F-PSD-IDA-001');
    expect(hoja.getCell('L2').value).toBe('002');
  });

  it('conserva el logo del membrete', async () => {
    const buffer = await construirSeguimientoInventario([FILA]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.model.media?.length ?? 0).toBe(1);
  });

  it('conserva las dos hojas, incluida la de la regla', async () => {
    const buffer = await construirSeguimientoInventario([FILA]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['SEGUIMIENTO', 'REGLA']);
  });

  it('conserva los encabezados en su orden', async () => {
    const hoja = await generarYAbrir([FILA]);
    const encabezados = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) =>
      String(hoja.getRow(8).getCell(c).value ?? '').trim(),
    );
    expect(encabezados).toEqual([
      'FECHA',
      'CODIGO CLIENTE',
      '#CAJA_INI SIAR',
      '#CAJ_FIN SIAR',
      'TOT_CAJ SIAR',
      'UPD_INI',
      'UPD_FIN',
      'TOTAL_REGISTROS',
      'COLABORADOR',
      'TIPO DOCUMENTAL',
      'ACTA DE TRANSFERENCIA',
    ]);
  });
});

describe('los datos caen donde el formato los espera', () => {
  it('la primera fila de datos es la 9', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getRow(9).getCell(3).value).toBe('054');
    expect(hoja.getRow(9).getCell(9).value).toBe(476);
  });

  it('cada fila va debajo de la anterior', async () => {
    const hoja = await generarYAbrir([FILA, { ...FILA, codigo_cliente: '901', total_registros: 50 }]);
    expect(hoja.getRow(9).getCell(3).value).toBe('054');
    expect(hoja.getRow(10).getCell(3).value).toBe('901');
    expect(hoja.getRow(10).getCell(9).value).toBe(50);
  });

  it('hereda el estilo de la fila modelo: fuente y formato de fecha', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getRow(9).getCell(2).numFmt).toBe('dd/mm/yyyy;@');
    expect(hoja.getRow(9).getCell(2).font?.name).toBe('Arial Narrow');
  });

  it('un campo sin dato queda vacío, no en cero ni en texto', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getRow(9).getCell(11).value).toBeNull();
  });
});

describe('la fecha no se mueve un día', () => {
  it('escribe una fecha de verdad, no el texto', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getRow(9).getCell(2).value).toBeInstanceOf(Date);
  });

  it('respeta el día que devuelve la base', async () => {
    const hoja = await generarYAbrir([FILA]);
    const fecha = hoja.getRow(9).getCell(2).value as Date;
    expect(fecha.getDate()).toBe(15);
    expect(fecha.getMonth() + 1).toBe(9);
    expect(fecha.getFullYear()).toBe(2026);
  });

  it('una fecha ausente deja la celda vacía', async () => {
    const hoja = await generarYAbrir([{ ...FILA, fecha: null }]);
    expect(hoja.getRow(9).getCell(2).value).toBeNull();
  });
});

describe('el colaborador sale sin su cédula', () => {
  it('escribe solo el nombre', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getRow(9).getCell(10).value).toBe('GLORIA CASTAÑEDA');
  });

  it('no queda la cédula en ninguna celda del archivo', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(JSON.stringify(hoja.getSheetValues())).not.toContain('1046812542');
  });
});

describe('los totales del formato', () => {
  it('se dejan como fórmula, para que Excel los calcule sobre lo escrito', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getCell('F6').value).toHaveProperty('formula');
    expect(hoja.getCell('I6').value).toHaveProperty('formula');
  });

  it('no arrastran el total de los datos históricos del archivo original', async () => {
    // El archivo que entregó el cliente traía cacheado el total de sus 8.900
    // filas. Sin limpiarlo, el documento nuevo enseñaría esa cifra vieja.
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.getCell('F6').value).not.toHaveProperty('result');
    expect(hoja.getCell('I6').value).not.toHaveProperty('result');
  });
});

describe('la plantilla de la que se parte', () => {
  it('llega sin filas de datos: las históricas se quitaron', async () => {
    const { hoja } = await abrirFormatoSeguimiento();
    const vacia = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(
      (c) => hoja.getRow(9).getCell(c).value == null,
    );
    expect(vacia).toBe(true);
  });

  it('escribir cero filas no rompe el archivo', async () => {
    const { hoja } = await abrirFormatoSeguimiento();
    expect(escribirFilasSeguimiento(hoja, [])).toBe(0);
  });
});

describe('el nombre del archivo dice de qué periodo es', () => {
  it('con rango, lo nombra', () => {
    expect(seguimientoFilename('2026-09-01', '2026-09-15')).toBe(
      'Seguimiento_Inventario_2026-09-01_a_2026-09-15.xlsx',
    );
  });

  it('con solo una fecha, lo dice', () => {
    expect(seguimientoFilename('2026-09-01', null)).toContain('desde_2026-09-01');
    expect(seguimientoFilename(null, '2026-09-15')).toContain('hasta_2026-09-15');
  });

  it('sin fechas, usa el día de la descarga', () => {
    expect(seguimientoFilename(null, null, '2026-09-16')).toBe('Seguimiento_Inventario_2026-09-16.xlsx');
  });
});

/**
 * Que el documento se vea.
 *
 * El archivo que entregó el cliente traía un autofiltro con un criterio aplicado
 * y 2.346 filas ocultas desde la novena, justo donde van los datos, y la vista
 * guardada en la fila 8760. La plantilla heredó las tres cosas: el seguimiento se
 * generaba con todo dentro y Excel lo enseñaba vacío.
 *
 * Es el peor tipo de fallo de los que se pueden tener aquí, porque **ninguna
 * comprobación de contenido lo detecta**: las celdas tienen sus valores y
 * cualquier librería los lee. Solo se nota al abrir el archivo. De ahí que estas
 * pruebas miren el estado de presentación y no lo escrito.
 */
describe('el documento se abre mostrando los datos', () => {
  it('ninguna fila escrita queda oculta', async () => {
    const hoja = await generarYAbrir([FILA, { ...FILA, codigo_cliente: '901' }]);
    expect(hoja.getRow(9).hidden).toBeFalsy();
    expect(hoja.getRow(10).hidden).toBeFalsy();
  });

  it('no queda ninguna fila oculta en toda la hoja', async () => {
    const hoja = await generarYAbrir([FILA]);
    const ocultas: number[] = [];
    hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
      if (fila.hidden) ocultas.push(numero);
    });
    expect(ocultas).toEqual([]);
  });

  it('no queda autofiltro: un criterio guardado esconde lo que se acaba de escribir', async () => {
    const hoja = await generarYAbrir([FILA]);
    expect(hoja.autoFilter).toBeFalsy();
  });

  it('la vista abre arriba, no desplazada a una zona vacía', async () => {
    const hoja = await generarYAbrir([FILA]);
    const vista = hoja.views?.[0] as { topLeftCell?: string } | undefined;
    expect(vista?.topLeftCell).toBe('A1');
  });

  it('los encabezados quedan congelados donde el formato los tiene', async () => {
    const hoja = await generarYAbrir([FILA]);
    const vista = hoja.views?.[0] as { state?: string; ySplit?: number } | undefined;
    expect(vista?.state).toBe('frozen');
    expect(vista?.ySplit).toBe(8);
  });
});

describe('la plantilla de la que se parte ya viene limpia', () => {
  it('sin filas ocultas', async () => {
    const { hoja } = await abrirFormatoSeguimiento();
    const ocultas: number[] = [];
    hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
      if (fila.hidden) ocultas.push(numero);
    });
    expect(ocultas).toEqual([]);
  });

  it('sin autofiltro', async () => {
    const { hoja } = await abrirFormatoSeguimiento();
    expect(hoja.autoFilter).toBeFalsy();
  });
});
