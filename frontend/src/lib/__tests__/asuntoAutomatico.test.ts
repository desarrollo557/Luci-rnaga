import { describe, expect, it } from 'vitest';
import { asuntosAutomaticosDe, seEligeDeLaLista } from '@/lib/asuntoAutomatico';
import type { FuidDato } from '@/types';

/**
 * Registro mínimo: de todo el FUID, aquí solo importan el asunto automático y
 * el número de orden, que es lo que ordena la lista.
 */
function registro(n_orden: number, asunto_2: string | null): FuidDato {
  return { id: n_orden, n_orden, asunto_2 } as unknown as FuidDato;
}

describe('asuntosAutomaticosDe', () => {
  it('no repite el asunto cuando toda la caja es del mismo', () => {
    const registros = [
      registro(1, 'APROVECHAMIENTOS'),
      registro(2, 'APROVECHAMIENTOS'),
      registro(3, 'APROVECHAMIENTOS'),
    ];
    expect(asuntosAutomaticosDe(registros)).toEqual(['APROVECHAMIENTOS']);
  });

  it('los devuelve en el orden en que se digitaron, no alfabético', () => {
    const registros = [
      registro(3, 'SOPORTES DE PAGO Y SERVICIOS PUBLICOS'),
      registro(1, 'EXPEDIENTE ADQUISICION DE PREDIOS'),
      registro(2, 'INVERSIONES JMJ LA CANDELARIA SAS'),
    ];
    expect(asuntosAutomaticosDe(registros)).toEqual([
      'EXPEDIENTE ADQUISICION DE PREDIOS',
      'INVERSIONES JMJ LA CANDELARIA SAS',
      'SOPORTES DE PAGO Y SERVICIOS PUBLICOS',
    ]);
  });

  it('deja fuera el marcador N/A, que no es un asunto que nadie quiera repetir', () => {
    const registros = [registro(1, 'CONTRATOS'), registro(2, 'N/A'), registro(3, 'n/a'), registro(4, null)];
    expect(asuntosAutomaticosDe(registros)).toEqual(['CONTRATOS']);
  });

  it('no distingue dos asuntos que solo difieren en espacios de sobra', () => {
    const registros = [registro(1, 'CONTRATOS'), registro(2, '  CONTRATOS  ')];
    expect(asuntosAutomaticosDe(registros)).toEqual(['CONTRATOS']);
  });

  it('una caja recién abierta no tiene ninguno', () => {
    expect(asuntosAutomaticosDe([])).toEqual([]);
  });
});

describe('seEligeDeLaLista', () => {
  it('con un solo asunto no hay nada que elegir: sigue el campo de texto heredado', () => {
    expect(seEligeDeLaLista(['APROVECHAMIENTOS'], false)).toBe(false);
  });

  it('una caja vacía tampoco ofrece selector', () => {
    expect(seEligeDeLaLista([], false)).toBe(false);
  });

  it('desde dos asuntos distintos el campo se elige de la lista', () => {
    expect(seEligeDeLaLista(['APROVECHAMIENTOS', 'CONTRATOS'], false)).toBe(true);
  });

  it('haber pedido escribir uno nuevo manda sobre la lista', () => {
    expect(seEligeDeLaLista(['APROVECHAMIENTOS', 'CONTRATOS'], true)).toBe(false);
  });
});
