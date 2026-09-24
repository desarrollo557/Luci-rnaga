import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ArbolDeCajas, type CajaDelPanel } from '../ArbolDeCajas';

/**
 * El árbol de cajas del panel: cliente, acta y caja.
 *
 * Lo que se comprueba es qué se ve sin abrir nada —que es de lo que se quejaba
 * la tabla anterior, que lo enseñaba todo— y que lo que tiene trabajo a medias
 * no quede escondido detrás de dos clics.
 *
 * Los clientes y las cajas son inventados.
 */

function caja(parcial: Partial<CajaDelPanel> & { id: number }): CajaDelPanel {
  return {
    caja_modulo: `001C00000${parcial.id}`,
    codigo_cliente: '001',
    entidad_cliente: 'CLIENTE DE PRUEBA',
    acta: '100',
    estado_caja: 'FINALIZADO',
    fecha_finalizacion: '2026-09-20',
    fuid_creados: 5,
    fuid_hoy: 0,
    ultimo_upd_caja: 'UPD0000010',
    rango_inicio: 'UPD0000001',
    rango_ultimo: 'UPD0000010',
    ...parcial,
  };
}

const pintar = (cajas: CajaDelPanel[]) =>
  render(
    <MemoryRouter>
      <ArbolDeCajas cajas={cajas} />
    </MemoryRouter>,
  );

describe('el árbol de cajas del panel', () => {
  it('cerrado enseña el cliente y cuántas cajas tiene, no las cajas', () => {
    pintar([caja({ id: 1 }), caja({ id: 2 })]);
    expect(screen.getByText('CLIENTE DE PRUEBA')).toBeInTheDocument();
    expect(screen.getByText('10 registros · 2 cajas')).toBeInTheDocument();
    expect(screen.queryByText('001C000001')).not.toBeInTheDocument();
  });

  it('avisa en el cliente de cuántas cajas quedaron sin terminar', () => {
    pintar([caja({ id: 1 }), caja({ id: 2, estado_caja: 'EN PROCESO', fecha_finalizacion: null })]);
    // Dos veces: en el cliente y en su acta, que viene abierta por tener la
    // caja a medias. Cada nivel cuenta lo suyo.
    expect(screen.getAllByText('10 registros · 2 cajas · 1 sin terminar')).toHaveLength(2);
  });

  it('lo que tiene trabajo a medias viene abierto, sin tener que buscarlo', () => {
    pintar([caja({ id: 7, estado_caja: 'EN PROCESO', fecha_finalizacion: null })]);
    expect(screen.getByText('001C000007')).toBeInTheDocument();
  });

  it('abrir el cliente enseña sus actas, y el acta sus cajas', async () => {
    pintar([caja({ id: 1 })]);
    expect(screen.queryByText('Acta 100')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('CLIENTE DE PRUEBA'));
    expect(screen.getByText('Acta 100')).toBeInTheDocument();
    expect(screen.queryByText('001C000001')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Acta 100'));
    expect(screen.getByText('001C000001')).toBeInTheDocument();
    expect(screen.getByText('Digitar')).toBeInTheDocument();
  });

  it('separa las actas del mismo cliente', async () => {
    pintar([caja({ id: 1, acta: '100' }), caja({ id: 2, acta: '200' })]);
    await userEvent.click(screen.getByText('CLIENTE DE PRUEBA'));
    expect(screen.getByText('Acta 100')).toBeInTheDocument();
    expect(screen.getByText('Acta 200')).toBeInTheDocument();
  });

  it('una caja heredada sin cliente ni acta también se ve', async () => {
    pintar([caja({ id: 9, codigo_cliente: null, entidad_cliente: null, acta: null })]);
    await userEvent.click(screen.getByText('Sin cliente'));
    expect(screen.getByText('Sin acta')).toBeInTheDocument();
  });

  it('sin cajas asignadas lo dice, en vez de dejar un hueco', () => {
    pintar([]);
    expect(screen.getByText('No hay cajas asignadas.')).toBeInTheDocument();
  });
});

describe('lo producido en cada nivel', () => {
  it('el cliente suma los registros de todas sus actas', async () => {
    pintar([
      caja({ id: 1, acta: '100', fuid_creados: 40 }),
      caja({ id: 2, acta: '200', fuid_creados: 60 }),
    ]);
    expect(screen.getByText('100 registros · 2 cajas')).toBeInTheDocument();

    await userEvent.click(screen.getByText('CLIENTE DE PRUEBA'));
    expect(screen.getByText('40 registros · 1 caja')).toBeInTheDocument();
    expect(screen.getByText('60 registros · 1 caja')).toBeInTheDocument();
  });

  it('lo de hoy se dice aparte, y solo cuando hay algo hoy', async () => {
    pintar([caja({ id: 1, fuid_creados: 40, fuid_hoy: 12 })]);
    expect(screen.getByText('40 registros · 12 hoy · 1 caja')).toBeInTheDocument();

    await userEvent.click(screen.getByText('CLIENTE DE PRUEBA'));
    await userEvent.click(screen.getByText('Acta 100'));
    // Tres veces: en el cliente, en el acta y en la caja. Cada nivel cuenta lo suyo.
    expect(screen.getAllByText(/12 hoy/)).toHaveLength(3);
  });

  it('sin nada digitado hoy, la línea no lo menciona', () => {
    pintar([caja({ id: 1, fuid_creados: 40, fuid_hoy: 0 })]);
    expect(screen.getByText('40 registros · 1 caja')).toBeInTheDocument();
    expect(screen.queryByText(/hoy/)).not.toBeInTheDocument();
  });

  it('una caja sin registros no rompe la suma', () => {
    pintar([caja({ id: 1, fuid_creados: 0 }), caja({ id: 2, fuid_creados: 7 })]);
    expect(screen.getByText('7 registros · 2 cajas')).toBeInTheDocument();
  });

  it('las cifras grandes se leen con separador de miles', () => {
    pintar([caja({ id: 1, fuid_creados: 1098 })]);
    expect(screen.getByText('1.098 registros · 1 caja')).toBeInTheDocument();
  });
});
