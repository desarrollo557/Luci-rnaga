import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuDeAcciones } from '../MenuDeAcciones';

/**
 * Menú de acciones secundarias de una fila.
 *
 * Recoge lo que antes eran seis iconos seguidos sin jerarquía. Lo que se
 * comprueba es lo que haría inútil el menú sin que nadie lo note: que las
 * opciones no existan hasta abrirlo, que elegir una la ejecute y cierre el menú,
 * que una opción deshabilitada no haga nada, y que se pueda cerrar sin elegir.
 */

function menu(onEditar = vi.fn(), onBorrar = vi.fn(), editarDeshabilitado = false) {
  render(
    <MenuDeAcciones
      acciones={[
        { label: 'Editar datos', onSelect: onEditar, disabled: editarDeshabilitado },
        { label: 'Eliminar inventario', onSelect: onBorrar, peligrosa: true },
      ]}
    />,
  );
  return { onEditar, onBorrar };
}

describe('el menú está cerrado hasta que se abre', () => {
  it('sus opciones no se ven de entrada', () => {
    menu();
    expect(screen.queryByText('Editar datos')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('el botón dice que está cerrado', () => {
    menu();
    expect(screen.getByRole('button', { name: 'Más acciones' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('al pulsarlo aparecen las opciones', async () => {
    menu();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Editar datos')).toBeInTheDocument();
    expect(screen.getByText('Eliminar inventario')).toBeInTheDocument();
  });
});

describe('elegir una opción', () => {
  it('ejecuta su acción', async () => {
    const { onEditar, onBorrar } = menu();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.click(screen.getByText('Editar datos'));
    expect(onEditar).toHaveBeenCalledTimes(1);
    expect(onBorrar).not.toHaveBeenCalled();
  });

  it('cierra el menú, para no dejarlo abierto sobre la pantalla siguiente', async () => {
    menu();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.click(screen.getByText('Editar datos'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('una opción deshabilitada no ejecuta nada', async () => {
    const { onEditar } = menu(vi.fn(), vi.fn(), true);
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.click(screen.getByText('Editar datos'));
    expect(onEditar).not.toHaveBeenCalled();
  });
});

describe('cerrar sin elegir', () => {
  it('con Escape', async () => {
    menu();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('pulsando fuera', async () => {
    menu();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('volviendo a pulsar el botón', async () => {
    menu();
    const boton = screen.getByRole('button', { name: 'Más acciones' });
    await userEvent.click(boton);
    await userEvent.click(boton);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('cerrar no ejecuta ninguna acción', async () => {
    const { onEditar, onBorrar } = menu();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    await userEvent.keyboard('{Escape}');
    expect(onEditar).not.toHaveBeenCalled();
    expect(onBorrar).not.toHaveBeenCalled();
  });
});
