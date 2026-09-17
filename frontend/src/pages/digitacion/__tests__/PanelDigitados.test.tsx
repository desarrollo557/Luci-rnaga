import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelDigitados } from '../PanelDigitados';
import type { FuidDato } from '@/types';

/**
 * El panel de lo ya digitado, que acompaña al formulario mientras se digita.
 *
 * Lo que se comprueba es lo que le da sentido: que lo último guardado quede
 * arriba y a la vista, que se distinga lo hecho en esta sesión de lo que ya
 * estaba en la caja, que el aviso de guardado esté aquí y no encima del
 * formulario, y que desde cada fila se pueda abrir el registro para revisarlo.
 *
 * Antes ese aviso era un cartel que tapaba los campos y se apagaba a los dos
 * segundos y medio, así que tras veinte registros no quedaba en pantalla
 * ninguna señal de lo hecho.
 */

const registro = (n: number, extra: Partial<FuidDato> = {}): FuidDato =>
  ({
    id: n,
    n_orden: n,
    upd: 'UPD295000' + n,
    asunto: 'EXPEDIENTE ' + n,
    folios: '10',
    created_at: '2026-09-17T09:0' + n + ':00-05:00',
    ...extra,
  }) as FuidDato;

const filas = () => within(screen.getByRole('list')).getAllByRole('listitem');

/** Monta el panel con lo mínimo; cada prueba añade lo suyo. */
function montar(props: Partial<ComponentProps<typeof PanelDigitados>> = {}) {
  const onVistaPrevia = vi.fn();
  render(
    <PanelDigitados
      registros={[registro(1)]}
      deEstaSesion={new Set()}
      onVistaPrevia={onVistaPrevia}
      {...props}
    />,
  );
  return { onVistaPrevia };
}

describe('lo que se ve mientras se digita', () => {
  it('pone lo más reciente arriba, que es lo que se acaba de hacer', () => {
    montar({ registros: [registro(1), registro(3), registro(2)] });
    expect(filas().map((f) => f.textContent)).toEqual([
      expect.stringContaining('UPD2950003'),
      expect.stringContaining('UPD2950002'),
      expect.stringContaining('UPD2950001'),
    ]);
  });

  it('cuenta los registros de la caja y los de esta sesión por separado', () => {
    montar({
      registros: [registro(1), registro(2), registro(3)],
      deEstaSesion: new Set(['UPD2950002', 'UPD2950003']),
    });
    expect(screen.getByText(/3 registros/)).toBeInTheDocument();
    expect(screen.getByText(/2 en esta sesión/)).toBeInTheDocument();
  });

  it('dice qué se guardó y cuál sigue, sin tapar el formulario', () => {
    montar({
      deEstaSesion: new Set(['UPD2950001']),
      ultimoGuardado: 'UPD2950001',
      proximoUpd: 'UPD2950002',
    });
    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent('UPD2950001 guardado');
    expect(aviso).toHaveTextContent('sigue UPD2950002');
  });

  it('muestra de cada registro lo que permite reconocerlo', () => {
    montar();
    const fila = filas()[0];
    expect(fila).toHaveTextContent('UPD2950001');
    expect(fila).toHaveTextContent('EXPEDIENTE 1');
    expect(fila).toHaveTextContent('10 folios');
    expect(fila).toHaveTextContent('N° 1');
  });

  it('un registro sin asunto ni folios no deja huecos mudos', () => {
    montar({ registros: [registro(1, { asunto: null, folios: null })] });
    expect(filas()[0]).toHaveTextContent('Sin asunto');
    expect(filas()[0]).toHaveTextContent('Sin folios');
  });

  it('con la caja vacía explica qué va a aparecer ahí', () => {
    montar({ registros: [] });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no hay registros/)).toBeInTheDocument();
  });

  it('sin nada guardado todavía, el aviso está pero callado', () => {
    montar();
    // El hueco existe desde el principio para que al aparecer el aviso no salte
    // el contenido de sitio.
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('abrir un registro para revisarlo', () => {
  it('cada fila ofrece ver su detalle, y dice de cuál', () => {
    montar({ registros: [registro(1), registro(2)] });
    // El nombre lleva el UPD: con varias filas iguales, "ver detalle" a secas no
    // distingue cuál se está abriendo.
    expect(screen.getByRole('button', { name: /UPD2950001/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /UPD2950002/ })).toBeInTheDocument();
  });

  it('al pulsar la lupa entrega ese registro, no otro', async () => {
    const usuario = userEvent.setup();
    const { onVistaPrevia } = montar({ registros: [registro(1), registro(2)] });
    await usuario.click(screen.getByRole('button', { name: /UPD2950002/ }));
    expect(onVistaPrevia).toHaveBeenCalledTimes(1);
    expect(onVistaPrevia.mock.calls[0][0]).toMatchObject({ id: 2, upd: 'UPD2950002' });
  });

  it('el registro abierto se distingue del resto en la lista', () => {
    montar({ registros: [registro(1), registro(2)], abierto: 2 });
    const abierta = filas().find((f) => f.textContent?.includes('UPD2950002'));
    const otra = filas().find((f) => f.textContent?.includes('UPD2950001'));
    expect(abierta?.className).toContain('ring-1');
    expect(otra?.className).not.toContain('ring-1');
  });
});
