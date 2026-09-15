import { describe, expect, it } from 'vitest';
import {
  VALOR_VACIO,
  detectarCamposVacios,
  esValorVacio,
  rellenarCamposVacios,
} from '../camposVacios';

/**
 * La regla de los campos sin diligenciar, en el lado de la interfaz.
 *
 * Quien digita llena lo que el documento tiene y deja en blanco lo que no
 * conoce; al guardar se le dice qué campos van vacíos y, si confirma, se
 * guardan como `N/A`. Lo que se prueba aquí es el freno de seguridad de esa
 * regla: **solo se rellena lo que está declarado en el mapa de etiquetas**. Un
 * campo de fecha o numérico marcado por error rellenaría con `N/A` una columna
 * que no lo admite.
 */

interface Formulario {
  serie: string;
  subserie: string;
  notas: string;
  fecha_inicial: string;
  n_orden: number;
}

const etiquetas = { serie: 'Serie', subserie: 'Subserie', notas: 'Notas' } as const;

const formulario: Formulario = {
  serie: '',
  subserie: 'CONTRATOS',
  notas: '   ',
  fecha_inicial: '',
  n_orden: 0,
};

describe('qué campos se detectan como vacíos', () => {
  it('los que están en blanco', () => {
    expect(detectarCamposVacios(formulario, etiquetas)).toEqual([
      { campo: 'serie', label: 'Serie' },
      { campo: 'notas', label: 'Notas' },
    ]);
  });

  it('un campo con solo espacios cuenta como vacío', () => {
    const vacios = detectarCamposVacios({ ...formulario, notas: '     ' }, etiquetas);
    expect(vacios.map((v) => v.campo)).toContain('notas');
  });

  it('un campo con dato no se toca', () => {
    const vacios = detectarCamposVacios(formulario, etiquetas);
    expect(vacios.map((v) => v.campo)).not.toContain('subserie');
  });

  it('respeta el orden del mapa, que es el del formulario', () => {
    const todos = detectarCamposVacios(
      { ...formulario, subserie: '' },
      etiquetas,
    );
    expect(todos.map((v) => v.campo)).toEqual(['serie', 'subserie', 'notas']);
  });
});

describe('lo que nunca debe rellenarse', () => {
  it('un campo que no está declarado se ignora aunque esté vacío', () => {
    // `fecha_inicial` está en blanco, pero no aparece en el mapa: es una
    // columna `date` y `N/A` no cabe en ella.
    const vacios = detectarCamposVacios(formulario, etiquetas);
    expect(vacios.map((v) => v.campo)).not.toContain('fecha_inicial');
  });

  it('un valor que no es texto no se considera vacío', () => {
    const vacios = detectarCamposVacios(formulario, {
      ...etiquetas,
      n_orden: 'N° Orden',
    } as never);
    expect(vacios.map((v) => v.campo)).not.toContain('n_orden');
  });

  it('una etiqueta vacía no habilita el campo', () => {
    const vacios = detectarCamposVacios(formulario, { serie: '' } as never);
    expect(vacios).toEqual([]);
  });
});

describe('cómo queda el formulario al confirmar', () => {
  it('pone el marcador en los campos indicados', () => {
    const vacios = detectarCamposVacios(formulario, etiquetas);
    const resultado = rellenarCamposVacios(formulario, vacios);
    expect(resultado.serie).toBe(VALOR_VACIO);
    expect(resultado.notas).toBe(VALOR_VACIO);
  });

  it('no toca los demás campos', () => {
    const vacios = detectarCamposVacios(formulario, etiquetas);
    const resultado = rellenarCamposVacios(formulario, vacios);
    expect(resultado.subserie).toBe('CONTRATOS');
    expect(resultado.fecha_inicial).toBe('');
    expect(resultado.n_orden).toBe(0);
  });

  it('devuelve una copia y deja intacto el original', () => {
    const vacios = detectarCamposVacios(formulario, etiquetas);
    const resultado = rellenarCamposVacios(formulario, vacios);
    expect(resultado).not.toBe(formulario);
    expect(formulario.serie).toBe('');
  });

  it('sin campos vacíos, el formulario sale igual', () => {
    const lleno = { ...formulario, serie: 'OFICIOS', notas: 'SIN NOTAS' };
    expect(rellenarCamposVacios(lleno, [])).toEqual(lleno);
  });
});

describe('reconocer el marcador', () => {
  it('detecta N/A en cualquier forma', () => {
    expect(esValorVacio('N/A')).toBe(true);
    expect(esValorVacio(' n/a ')).toBe(true);
  });

  it('no confunde un dato real con el marcador', () => {
    expect(esValorVacio('NA')).toBe(false);
    expect(esValorVacio('N/A/B')).toBe(false);
    expect(esValorVacio('')).toBe(false);
    expect(esValorVacio(null)).toBe(false);
  });
});
