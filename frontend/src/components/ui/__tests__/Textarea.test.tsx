import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Textarea } from '../Textarea';

/**
 * Campo de párrafo del formulario FUID (Asunto Manual y Notas).
 *
 * Se comprueba lo mismo que en `Input` —etiqueta unida a su campo, cambios que
 * llegan, error junto al problema— y además lo propio de este control: que el
 * campo crezca hacia abajo conforme se escribe en vez de esconder el texto, y
 * que vuelva a encogerse al borrar. Eso es lo que da el espacio de escritura, y
 * es la razón de que exista el componente.
 *
 * jsdom no maqueta: `scrollHeight`, `clientHeight` y `offsetHeight` valdrían
 * siempre 0 y el alto nunca cambiaría. Se sustituyen por medidas derivadas del
 * propio texto, una línea por cada 40 caracteres, que es lo que haría un
 * navegador al ajustar el texto dentro del ancho del campo. Las tres se simulan
 * juntas a propósito: el componente suma el borde (`offsetHeight - clientHeight`)
 * porque `scrollHeight` no lo incluye, y con `box-sizing: border-box` el alto que
 * se asigna sí, así que sin esa suma el campo quedaría corto y recortaría la
 * última línea.
 */

const ALTO_LINEA = 28;
const RELLENO = 20;
const BORDE = 2;
const CARACTERES_POR_LINEA = 40;

/** Alto que debe tener el campo con `lineas` líneas de texto. */
function altoEsperado(lineas: number): string {
  return `${lineas * ALTO_LINEA + RELLENO + BORDE}px`;
}

function lineasDe(elemento: HTMLTextAreaElement): number {
  return Math.max(1, Math.ceil(elemento.value.length / CARACTERES_POR_LINEA));
}

const MEDIDAS_SIMULADAS = {
  // Contenido más relleno, sin borde: es lo que devuelve un navegador.
  scrollHeight(this: HTMLTextAreaElement) {
    return lineasDe(this) * ALTO_LINEA + RELLENO;
  },
  // Caja de relleno, sin borde. Con el alto en 'auto' coincide con scrollHeight.
  clientHeight(this: HTMLTextAreaElement) {
    return lineasDe(this) * ALTO_LINEA + RELLENO;
  },
  // Caja de borde: lo anterior más el borde de 1px de cada lado.
  offsetHeight(this: HTMLTextAreaElement) {
    return lineasDe(this) * ALTO_LINEA + RELLENO + BORDE;
  },
};

beforeAll(() => {
  for (const [propiedad, medida] of Object.entries(MEDIDAS_SIMULADAS)) {
    Object.defineProperty(HTMLTextAreaElement.prototype, propiedad, {
      configurable: true,
      get: medida,
    });
  }
});

afterAll(() => {
  for (const propiedad of Object.keys(MEDIDAS_SIMULADAS)) {
    delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>)[propiedad];
  }
});

/** Envoltura controlada: el alto se recalcula con cada valor nuevo. */
function CampoControlado({ inicial = '' }: { inicial?: string }) {
  const [valor, setValor] = useState(inicial);
  return <Textarea label="Notas" value={valor} onChange={(evento) => setValor(evento.target.value)} />;
}

describe('la etiqueta pertenece a su campo', () => {
  it('se encuentra el campo por su rótulo', async () => {
    render(<CampoControlado />);
    const campo = screen.getByLabelText('Notas');
    await userEvent.type(campo, 'CARPETA EN MAL ESTADO');
    expect(campo).toHaveValue('CARPETA EN MAL ESTADO');
  });

  it('dos campos en la misma pantalla no comparten identificador', () => {
    render(
      <>
        <Textarea label="Asunto Manual" />
        <Textarea label="Notas" />
      </>,
    );
    expect(screen.getByLabelText('Asunto Manual').id).not.toBe(screen.getByLabelText('Notas').id);
  });
});

describe('lo que se escribe llega a quien lo guarda', () => {
  it('avisa de cada cambio', async () => {
    const alEscribir = vi.fn();
    render(<Textarea label="Notas" value="" onChange={alEscribir} />);
    await userEvent.type(screen.getByLabelText('Notas'), 'ABC');
    expect(alEscribir).toHaveBeenCalledTimes(3);
  });

  it('respeta el tope de caracteres de la columna', async () => {
    render(<CampoControlado />);
    const campo = screen.getByLabelText('Notas');
    campo.setAttribute('maxlength', '10');
    await userEvent.type(campo, 'ESTE TEXTO SE PASA DEL TOPE');
    expect(campo).toHaveValue('ESTE TEXTO');
  });
});

describe('el campo crece con el texto en vez de esconderlo', () => {
  it('arranca con el alto de una sola línea', () => {
    render(<CampoControlado />);
    expect(screen.getByLabelText('Notas').style.height).toBe(altoEsperado(1));
  });

  it('se hace más alto cuando el texto pasa del borde derecho', async () => {
    render(<CampoControlado />);
    const campo = screen.getByLabelText('Notas');
    expect(campo.style.height).toBe(altoEsperado(1));
    await userEvent.type(campo, 'A'.repeat(CARACTERES_POR_LINEA * 3));
    expect(campo.style.height).toBe(altoEsperado(3));
  });

  it('vuelve a encogerse al borrar lo escrito', async () => {
    render(<CampoControlado inicial={'A'.repeat(CARACTERES_POR_LINEA * 3)} />);
    const campo = screen.getByLabelText('Notas');
    expect(campo.style.height).toBe(altoEsperado(3));
    await userEvent.clear(campo);
    expect(campo.style.height).toBe(altoEsperado(1));
  });

  it('un valor que llega ya escrito abre el campo a su tamaño', () => {
    render(<CampoControlado inicial={'B'.repeat(CARACTERES_POR_LINEA * 2)} />);
    expect(screen.getByLabelText('Notas').style.height).toBe(altoEsperado(2));
  });

  it('el alto incluye el borde, que scrollHeight no mide', () => {
    render(<CampoControlado />);
    const campo = screen.getByLabelText('Notas') as HTMLTextAreaElement;
    expect(parseInt(campo.style.height, 10)).toBe(campo.scrollHeight + BORDE);
  });

  it('no deja barra de desplazamiento propia: el alto lo pone el contenido', () => {
    render(<CampoControlado />);
    expect(screen.getByLabelText('Notas').className).toContain('overflow-hidden');
  });
});

describe('el error se ve donde está el problema', () => {
  it('muestra el mensaje y marca el campo como inválido', () => {
    render(<Textarea label="Asunto Manual" error="El asunto manual es requerido" />);
    expect(screen.getByText('El asunto manual es requerido')).toBeInTheDocument();
    expect(screen.getByLabelText('Asunto Manual')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sin error, el campo no queda marcado', () => {
    render(<Textarea label="Asunto Manual" />);
    expect(screen.getByLabelText('Asunto Manual')).not.toHaveAttribute('aria-invalid');
  });

  it('la ayuda desaparece cuando hay un error, para no competir con él', () => {
    const { rerender } = render(<Textarea label="Notas" hint="Opcional" />);
    expect(screen.getByText('Opcional')).toBeInTheDocument();
    rerender(<Textarea label="Notas" hint="Opcional" error="Texto demasiado largo" />);
    expect(screen.queryByText('Opcional')).not.toBeInTheDocument();
    expect(screen.getByText('Texto demasiado largo')).toBeInTheDocument();
  });
});
