import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../Input';

/**
 * El campo de texto de todos los formularios.
 *
 * Se comprueba lo que sostiene la digitación: que la etiqueta quede unida a su
 * campo —así se puede pulsar el rótulo para escribir, y así lo encuentran tanto
 * un lector de pantalla como estas pruebas—, y que un error se vea junto al
 * campo que lo tiene, no como un aviso suelto.
 */

describe('la etiqueta pertenece a su campo', () => {
  it('se encuentra el campo por su rótulo', async () => {
    render(<Input label="Entidad Productora" />);
    const campo = screen.getByLabelText('Entidad Productora');
    await userEvent.type(campo, 'ALCALDIA');
    expect(campo).toHaveValue('ALCALDIA');
  });

  it('dos campos en la misma pantalla no comparten identificador', () => {
    render(
      <>
        <Input label="Serie" />
        <Input label="Subserie" />
      </>,
    );
    const serie = screen.getByLabelText('Serie');
    const subserie = screen.getByLabelText('Subserie');
    expect(serie.id).not.toBe(subserie.id);
  });
});

describe('lo que se escribe llega a quien lo guarda', () => {
  it('avisa de cada cambio', async () => {
    const alEscribir = vi.fn();
    render(<Input label="Folios" onChange={alEscribir} />);
    await userEvent.type(screen.getByLabelText('Folios'), '250');
    expect(alEscribir).toHaveBeenCalledTimes(3);
  });

  it('un campo deshabilitado no admite texto', async () => {
    render(<Input label="Caja" value="200C000001" disabled readOnly />);
    const campo = screen.getByLabelText('Caja');
    await userEvent.type(campo, 'OTRO');
    expect(campo).toHaveValue('200C000001');
  });
});

describe('el error se ve donde está el problema', () => {
  it('muestra el mensaje y marca el campo como inválido', () => {
    render(<Input label="Objeto" error="El objeto es requerido" />);
    expect(screen.getByText('El objeto es requerido')).toBeInTheDocument();
    expect(screen.getByLabelText('Objeto')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sin error, el campo no queda marcado', () => {
    render(<Input label="Objeto" />);
    expect(screen.getByLabelText('Objeto')).not.toHaveAttribute('aria-invalid');
  });

  it('la ayuda desaparece cuando hay un error, para no competir con él', () => {
    const { rerender } = render(<Input label="UPD" hint="Formato UPDXXXXXXX" />);
    expect(screen.getByText('Formato UPDXXXXXXX')).toBeInTheDocument();
    rerender(<Input label="UPD" hint="Formato UPDXXXXXXX" error="UPD inválido" />);
    expect(screen.queryByText('Formato UPDXXXXXXX')).not.toBeInTheDocument();
    expect(screen.getByText('UPD inválido')).toBeInTheDocument();
  });
});
