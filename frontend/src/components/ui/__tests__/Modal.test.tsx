import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal';
import { Input } from '../Input';

/**
 * Dónde queda el foco al abrir un diálogo.
 *
 * Esto nace de algo que se veía en pantalla: al pulsar "Nuevo Registro FUID",
 * el campo Código aparecía rodeado por el aro de foco, como si fuera el que hay
 * que llenar primero. No lo es. Quien digita recorre los campos en el orden del
 * documento que tiene delante, así que ningún campo debe salir señalado.
 *
 * Lo que no puede pasar al arreglarlo es que el foco se quede en la página de
 * detrás: entonces tabular movería por lo que el fondo oscuro tapa y quien use
 * teclado no llegaría al formulario. Por eso el foco entra en el diálogo mismo.
 */

function abrir(children = <Input label="Codigo" />) {
  const onClose = vi.fn();
  const utilidades = render(
    <>
      <button type="button">Detrás del diálogo</button>
      <Modal open onClose={onClose} title="Nuevo Registro FUID">
        {children}
      </Modal>
    </>,
  );
  return { onClose, ...utilidades };
}

describe('Modal', () => {
  it('no deja ningún campo con el foco al abrirse', () => {
    abrir();
    expect(screen.getByLabelText('Codigo')).not.toHaveFocus();
    expect(document.activeElement).not.toBe(screen.getByLabelText('Codigo'));
  });

  it('mete el foco en el diálogo, no en la página de detrás', () => {
    abrir();
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Detrás del diálogo' })).not.toHaveFocus();
  });

  it('desde el diálogo se llega al primer campo con una tabulación', async () => {
    const usuario = userEvent.setup();
    abrir();
    await usuario.tab();
    // El primero que recibe el foco es el botón de cerrar del propio diálogo,
    // no algo de la página tapada.
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByLabelText('Codigo')).toHaveFocus();
  });

  it('un campo que pida el foco explícitamente lo conserva', () => {
    // El diálogo recoge el foco, pero no se lo quita a quien lo pide a propósito.
    abrir(<Input label="Buscar" autoFocus />);
    expect(screen.getByLabelText('Buscar')).toHaveFocus();
  });

  it('cerrado no pinta nada', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Nuevo Registro FUID">
        <Input label="Codigo" />
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
