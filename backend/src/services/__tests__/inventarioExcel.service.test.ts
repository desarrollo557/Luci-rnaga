import { describe, expect, it } from 'vitest';
import { inventarioFuidFilename } from '../inventarioExcel.service.js';

/**
 * Nombre del archivo que se baja desde la pantalla de Inventario.
 *
 * Importa porque de un mismo cliente se descargan ahora varios archivos: el FUID
 * completo y el de cada acta de transferencia. Si el nombre no dijera de cuál es
 * cada uno, en la carpeta de descargas habría que abrirlos para distinguirlos.
 */
describe('nombre del inventario FUID', () => {
  it('sin acta, nombra al cliente y su código', () => {
    expect(inventarioFuidFilename('ALCALDIA DE SOLEDAD', '901', '2026-09-16')).toBe(
      'Inventario_FUID_ALCALDIA_DE_SOLEDAD_901_2026-09-16.xlsx',
    );
  });

  it('con acta, la intercala antes de la fecha', () => {
    expect(inventarioFuidFilename('ALCALDIA DE SOLEDAD', '901', '2026-09-16', 'ACTA-002')).toBe(
      'Inventario_FUID_ALCALDIA_DE_SOLEDAD_901_Acta_ACTA-002_2026-09-16.xlsx',
    );
  });

  it('dos actas del mismo cliente dan archivos distintos', () => {
    const primera = inventarioFuidFilename('HOSPITAL', '902', '2026-09-16', 'ACTA-001');
    const segunda = inventarioFuidFilename('HOSPITAL', '902', '2026-09-16', 'ACTA-002');
    expect(primera).not.toBe(segunda);
  });

  it('el acta no ensucia el nombre con caracteres que el sistema de archivos rechaza', () => {
    const nombre = inventarioFuidFilename('CLIENTE', '903', '2026-09-16', 'ACTA 01/2026');
    expect(nombre).toBe('Inventario_FUID_CLIENTE_903_Acta_ACTA_01_2026_2026-09-16.xlsx');
    expect(nombre).not.toMatch(/[\/:*?"<>|]/);
  });

  it('un acta vacía se trata como si no viniera', () => {
    const sinActa = inventarioFuidFilename('CLIENTE', '903', '2026-09-16');
    expect(inventarioFuidFilename('CLIENTE', '903', '2026-09-16', '')).toBe(sinActa);
    expect(inventarioFuidFilename('CLIENTE', '903', '2026-09-16', null)).toBe(sinActa);
  });
});
