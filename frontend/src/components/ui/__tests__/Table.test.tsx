import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Table, type Column } from '../Table';

/**
 * La fila desplegable de la tabla, que es lo que sostiene el árbol de actas del
 * módulo de Inventario: cada cliente es una fila y sus actas cuelgan debajo.
 *
 * Se comprueba lo que haría fallar el árbol sin que nadie lo note: que el
 * contenido desplegado ocupe el ancho entero de la tabla (si no, se metería en
 * la primera columna), que solo aparezca en la fila abierta, y que una tabla sin
 * desplegable siga comportándose como antes.
 */

interface Cliente {
  id: number;
  codigo: string;
  nombre: string;
}

const COLUMNAS: Column<Cliente>[] = [
  { key: 'codigo', header: 'Código' },
  { key: 'nombre', header: 'Cliente' },
  { key: 'acciones', header: '', render: () => <button type="button">Descargar</button> },
];

const CLIENTES: Cliente[] = [
  { id: 1, codigo: '901', nombre: 'ALCALDIA DE SOLEDAD' },
  { id: 2, codigo: '902', nombre: 'HOSPITAL UNIVERSITARIO' },
];

function tabla(abiertos: number[]) {
  return (
    <Table
      columns={COLUMNAS}
      data={CLIENTES}
      rowKey={(fila) => fila.id}
      isExpanded={(fila) => abiertos.includes(fila.id)}
      renderExpansion={(fila) => <div data-testid={`actas-${fila.id}`}>Actas de {fila.nombre}</div>}
    />
  );
}

describe('la tabla sin filas desplegables no cambia', () => {
  it('muestra una fila por registro y ningún añadido', () => {
    render(<Table columns={COLUMNAS} data={CLIENTES} rowKey={(f) => f.id} />);
    expect(screen.getAllByRole('row')).toHaveLength(CLIENTES.length + 1); // + la cabecera
    expect(screen.getByText('ALCALDIA DE SOLEDAD')).toBeInTheDocument();
  });

  it('sin `renderExpansion` no despliega nada aunque se diga que está abierta', () => {
    render(<Table columns={COLUMNAS} data={CLIENTES} rowKey={(f) => f.id} isExpanded={() => true} />);
    expect(screen.getAllByRole('row')).toHaveLength(CLIENTES.length + 1);
  });
});

describe('la fila desplegable', () => {
  it('cerrada, no muestra su contenido', () => {
    render(tabla([]));
    expect(screen.queryByTestId('actas-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('actas-2')).not.toBeInTheDocument();
  });

  it('abierta, muestra su contenido y solo el de esa fila', () => {
    render(tabla([1]));
    expect(screen.getByTestId('actas-1')).toHaveTextContent('Actas de ALCALDIA DE SOLEDAD');
    expect(screen.queryByTestId('actas-2')).not.toBeInTheDocument();
  });

  it('añade una fila a la tabla, no reemplaza la del registro', () => {
    render(tabla([1]));
    expect(screen.getByText('ALCALDIA DE SOLEDAD')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(CLIENTES.length + 1 + 1);
  });

  it('el contenido ocupa el ancho entero de la tabla', () => {
    render(tabla([1]));
    const celda = screen.getByTestId('actas-1').closest('td');
    expect(celda).toHaveAttribute('colspan', String(COLUMNAS.length));
  });

  it('varias filas abiertas a la vez son independientes', () => {
    render(tabla([1, 2]));
    expect(screen.getByTestId('actas-1')).toBeInTheDocument();
    expect(screen.getByTestId('actas-2')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(CLIENTES.length + 1 + 2);
  });

  it('el desplegable queda justo debajo de su fila', () => {
    render(tabla([1]));
    const filas = screen.getAllByRole('row');
    // 0 es la cabecera, 1 el primer cliente, 2 su desplegable.
    expect(within(filas[1]).getByText('ALCALDIA DE SOLEDAD')).toBeInTheDocument();
    expect(within(filas[2]).getByTestId('actas-1')).toBeInTheDocument();
  });

  it('una tabla vacía sigue avisando de que no hay registros', () => {
    render(
      <Table
        columns={COLUMNAS}
        data={[]}
        rowKey={(f: Cliente) => f.id}
        isExpanded={() => true}
        renderExpansion={() => <div>nada</div>}
      />,
    );
    expect(screen.getByText('No hay registros')).toBeInTheDocument();
  });
});
