import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../Select';
import { UpdInput, numeroAUpd, updANumero } from '../UpdInput';
import { OPCIONES_OBJETO_CAJA } from '@/lib/catalogos';

/**
 * Los dos controles que impiden que llegue basura a la base: el desplegable de
 * catálogo, que solo deja elegir valores de lista, y el campo de UPD, que
 * escribe el prefijo por quien digita.
 */

describe('el desplegable de catálogo', () => {
  it('ofrece exactamente las opciones del catálogo', async () => {
    render(
      <Select
        label="Objeto de la Caja"
        placeholder="Sin especificar"
        options={OPCIONES_OBJETO_CAJA.map((o) => ({ value: o, label: o }))}
        value=""
        onChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('TRANSFERENCIA PRIMARIA')).toBeInTheDocument();
    expect(screen.getByText('VALORACION DOCUMENTAL')).toBeInTheDocument();
  });

  it('elegir una opción devuelve su valor', async () => {
    const alElegir = vi.fn();
    render(
      <Select
        label="Objeto de la Caja"
        options={OPCIONES_OBJETO_CAJA.map((o) => ({ value: o, label: o }))}
        value=""
        onChange={alElegir}
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('VALORACION DOCUMENTAL'));
    expect(alElegir).toHaveBeenCalledWith('VALORACION DOCUMENTAL');
  });

  it('sin elegir nada muestra el texto de ayuda, no un valor inventado', () => {
    render(
      <Select
        label="Objeto de la Caja"
        placeholder="Sin especificar"
        options={OPCIONES_OBJETO_CAJA.map((o) => ({ value: o, label: o }))}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Sin especificar')).toBeInTheDocument();
  });

  it('muestra el valor guardado cuando lo hay', () => {
    render(
      <Select
        label="Objeto de la Caja"
        options={OPCIONES_OBJETO_CAJA.map((o) => ({ value: o, label: o }))}
        value="TRANSFERENCIA PRIMARIA"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('TRANSFERENCIA PRIMARIA');
  });

  it('deshabilitado no se abre', async () => {
    const alElegir = vi.fn();
    render(
      <Select
        label="Estado"
        options={[{ value: 'EN PROCESO', label: 'EN PROCESO' }]}
        value=""
        onChange={alElegir}
        disabled
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('EN PROCESO')).not.toBeInTheDocument();
  });
});

describe('conversión del UPD', () => {
  it('quita el prefijo para editarlo', () => {
    expect(updANumero('UPD0003133')).toBe('0003133');
  });

  it('acepta que venga en minúscula o con espacios', () => {
    expect(updANumero('  upd0003133 ')).toBe('0003133');
  });

  it('si llega solo el número, se queda con los dígitos', () => {
    expect(updANumero('3133')).toBe('3133');
    expect(updANumero('31-33')).toBe('3133');
  });

  it('pone el prefijo y rellena a siete dígitos al guardar', () => {
    expect(numeroAUpd('3133')).toBe('UPD0003133');
    expect(numeroAUpd('1')).toBe('UPD0000001');
  });

  it('descarta lo que no sean dígitos', () => {
    expect(numeroAUpd('31a33')).toBe('UPD0003133');
  });

  it('sin dígitos no inventa un UPD', () => {
    expect(numeroAUpd('')).toBe('');
    expect(numeroAUpd('ABC')).toBe('');
  });

  it('ida y vuelta conserva el UPD', () => {
    expect(numeroAUpd(updANumero('UPD2950001'))).toBe('UPD2950001');
  });
});

describe('el campo de UPD en pantalla', () => {
  it('el prefijo se muestra fuera del campo, para no teclearlo', () => {
    render(<UpdInput label="UPD" value="0003133" onChange={() => {}} />);
    // Lo que se edita son los dígitos; el "UPD" es parte fija del control.
    expect(screen.getByRole('textbox')).toHaveValue('0003133');
  });

  it('solo admite dígitos', async () => {
    const alEscribir = vi.fn();
    render(<UpdInput label="UPD" value="" onChange={alEscribir} defaultUnlocked />);
    await userEvent.type(screen.getByRole('textbox'), '3a1b');
    for (const [valor] of alEscribir.mock.calls) {
      expect(valor).toMatch(/^\d*$/);
    }
  });

  it('nace bloqueado, para no pisar el consecutivo sin querer', async () => {
    const alEscribir = vi.fn();
    render(<UpdInput label="UPD" value="0003133" onChange={alEscribir} />);
    const campo = screen.getByRole('textbox');
    expect(campo).toHaveAttribute('readonly');
    await userEvent.type(campo, '9');
    expect(alEscribir).not.toHaveBeenCalled();
  });

  it('el candado lo desbloquea', async () => {
    const alEscribir = vi.fn();
    render(<UpdInput label="UPD" value="" onChange={alEscribir} />);
    await userEvent.click(screen.getByRole('button', { name: /Desbloquear/ }));
    await userEvent.type(screen.getByRole('textbox'), '7');
    expect(alEscribir).toHaveBeenCalledWith('7');
  });

  it('muestra el error cuando el UPD no sirve', () => {
    render(<UpdInput label="UPD" value="99" onChange={() => {}} error="UPD duplicado" />);
    expect(screen.getByText('UPD duplicado')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});
