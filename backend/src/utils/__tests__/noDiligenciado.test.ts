import { describe, expect, it } from 'vitest';
import { sinDiligenciar, valorParaGuardar } from '../noDiligenciado.js';
import { VALOR_NO_DILIGENCIADO } from '../../config/constants.js';

describe('qué cuenta como campo sin diligenciar', () => {
  it('lo vacío, lo ausente y lo que son solo espacios', () => {
    expect(sinDiligenciar(null)).toBe(true);
    expect(sinDiligenciar(undefined)).toBe(true);
    expect(sinDiligenciar('')).toBe(true);
    expect(sinDiligenciar('   ')).toBe(true);
  });

  it('un valor escrito no lo es, ni siquiera el cero', () => {
    expect(sinDiligenciar('0')).toBe(false);
    expect(sinDiligenciar(0)).toBe(false);
    expect(sinDiligenciar('HISTORIAS CLINICAS')).toBe(false);
  });
});

describe('con qué valor se guarda', () => {
  it('N/A en las columnas de texto', () => {
    expect(valorParaGuardar('', true)).toBe(VALOR_NO_DILIGENCIADO);
    expect(valorParaGuardar(null, true)).toBe(VALOR_NO_DILIGENCIADO);
  });

  it('NULL en las columnas que no admiten el marcador', () => {
    expect(valorParaGuardar('', false)).toBeNull();
    expect(valorParaGuardar(undefined, false)).toBeNull();
  });

  it('el valor tal cual cuando sí se diligenció', () => {
    expect(valorParaGuardar('TUTELA', true)).toBe('TUTELA');
    expect(valorParaGuardar(12, false)).toBe(12);
  });
});
