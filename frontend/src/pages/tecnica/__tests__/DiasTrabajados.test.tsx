import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiasTrabajados } from '../DiasTrabajados';

/**
 * El calendario del panel: qué días se trabajó, cuánto, y cuál se está mirando.
 * Es el eje que cruza con el árbol de cajas.
 */

const DIAS = [
  { dia: '2026-09-24', registros: 17 },
  { dia: '2026-09-23', registros: 26 },
  { dia: '2026-09-18', registros: 275 },
];

/** El botón del día 23, que en el calendario lleva el número y su cifra. */
const dia23 = () => screen.getByRole('button', { name: /23\s*26/ });

describe('el calendario de días trabajados', () => {
  it('abre en el mes del último día con trabajo', () => {
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={() => {}} />);
    expect(screen.getByText(/septiembre de 2026/i)).toBeInTheDocument();
  });

  it('cada día trabajado lleva su cifra', () => {
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={() => {}} />);
    // Se busca por el botón entero —número del día y cifra— porque una cifra
    // suelta puede coincidir con el número de otro día del mes.
    expect(screen.getByRole('button', { name: /18\s*275/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /24\s*17/ })).toBeInTheDocument();
  });

  it('elegir un día lo comunica', async () => {
    const alElegir = vi.fn();
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={alElegir} />);
    await userEvent.click(dia23());
    expect(alElegir).toHaveBeenCalledWith('2026-09-23');
  });

  it('volver a pulsar el día elegido suelta el filtro', async () => {
    const alElegir = vi.fn();
    render(<DiasTrabajados dias={DIAS} elegido="2026-09-23" onElegir={alElegir} />);
    await userEvent.click(dia23());
    expect(alElegir).toHaveBeenCalledWith('');
  });

  it('un día sin trabajo no se puede elegir: el árbol saldría vacío', () => {
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={() => {}} />);
    // El 25 de septiembre no está en la lista de días trabajados.
    expect(screen.getByRole('button', { name: '25' })).toBeDisabled();
  });

  it('con un día elegido dice cuál se está mirando y deja volver al acumulado', async () => {
    const alElegir = vi.fn();
    render(<DiasTrabajados dias={DIAS} elegido="2026-09-23" onElegir={alElegir} />);
    expect(screen.getByText(/Mostrando lo digitado el/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Ver todo el acumulado'));
    expect(alElegir).toHaveBeenCalledWith('');
  });

  it('se puede pasar al mes anterior', async () => {
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={() => {}} />);
    await userEvent.click(screen.getByLabelText('Mes anterior'));
    expect(screen.getByText(/agosto de 2026/i)).toBeInTheDocument();
  });

  it('sin días trabajados lo dice, en vez de dejar un calendario vacío', () => {
    render(<DiasTrabajados dias={[]} elegido="" onElegir={() => {}} />);
    expect(screen.getByText(/Todavía no hay días con registros/)).toBeInTheDocument();
  });
});
