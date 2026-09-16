import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  PARTE_HOJA,
  abrirPlantillaSeguimiento,
  construirSeguimientoInventario,
  escaparXml,
  prepararLibro,
  reescribirHoja,
  seguimientoFilename,
  serialDeFecha,
  type FilaSeguimiento,
} from '../seguimientoInventario.service.js';

/**
 * El formato oficial de seguimiento, F-PSD-IDA-001.
 *
 * Este documento se entrega firmado, y ya salió mal dos veces antes de salir
 * bien: primero en blanco, porque la plantilla arrastraba filas ocultas y un
 * autofiltro del archivo original; después pidiendo reparación al abrir, porque
 * la librería con la que se reescribía el libro no soporta lo que ese archivo
 * lleva dentro. Por eso el servicio edita el XML del zip a mano, y por eso estas
 * pruebas miran **el XML que sale**, no solo lo que una librería lee de él: las
 * dos veces anteriores, las librerías leían los datos perfectamente y Excel no.
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

/** Genera el archivo y devuelve sus partes, como las vería quien lo inspeccione. */
async function generar(filas: FilaSeguimiento[]) {
  const buffer = await construirSeguimientoInventario(filas);
  const zip = await JSZip.loadAsync(buffer);
  const parte = (nombre: string) => zip.file(nombre)!.async('string');
  return { zip, hoja: await parte(PARTE_HOJA), libro: await parte('xl/workbook.xml'), parte };
}

/** Las filas de la hoja, por número. */
function filasDe(hojaXml: string): Map<number, string> {
  const cuerpo = /<sheetData>(.*?)<\/sheetData>/s.exec(hojaXml)![1];
  const mapa = new Map<number, string>();
  for (const m of cuerpo.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>.*?<\/row>/gs)) mapa.set(Number(m[1]), m[0]);
  return mapa;
}

/** Una celda concreta de una fila, por su letra. */
function celda(filaXml: string, columna: string): string | undefined {
  return [...filaXml.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>.*?<\/c>)/gs)].find((m) => m[1] === columna)?.[0];
}

describe('el número de serie de una fecha', () => {
  it('coincide con el que Excel guarda', () => {
    // 4 de febrero de 2020: es el valor que trae la fila 9 del archivo original.
    expect(serialDeFecha('2020-02-04')).toBe(43865);
  });

  it('no se mueve un día con la zona horaria', () => {
    // Medianoche en Colombia es las 5 de la mañana en UTC del mismo día; el serial
    // tiene que ser el del día que dice el texto, no el anterior ni el siguiente.
    expect(serialDeFecha('2026-09-15')).toBe(serialDeFecha('2026-09-15T05:00:00.000Z'));
    expect(serialDeFecha(new Date(2026, 8, 15, 23, 30))).toBe(serialDeFecha('2026-09-15'));
  });

  it('lo que no es una fecha da null', () => {
    expect(serialDeFecha(null)).toBeNull();
    expect(serialDeFecha('N/A')).toBeNull();
    expect(serialDeFecha('')).toBeNull();
    expect(serialDeFecha(new Date('no'))).toBeNull();
  });
});

describe('las cadenas van escapadas', () => {
  it('los cinco caracteres que rompen un XML', () => {
    expect(escaparXml(`A&B<C>"D'E`)).toBe('A&amp;B&lt;C&gt;&quot;D&apos;E');
  });
});

describe('la hoja generada', () => {
  it('conserva las ocho filas de cabecera tal cual', async () => {
    const plantilla = await abrirPlantillaSeguimiento();
    const original = filasDe(await plantilla.file(PARTE_HOJA)!.async('string'));
    const { hoja } = await generar([FILA]);
    const generada = filasDe(hoja);
    for (let n = 1; n <= 8; n++) expect(generada.get(n), `fila ${n}`).toBe(original.get(n));
  });

  it('escribe una fila por registro a partir de la 9', async () => {
    const { hoja } = await generar([FILA, { ...FILA, codigo_cliente: '901' }]);
    const filas = filasDe(hoja);
    expect([...filas.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(celda(filas.get(10)!, 'C')).toContain('<t>901</t>');
  });

  it('la fecha va como número de serie con el estilo de fecha del formato', async () => {
    const { hoja } = await generar([FILA]);
    expect(celda(filasDe(hoja).get(9)!, 'B')).toBe('<c r="B9" s="32"><v>46280</v></c>');
  });

  it('los textos van en línea, sin tocar la tabla de cadenas compartidas', async () => {
    const plantilla = await abrirPlantillaSeguimiento();
    const antes = await plantilla.file('xl/sharedStrings.xml')!.async('string');
    const { hoja, parte } = await generar([FILA]);
    expect(celda(filasDe(hoja).get(9)!, 'C')).toContain('t="inlineStr"><is><t>054</t></is>');
    expect(await parte('xl/sharedStrings.xml')).toBe(antes);
  });

  it('el colaborador sale sin su cédula', async () => {
    const { hoja } = await generar([FILA]);
    expect(celda(filasDe(hoja).get(9)!, 'J')).toContain('<t>GLORIA CASTAÑEDA</t>');
    expect(hoja).not.toContain('1046812542');
  });

  it('escapa lo que rompería el XML', async () => {
    const { hoja } = await generar([{ ...FILA, acta: 'A & B <C> "D"' }]);
    expect(celda(filasDe(hoja).get(9)!, 'L')).toContain('<t>A &amp; B &lt;C&gt; &quot;D&quot;</t>');
  });

  it('un campo sin dato queda como celda vacía con su borde', async () => {
    const { hoja } = await generar([{ ...FILA, tipo_documental: null, fecha: null }]);
    const fila = filasDe(hoja).get(9)!;
    expect(celda(fila, 'K')).toBe('<c r="K9" s="114"/>');
    expect(celda(fila, 'B')).toBe('<c r="B9" s="32"/>');
  });

  it('sin registros deja la fila 9 vacía con su estilo, no la quita', async () => {
    const { hoja } = await generar([]);
    const fila = filasDe(hoja).get(9)!;
    expect(fila).toBeDefined();
    expect(fila).not.toContain('<v>');
  });

  it('ninguna fila escrita queda oculta', async () => {
    const { hoja } = await generar([FILA, FILA, FILA]);
    for (const [, fila] of filasDe(hoja)) expect(fila).not.toMatch(/<row\b[^>]*hidden="1"/);
  });

  it('la dimensión declara exactamente lo que hay', async () => {
    const { hoja } = await generar([FILA, FILA, FILA]);
    expect(hoja).toContain('<dimension ref="A1:M11"/>');
  });

  it('no queda autofiltro ni modo de filtro', async () => {
    const { hoja } = await generar([FILA]);
    expect(hoja).not.toContain('<autoFilter');
    expect(hoja).not.toContain('filterMode');
  });

  it('la vista abre en la fila 9 con los encabezados congelados', async () => {
    const { hoja } = await generar([FILA]);
    expect(hoja).toMatch(/<pane\b[^>]*ySplit="8"[^>]*topLeftCell="A9"[^>]*state="frozen"/);
    expect(hoja).toContain('<selection pane="bottomLeft" activeCell="B9" sqref="B9"/>');
  });

  it('conserva el logo, los formatos condicionales y los rangos protegidos del original', async () => {
    const { hoja, zip } = await generar([FILA]);
    expect(hoja).toContain('<drawing r:id="rId2"/>');
    expect(zip.file('xl/media/image1.png')).not.toBeNull();
    expect(hoja).toContain('<conditionalFormatting');
    expect(hoja).toContain('<protectedRange');
  });

  it('es idempotente: reescribir lo reescrito da lo mismo', async () => {
    const plantilla = await abrirPlantillaSeguimiento();
    const xml = await plantilla.file(PARTE_HOJA)!.async('string');
    const una = reescribirHoja(xml, [FILA]);
    expect(reescribirHoja(una, [FILA])).toBe(una);
  });
});

describe('el libro generado abre sin pedir reparación', () => {
  it('no lleva cadena de cálculo, que apuntaba a filas que ya no existen', async () => {
    const { zip, parte } = await generar([FILA]);
    expect(zip.file('xl/calcChain.xml')).toBeNull();
    expect(await parte('[Content_Types].xml')).not.toContain('calcChain');
    expect(await parte('xl/_rels/workbook.xml.rels')).not.toContain('calcChain');
  });

  it('no lleva el nombre reservado del autofiltro, que quedaba huérfano', async () => {
    const { libro } = await generar([FILA]);
    expect(libro).not.toContain('_xlnm');
    expect(libro).not.toContain('<definedNames');
  });

  it('recalcula al abrir, para que los totales no enseñen cifras viejas', async () => {
    const { libro } = await generar([FILA]);
    expect(libro).toMatch(/<calcPr\b[^>]*fullCalcOnLoad="1"/);
  });

  it('no lleva entradas de carpeta ni partes que el original no tenga', async () => {
    const { zip } = await generar([FILA]);
    const nombres = Object.keys(zip.files);
    expect(nombres.filter((n) => n.endsWith('/'))).toEqual([]);
    expect(nombres).toContain('xl/styles.xml');
    expect(nombres).toContain('xl/drawings/drawing1.xml');
  });

  it('no lleva la ruta interna de red ni nombres de personas en los metadatos', async () => {
    const { libro, parte } = await generar([FILA]);
    expect(libro).not.toContain('absPath');
    expect(await parte('docProps/core.xml')).toContain('<dc:creator>Luciérnaga</dc:creator>');
  });

  it('preparar el libro dos veces no cambia nada la segunda', async () => {
    const zip = await abrirPlantillaSeguimiento();
    await prepararLibro(zip);
    const una = await zip.file('xl/workbook.xml')!.async('string');
    await prepararLibro(zip);
    expect(await zip.file('xl/workbook.xml')!.async('string')).toBe(una);
  });

  it('todas las partes son XML bien formado', async () => {
    const { zip, parte } = await generar([FILA, { ...FILA, acta: 'A & B' }]);
    for (const nombre of Object.keys(zip.files).filter((n) => /\.(xml|rels)$/.test(n))) {
      const xml = await parte(nombre);
      // Sin analizador de XML en Node: se comprueba lo que un texto roto delataría.
      expect(xml.startsWith('<?xml'), nombre).toBe(true);
      expect((xml.match(/</g) ?? []).length, `${nombre}: etiquetas sin cerrar`).toBe(
        (xml.match(/>/g) ?? []).length,
      );
      expect(xml, `${nombre}: ampersand sin escapar`).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
    }
  });
});

describe('la plantilla de la que se parte ya viene limpia', () => {
  it('trae la cabecera y una fila 9 vacía, y ninguna más', async () => {
    const zip = await abrirPlantillaSeguimiento();
    const filas = filasDe(await zip.file(PARTE_HOJA)!.async('string'));
    expect([...filas.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(filas.get(9)).not.toContain('<v>');
  });

  it('no arrastra los nombres de los digitadores del archivo original', async () => {
    const zip = await abrirPlantillaSeguimiento();
    const cadenas = await zip.file('xl/sharedStrings.xml')!.async('string');
    expect(cadenas).not.toContain('GLORIA');
    expect(cadenas).toContain('COLABORADOR');
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
