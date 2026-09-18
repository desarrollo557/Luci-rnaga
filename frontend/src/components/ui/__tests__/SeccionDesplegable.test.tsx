import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeccionDesplegable } from '../SeccionDesplegable';

/**
 * La fila que se abre y muestra su contenido.
 *
 * Dos cosas la hacen útil y son las que se comprueban. La primera es que el
 * resumen se lea con la fila cerrada: si hubiera que abrir para saber si vale
 * la pena abrir, el plegado no ahorraría nada. La segunda es que el contenido
 * no se monte hasta la primera apertura, porque estas secciones consultan al
 * servidor y se refrescan solas, y montarlas cerradas sería pedir datos que
 * nadie mira.
 */

function Contenido() {
  return <p>Tabla del equipo</p>;
}

describe('SeccionDesplegable', () => {
  it('cerrada muestra el título y el resumen, no el contenido', () => {
    render(
      <SeccionDesplegable titulo="Actividad del equipo" resumen="3 personas trabajando">
        <Contenido />
      </SeccionDesplegable>,
    );
    expect(screen.getByText('Actividad del equipo')).toBeInTheDocument();
    expect(screen.getByText('3 personas trabajando')).toBeInTheDocument();
    expect(screen.queryByText('Tabla del equipo')).not.toBeInTheDocument();
  });

  it('se abre y se cierra al pulsarla', async () => {
    const usuario = userEvent.setup();
    render(
      <SeccionDesplegable titulo="Actividad del equipo">
        <Contenido />
      </SeccionDesplegable>,
    );
    const fila = screen.getByRole('button', { name: /Actividad del equipo/ });
    expect(fila).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(fila);
    expect(fila).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tabla del equipo')).toBeVisible();

    await usuario.click(fila);
    expect(fila).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Tabla del equipo')).not.toBeVisible();
  });

  it('el contenido no se monta hasta la primera apertura', async () => {
    const usuario = userEvent.setup();
    const alMontar = vi.fn();
    function Espia() {
      alMontar();
      return <p>Contenido</p>;
    }
    render(
      <SeccionDesplegable titulo="Análisis">
        <Espia />
      </SeccionDesplegable>,
    );
    // Cerrada no pide nada al servidor porque ni siquiera existe.
    expect(alMontar).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole('button', { name: /Análisis/ }));
    expect(alMontar).toHaveBeenCalled();
  });

  it('una vez abierta, cerrarla no desmonta el contenido', async () => {
    const usuario = userEvent.setup();
    const alMontar = vi.fn();
    function Espia() {
      alMontar();
      return <p>Contenido</p>;
    }
    render(
      <SeccionDesplegable titulo="Análisis">
        <Espia />
      </SeccionDesplegable>,
    );
    const fila = screen.getByRole('button', { name: /Análisis/ });
    await usuario.click(fila);
    const montajes = alMontar.mock.calls.length;
    await usuario.click(fila);
    await usuario.click(fila);
    // Se oculta, no se destruye: al volver no se pierde lo que hubiera dentro.
    expect(alMontar.mock.calls.length).toBe(montajes);
  });

  it('puede nacer abierta cuando lo que trae se mira siempre', () => {
    render(
      <SeccionDesplegable titulo="Actividad del equipo" abiertaPorDefecto>
        <Contenido />
      </SeccionDesplegable>,
    );
    expect(screen.getByText('Tabla del equipo')).toBeVisible();
    expect(screen.getByRole('button', { name: /Actividad del equipo/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
