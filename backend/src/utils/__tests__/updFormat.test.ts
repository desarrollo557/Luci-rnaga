import { describe, expect, it } from 'vitest';
import {
  UPD_MAX,
  formatUpd,
  isUpdNumberInRange,
  isUpdValid,
  nextUpd,
  normalizeUpd,
  toNumeric,
} from '../updFormat.js';

/**
 * El UPD identifica cada unidad documental en toda la base: los FUID se
 * referencian por él y la técnica arranca una caja fijando el UPD inicial. Un
 * UPD de ocho dígitos o uno repetido no se detecta al digitarlo, sino cuando ya
 * hay cientos de registros colgando de él.
 */

describe('cómo se normaliza lo que se digita', () => {
  it('recorta espacios y pasa a mayúsculas', () => {
    expect(normalizeUpd('  upd2950001  ')).toBe('UPD2950001');
  });

  it('nulo y sin dato dan cadena vacía, no "NULL"', () => {
    expect(normalizeUpd(null)).toBe('');
    expect(normalizeUpd(undefined)).toBe('');
  });
});

describe('qué se acepta como UPD', () => {
  it('UPD y exactamente siete dígitos', () => {
    expect(isUpdValid('UPD2950001')).toBe(true);
    expect(isUpdValid('UPD0000000')).toBe(true);
  });

  it('rechaza seis y ocho dígitos', () => {
    expect(isUpdValid('UPD295000')).toBe(false);
    expect(isUpdValid('UPD29500011')).toBe(false);
  });

  it('rechaza el prefijo en minúscula y el que no lo lleva', () => {
    // `isUpdValid` se aplica sobre el valor ya normalizado.
    expect(isUpdValid('upd2950001')).toBe(false);
    expect(isUpdValid('2950001')).toBe(false);
  });

  it('rechaza letras o símbolos dentro del número', () => {
    expect(isUpdValid('UPD29500O1')).toBe(false);
    expect(isUpdValid('UPD295-001')).toBe(false);
  });
});

describe('conversión entre el texto y el número', () => {
  it('ida y vuelta conserva el valor', () => {
    expect(toNumeric('UPD2950001')).toBe(2950001);
    expect(formatUpd(2950001)).toBe('UPD2950001');
  });

  it('rellena con ceros a la izquierda hasta siete dígitos', () => {
    expect(formatUpd(1)).toBe('UPD0000001');
    expect(formatUpd(0)).toBe('UPD0000000');
  });

  it('conserva los ceros de la izquierda al leer', () => {
    expect(toNumeric('UPD0000042')).toBe(42);
  });
});

describe('el límite de los siete dígitos', () => {
  it('UPD_MAX es 9999999', () => {
    expect(UPD_MAX).toBe(9999999);
    expect(formatUpd(UPD_MAX)).toBe('UPD9999999');
  });

  it('acepta el rango completo y rechaza lo que se sale', () => {
    expect(isUpdNumberInRange(0)).toBe(true);
    expect(isUpdNumberInRange(UPD_MAX)).toBe(true);
    expect(isUpdNumberInRange(UPD_MAX + 1)).toBe(false);
    expect(isUpdNumberInRange(-1)).toBe(false);
  });

  it('rechaza decimales y valores que no son número', () => {
    expect(isUpdNumberInRange(12.5)).toBe(false);
    expect(isUpdNumberInRange(Number.NaN)).toBe(false);
  });
});

describe('el UPD siguiente, que es el que encadena la digitación', () => {
  it('suma uno', () => {
    expect(nextUpd('UPD2950001')).toBe('UPD2950002');
  });

  it('arrastra el acarreo sin perder dígitos', () => {
    expect(nextUpd('UPD0000099')).toBe('UPD0000100');
    expect(nextUpd('UPD0999999')).toBe('UPD1000000');
  });

  it('acepta lo que venga sin normalizar', () => {
    expect(nextUpd('  upd2950001 ')).toBe('UPD2950002');
  });

  it('se detiene en el último posible en vez de pasar a ocho dígitos', () => {
    // Sin este tope saldría "UPD10000000", que ya no casa con el formato y
    // rompería todas las referencias que lo usan.
    expect(nextUpd('UPD9999999')).toBeNull();
  });

  it('devuelve null si el de partida no es válido', () => {
    expect(nextUpd('UPD123')).toBeNull();
    expect(nextUpd('')).toBeNull();
    expect(nextUpd('SIN UPD')).toBeNull();
  });
});
