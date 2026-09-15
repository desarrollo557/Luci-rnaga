import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

/**
 * El botón con el que se envía cada formulario del software.
 *
 * Lo que importa no es cómo se ve, sino que un clic haga una sola cosa una sola
 * vez: dos envíos seguidos de "Guardar" crean dos cajas, y dos de "Eliminar"
 * borran lo que ya no está. Por eso se prueba sobre todo cuándo el botón deja
 * de responder.
 */

describe('el botón responde al clic', () => {
  it('avisa una vez por cada clic', async () => {
    const alPulsar = vi.fn();
    render(<Button onClick={alPulsar}>Guardar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(alPulsar).toHaveBeenCalledTimes(1);
  });

  it('se puede pulsar con el teclado', async () => {
    const alPulsar = vi.fn();
    render(<Button onClick={alPulsar}>Guardar</Button>);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(alPulsar).toHaveBeenCalledTimes(1);
  });
});

describe('cuándo deja de responder', () => {
  it('deshabilitado no llama a nada', async () => {
    const alPulsar = vi.fn();
    render(
      <Button onClick={alPulsar} disabled>
        Guardar
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(alPulsar).not.toHaveBeenCalled();
  });

  it('mientras guarda queda bloqueado, para no enviar dos veces', async () => {
    // Es el caso real: se pulsa "Guardar", la petición tarda, y quien digita
    // vuelve a pulsar. Si el botón siguiera activo se crearían dos registros.
    const alPulsar = vi.fn();
    render(
      <Button onClick={alPulsar} loading>
        Guardar
      </Button>,
    );
    const boton = screen.getByRole('button', { name: /Guardar/ });
    expect(boton).toBeDisabled();
    await userEvent.click(boton);
    expect(alPulsar).not.toHaveBeenCalled();
  });

  it('mientras guarda sigue diciendo qué está haciendo', () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button', { name: /Guardar/ })).toBeInTheDocument();
  });
});

describe('los tipos de botón se distinguen', () => {
  it('cada variante se renderiza como un botón utilizable', async () => {
    for (const variante of ['primary', 'secondary', 'danger', 'ghost'] as const) {
      const alPulsar = vi.fn();
      const { unmount } = render(
        <Button variant={variante} onClick={alPulsar}>
          Acción
        </Button>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Acción' }));
      expect(alPulsar, variante).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('respeta el type que se le pase, para no enviar el formulario sin querer', () => {
    render(<Button type="button">Cancelar</Button>);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('type', 'button');
  });
});
