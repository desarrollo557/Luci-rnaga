import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

/**
 * La confirmación que aparece antes de borrar.
 *
 * Es el último paso reversible: después, la caja o el registro ya no están.
 * Para las acciones graves el diálogo pide escribir la cédula de quien está en
 * sesión, y lo que se prueba aquí es que ese freno no se pueda saltar —ni
 * dejándolo vacío, ni con la cédula de otro, ni pulsando dos veces.
 */

const base = {
  open: true,
  title: 'Eliminar caja',
  description: 'Esta acción no se puede deshacer.',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('confirmación normal', () => {
  it('muestra lo que se va a hacer', () => {
    render(<ConfirmDialog {...base} />);
    expect(screen.getByText('Eliminar caja')).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
  });

  it('confirmar avisa una vez', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancelar no ejecuta la acción', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cerrado no pinta nada', () => {
    render(<ConfirmDialog {...base} open={false} />);
    expect(screen.queryByText('Eliminar caja')).not.toBeInTheDocument();
  });
});

describe('cuando hay que escribir la cédula', () => {
  const conCedula = { ...base, requireCc: true, userCc: '123456789' };

  it('empieza bloqueado', () => {
    render(<ConfirmDialog {...conCedula} />);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('con la cédula de otro sigue bloqueado y lo dice', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...conCedula} onConfirm={onConfirm} />);
    await userEvent.type(screen.getByLabelText('Escriba su cédula para confirmar'), '987654321');
    expect(screen.getByText(/La cédula no coincide/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('con la cédula correcta se desbloquea', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...conCedula} onConfirm={onConfirm} />);
    await userEvent.type(screen.getByLabelText('Escriba su cédula para confirmar'), '123456789');
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeEnabled();
    await userEvent.click(confirmar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('los espacios sobrantes no impiden confirmar', async () => {
    render(<ConfirmDialog {...conCedula} />);
    await userEvent.type(screen.getByLabelText('Escriba su cédula para confirmar'), '  123456789  ');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('al reabrirlo el campo vuelve a estar vacío', async () => {
    // Si conservara la cédula escrita, el segundo borrado saldría ya
    // confirmado de antemano y el freno no serviría de nada.
    const { rerender } = render(<ConfirmDialog {...conCedula} />);
    await userEvent.type(screen.getByLabelText('Escriba su cédula para confirmar'), '123456789');
    rerender(<ConfirmDialog {...conCedula} open={false} />);
    rerender(<ConfirmDialog {...conCedula} open />);
    expect(screen.getByLabelText('Escriba su cédula para confirmar')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('sin cédula en sesión no se puede confirmar', () => {
    // Antes que dejar pasar el borrado, se queda bloqueado.
    render(<ConfirmDialog {...conCedula} userCc="" />);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});

describe('mientras se ejecuta', () => {
  it('confirmar queda bloqueado para no borrar dos veces', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...base} loading onConfirm={onConfirm} />);
    const confirmar = screen.getByRole('button', { name: /Confirmar/ });
    expect(confirmar).toBeDisabled();
    await userEvent.click(confirmar);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancelar también, para no dejar la operación a medias', () => {
    render(<ConfirmDialog {...base} loading />);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
});
