import { describe, expect, it } from 'vitest';
import { contieneTodos, filtrarPorTexto, normalizar, terminosDe, textoBuscable } from '../busqueda';

/**
 * Búsqueda por texto de las listas de la interfaz.
 *
 * Lo que se comprueba es lo que distingue a este buscador de un `includes`: que
 * las tildes no estorben, porque todo se guarda en mayúsculas y quien escribe
 * rápido no las pone; y que varias palabras acoten en conjunto y en cualquier
 * orden, que es como se busca de verdad cuando una lista es larga.
 */

const registros = [
  { upd: 'UPD2950001', asunto: 'SOLICITUD DE PRÓRROGA', folios: '24', estado: 'OK' },
  { upd: 'UPD2950002', asunto: 'CONTRATO DE OBRA 2024', folios: '10', estado: 'SIN REVISAR' },
  { upd: 'UPD2950003', asunto: 'CONTRATO DE SUMINISTRO 2025', folios: '8', estado: 'SIN REVISAR' },
];
const campos = (r: (typeof registros)[number]) => [r.upd, r.asunto, r.folios, r.estado];
const updsDe = (lista: readonly (typeof registros)[number][]) => lista.map((r) => r.upd);

describe('normalizar', () => {
  it('quita tildes y baja a minúsculas', () => {
    expect(normalizar('PRÓRROGA')).toBe('prorroga');
    expect(normalizar('Ñandú')).toBe('nandu');
  });

  it('un valor ausente es una cadena vacía, no un "null" buscable', () => {
    expect(normalizar(null)).toBe('');
    expect(normalizar(undefined)).toBe('');
    expect(normalizar(0)).toBe('0');
  });
});

describe('terminosDe', () => {
  it('parte la consulta en palabras y descarta los espacios sobrantes', () => {
    expect(terminosDe('  contrato   2024 ')).toEqual(['contrato', '2024']);
  });

  it('una consulta vacía no deja ningún término', () => {
    expect(terminosDe('   ')).toEqual([]);
  });
});

describe('contieneTodos', () => {
  it('exige todas las palabras, no una cualquiera', () => {
    const texto = textoBuscable(['UPD2950002', 'CONTRATO DE OBRA 2024']);
    expect(contieneTodos(texto, ['contrato', '2024'])).toBe(true);
    expect(contieneTodos(texto, ['contrato', '2025'])).toBe(false);
  });

  it('sin términos, todo pasa', () => {
    expect(contieneTodos('lo que sea', [])).toBe(true);
  });
});

describe('filtrarPorTexto', () => {
  it('encuentra aunque no se escriban las tildes', () => {
    expect(updsDe(filtrarPorTexto(registros, 'prorroga', campos))).toEqual(['UPD2950001']);
  });

  it('acota con cada palabra que se añade, en cualquier orden', () => {
    expect(updsDe(filtrarPorTexto(registros, 'contrato', campos))).toEqual(['UPD2950002', 'UPD2950003']);
    expect(updsDe(filtrarPorTexto(registros, 'contrato 2025', campos))).toEqual(['UPD2950003']);
    expect(updsDe(filtrarPorTexto(registros, '2025 contrato', campos))).toEqual(['UPD2950003']);
  });

  it('busca en todos los campos que se le den, no solo en el asunto', () => {
    expect(updsDe(filtrarPorTexto(registros, 'UPD2950003', campos))).toEqual(['UPD2950003']);
    expect(updsDe(filtrarPorTexto(registros, '24', campos))).toEqual(['UPD2950001', 'UPD2950002']);
    expect(updsDe(filtrarPorTexto(registros, 'sin revisar', campos))).toEqual(['UPD2950002', 'UPD2950003']);
  });

  it('sin consulta devuelve la misma lista, sin copiarla', () => {
    expect(filtrarPorTexto(registros, '   ', campos)).toBe(registros);
  });

  it('lo que no encaja con nada deja la lista vacía', () => {
    expect(filtrarPorTexto(registros, 'inexistente', campos)).toEqual([]);
  });
});
