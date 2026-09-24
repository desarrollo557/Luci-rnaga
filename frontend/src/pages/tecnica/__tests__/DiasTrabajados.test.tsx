import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiasTrabajados } from '../DiasTrabajados';

/**
 * El selector de días del panel: cuánto se produjo cada día y cuál se está
 * mirando. Es el eje que cruza con el árbol de cajas.
 */

const DIAS = [
  { dia: '2026-09-24', registros: 120 },
  { dia: '2026-09-23', registros: 98 },
  { dia: '2026-09-22', registros: 1 },
];

describe('los días trabajados', () => {
  it('enseña cada día con lo que se produjo, y singulariza el uno', () => {
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={() => {}} />);
    expect(screen.getByText('120 registros')).toBeInTheDocument();
    expect(screen.getByText('1 registro')).toBeInTheDocument();
  });

  it('elegir un día lo comunica', async () => {
    const alElegir = vi.fn();
    render(<DiasTrabajados dias={DIAS} elegido="" onElegir={alElegir} />);
    await userEvent.click(screen.getByText('98 registros'));
    expect(alElegir).toHaveBeenCalledWith('2026-09-23');
  });

  it('volver a pulsar el día elegido suelta el filtro', async () => {
    const alElegir = vi.fn();
    render(<DiasTrabajados dias={DIAS} elegido="2026-09-23" onElegir={alElegir} />);
    await userEvent.click(screen.getByText('98 registros'));
    expect(alElegir).toHaveBeenCalledWith('');
  });

  it('con un día elegido dice cuál se está mirando', () => {
    render(<DiasTrabajados dias={DIAS} elegido="2026-09-23" onElegir={() => {}} />);
    expect(screen.getByText(/Mostrando lo digitado el/)).toBeInTheDocument();
  });

  it('«Todo» devuelve al acumulado', async () => {
    const alElegir = vi.fn();
    render(<DiasTrabajados dias={DIAS} elegido="2026-09-23" onElegir={alElegir} />);
    await userEvent.click(screen.getByText('Todo'));
    expect(alElegir).toHaveBeenCalledWith('');
  });

  it('con muchos días enseña los más recientes y dice cuántos hay', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({
      dia: `2026-09-${String(i + 1).padStart(2, '0')}`,
      registros: i + 1,
    }));
    render(<DiasTrabajados dias={muchos} elegido="" onElegir={() => {}} tope={5} />);
    expect(screen.getByText(/Se muestran los 5 días más recientes de los 30/)).toBeInTheDocument();
  });

  it('sin días trabajados lo dice, en vez de dejar un hueco', () => {
    render(<DiasTrabajados dias={[]} elegido="" onElegir={() => {}} />);
    expect(screen.getByText(/Todavía no hay días con registros/)).toBeInTheDocument();
  });
});
