import { beforeEach, describe, expect, it } from 'vitest';
import {
  clienteDeUrl,
  idDeCliente,
  leerClienteRecordado,
  recordarCliente,
  rutaDeClientes,
} from '@/lib/clienteRecordado';

describe('el cliente recordado entre pantallas', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('solo acepta como id un entero positivo', () => {
    expect(idDeCliente('5')).toBe(5);
    expect(idDeCliente(' 12 ')).toBe(12);
    expect(idDeCliente('0')).toBeNull();
    expect(idDeCliente('-3')).toBeNull();
    expect(idDeCliente('abc')).toBeNull();
    expect(idDeCliente('')).toBeNull();
    expect(idDeCliente(null)).toBeNull();
    expect(idDeCliente(undefined)).toBeNull();
  });

  it('lee el cliente de la URL cuando viene, y nada cuando no', () => {
    expect(clienteDeUrl(new URLSearchParams('cliente=7'))).toBe(7);
    expect(clienteDeUrl(new URLSearchParams('cliente=siete'))).toBeNull();
    expect(clienteDeUrl(new URLSearchParams(''))).toBeNull();
  });

  it('recuerda la elección por cuenta y la olvida al soltarla', () => {
    recordarCliente('1001', 4);
    expect(leerClienteRecordado('1001')).toBe(4);
    // Otra cuenta en el mismo navegador no hereda el cliente de la anterior.
    expect(leerClienteRecordado('2002')).toBeNull();

    recordarCliente('1001', null);
    expect(leerClienteRecordado('1001')).toBeNull();
  });

  it('no se deja engañar por un valor guardado a mano que no sea un id', () => {
    localStorage.setItem('luciernaga.clientes.seleccionado:1001', 'lo que sea');
    expect(leerClienteRecordado('1001')).toBeNull();
  });

  it('arma la ruta de vuelta con el cliente cuando se conoce', () => {
    expect(rutaDeClientes(5)).toBe('/clientes?cliente=5');
    expect(rutaDeClientes(null)).toBe('/clientes');
    expect(rutaDeClientes(undefined)).toBe('/clientes');
  });
});
