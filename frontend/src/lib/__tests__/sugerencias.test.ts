import { describe, expect, it } from 'vitest';
import {
  completarConSugerencia,
  filtrarPorInicio,
  pistaDeCompletado,
  sugerenciasDeLosRegistros,
} from '@/lib/sugerencias';

/**
 * Los valores de estas pruebas son inventados a propósito y no salen de ninguna
 * caja: lo que se comprueba es cómo se compara el texto, no qué archiva la
 * empresa. Llegan ordenados, como los devuelve quien los reúne.
 */
const DE_LA_CAJA = ['ASUNTO DOS DE PRUEBA', 'ASUNTO UNO DE PRUEBA', 'MATERIAL DE PRUEBA'];

describe('completarConSugerencia', () => {
  it('con dos letras ya propone la primera que empieza así', () => {
    expect(completarConSugerencia('AS', DE_LA_CAJA)).toBe('ASUNTO DOS DE PRUEBA');
  });

  it('da igual escribirlo en minúscula, que es como se teclea', () => {
    expect(completarConSugerencia('mate', DE_LA_CAJA)).toBe('MATERIAL DE PRUEBA');
  });

  it('afina a la que corresponde según se escribe', () => {
    expect(completarConSugerencia('ASUNTO UNO', DE_LA_CAJA)).toBe('ASUNTO UNO DE PRUEBA');
  });

  it('lo que ya está completo no se vuelve a completar', () => {
    expect(completarConSugerencia('MATERIAL DE PRUEBA', DE_LA_CAJA)).toBeNull();
  });

  it('un asunto nuevo que no se parece a ninguno se escribe sin estorbos', () => {
    expect(completarConSugerencia('HISTORIAS LAB', DE_LA_CAJA)).toBeNull();
  });

  it('el campo vacío no propone nada: Tab solo pasa al siguiente', () => {
    expect(completarConSugerencia('', DE_LA_CAJA)).toBeNull();
    expect(completarConSugerencia('   ', DE_LA_CAJA)).toBeNull();
  });

  it('sin sugerencias cargadas todavía, Tab no completa nada', () => {
    expect(completarConSugerencia('AS', undefined)).toBeNull();
    expect(completarConSugerencia('AS', [])).toBeNull();
  });

  it('no completa por el medio de la palabra, solo por el principio', () => {
    expect(completarConSugerencia('PRUEBA', DE_LA_CAJA)).toBeNull();
  });
});

describe('pistaDeCompletado', () => {
  it('dice qué va a poner Tab', () => {
    expect(pistaDeCompletado('MATERIAL DE PRUEBA')).toBe('Tab completa: MATERIAL DE PRUEBA');
  });

  it('recorta lo largo, porque el formulario es una cuadrícula apretada', () => {
    const pista = pistaDeCompletado('ASUNTO MUY LARGO QUE NO CABE EN LA PISTA DEL CAMPO');
    expect(pista).toMatch(/^Tab completa: ASUNTO MUY LARGO/);
    expect(pista!.endsWith('…')).toBe(true);
    expect(pista!.length).toBeLessThanOrEqual('Tab completa: '.length + 32);
  });

  it('sin nada que completar no hay pista', () => {
    expect(pistaDeCompletado(null)).toBeUndefined();
  });
});

describe('sugerenciasDeLosRegistros', () => {
  const registros = [
    { asunto_2: 'ASUNTO UNO DE PRUEBA', serie: 'SERIE DE PRUEBA' },
    { asunto_2: 'ASUNTO DOS DE PRUEBA', serie: 'SERIE DE PRUEBA' },
    { asunto_2: 'ASUNTO UNO DE PRUEBA', serie: 'N/A' },
    { asunto_2: '  ', serie: null },
  ];

  it('reúne lo escrito en la caja campo por campo, sin repetir', () => {
    const mapa = sugerenciasDeLosRegistros(registros, ['asunto_2', 'serie']);
    expect(mapa.asunto_2).toEqual(['ASUNTO DOS DE PRUEBA', 'ASUNTO UNO DE PRUEBA']);
    expect(mapa.serie).toEqual(['SERIE DE PRUEBA']);
  });

  it('deja fuera el marcador N/A y lo que está en blanco', () => {
    const mapa = sugerenciasDeLosRegistros(registros, ['serie']);
    expect(mapa.serie).not.toContain('N/A');
    expect(mapa.serie).toHaveLength(1);
  });

  it('un campo sin nada escrito queda como lista vacía, no como hueco', () => {
    const mapa = sugerenciasDeLosRegistros(registros, ['notas']);
    expect(mapa.notas).toEqual([]);
  });

  it('una caja recién abierta no sugiere nada', () => {
    expect(sugerenciasDeLosRegistros([], ['asunto_2']).asunto_2).toEqual([]);
  });
});

describe('filtrarPorInicio', () => {
  it('trae lo que empieza por lo tecleado, en minúscula también', () => {
    expect(filtrarPorInicio(DE_LA_CAJA, 'asunto')).toEqual([
      'ASUNTO DOS DE PRUEBA',
      'ASUNTO UNO DE PRUEBA',
    ]);
  });

  it('sin nada escrito no propone nada', () => {
    expect(filtrarPorInicio(DE_LA_CAJA, '')).toEqual([]);
  });

  it('no busca por el medio de la palabra', () => {
    expect(filtrarPorInicio(DE_LA_CAJA, 'PRUEBA')).toEqual([]);
  });

  it('ofrece ocho como mucho: es una ayuda, no el contenido de la caja', () => {
    const muchas = Array.from({ length: 20 }, (_, i) => `VALOR ${i}`);
    expect(filtrarPorInicio(muchas, 'VALOR')).toHaveLength(8);
  });
});
