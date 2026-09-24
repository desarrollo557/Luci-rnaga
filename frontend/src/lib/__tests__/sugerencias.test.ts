import { describe, expect, it } from 'vitest';
import { completarConSugerencia, pistaDeCompletado } from '@/lib/sugerencias';

const DE_LA_CAJA = [
  'SOPORTES CONTABLES',
  'SOPORTES DE PAGO Y SERVICIOS PUBLICOS',
  'EXPEDIENTE ADQUISICION DE PREDIOS',
];

describe('completarConSugerencia', () => {
  it('con dos letras ya propone la primera que empieza así', () => {
    expect(completarConSugerencia('SO', DE_LA_CAJA)).toBe('SOPORTES CONTABLES');
  });

  it('da igual escribirlo en minúscula, que es como se teclea', () => {
    expect(completarConSugerencia('expe', DE_LA_CAJA)).toBe('EXPEDIENTE ADQUISICION DE PREDIOS');
  });

  it('afina a la que corresponde según se escribe', () => {
    expect(completarConSugerencia('SOPORTES DE', DE_LA_CAJA)).toBe('SOPORTES DE PAGO Y SERVICIOS PUBLICOS');
  });

  it('lo que ya está completo no se vuelve a completar', () => {
    expect(completarConSugerencia('SOPORTES CONTABLES', DE_LA_CAJA)).toBeNull();
  });

  it('un asunto nuevo que no se parece a ninguno se escribe sin estorbos', () => {
    expect(completarConSugerencia('HISTORIAS LAB', DE_LA_CAJA)).toBeNull();
  });

  it('el campo vacío no propone nada: Tab solo pasa al siguiente', () => {
    expect(completarConSugerencia('', DE_LA_CAJA)).toBeNull();
    expect(completarConSugerencia('   ', DE_LA_CAJA)).toBeNull();
  });

  it('sin sugerencias cargadas todavía, Tab no completa nada', () => {
    expect(completarConSugerencia('SO', undefined)).toBeNull();
    expect(completarConSugerencia('SO', [])).toBeNull();
  });

  it('no completa por el medio de la palabra, solo por el principio', () => {
    expect(completarConSugerencia('PAGO', DE_LA_CAJA)).toBeNull();
  });
});

describe('pistaDeCompletado', () => {
  it('dice qué va a poner Tab', () => {
    expect(pistaDeCompletado('SOPORTES CONTABLES')).toBe('Tab completa: SOPORTES CONTABLES');
  });

  it('recorta lo largo, porque el formulario es una cuadrícula apretada', () => {
    const pista = pistaDeCompletado('SOPORTES DE PAGO Y SERVICIOS PUBLICOS');
    expect(pista).toBe('Tab completa: SOPORTES DE PAGO Y SERVICIOS PU…');
    expect(pista!.length).toBeLessThanOrEqual('Tab completa: '.length + 32);
  });

  it('sin nada que completar no hay pista', () => {
    expect(pistaDeCompletado(null)).toBeUndefined();
  });
});
