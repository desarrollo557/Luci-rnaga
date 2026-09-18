import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  /**
   * Impide que las celdas partan el texto en varias líneas. La tabla toma su
   * ancho natural en vez de comprimirse al del contenedor, así que **desborda y
   * aparece la barra horizontal**. Sin esto, una tabla de muchas columnas se
   * aprieta hasta caber y las columnas sobrantes quedan inalcanzables.
   */
  nowrap?: boolean;
  /** Mantiene visible la primera columna al desplazarse en horizontal. */
  stickyFirstColumn?: boolean;
  /** Altura máxima del área desplazable, p. ej. '60vh'. */
  maxHeight?: string;
  /**
   * Contenido que se despliega bajo una fila, ocupando el ancho de la tabla.
   *
   * Sirve para lo que cuelga de una fila y no cabe como columna: en Inventario,
   * las actas de transferencia de cada cliente. Devolver `null` para una fila la
   * deja sin desplegable. Quién está abierto lo decide quien usa la tabla, que
   * es donde vive ese estado.
   */
  renderExpansion?: (row: T) => ReactNode;
  /** Si la fila está desplegada. Solo se consulta cuando hay `renderExpansion`. */
  isExpanded?: (row: T) => boolean;
  /**
   * Clases extra para una fila concreta, según sus datos.
   *
   * Existe para poder señalar una fila sin que la tabla sepa por qué: en
   * digitación, la que se acaba de guardar. Devolver `undefined` la deja como
   * las demás.
   */
  rowClassName?: (row: T) => string | undefined;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyMessage = 'No hay registros',
  className,
  nowrap = false,
  stickyFirstColumn = false,
  maxHeight,
  renderExpansion,
  isExpanded,
  rowClassName,
}: TableProps<T>) {
  const celdaFija = 'sticky left-0 z-20 border-r border-silver-200 bg-surface group-hover:bg-silver-50';
  const cabeceraFija = 'sticky left-0 z-30 border-r border-silver-200 bg-silver-50';

  return (
    <div
      className={cn('overflow-auto rounded-xl border border-silver-200 bg-surface shadow-sm', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={cn('text-left text-sm', nowrap ? 'min-w-full' : 'w-full')}>
        <thead className="sticky top-0 z-10 bg-silver-50">
          <tr className="border-b border-silver-200">
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={cn(
                  'whitespace-nowrap px-4 py-3 font-semibold text-silver-600',
                  stickyFirstColumn && i === 0 && cabeceraFija,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading &&
            data.map((row) => {
              const desplegada = Boolean(renderExpansion && isExpanded?.(row));
              return (
                <Fragment key={rowKey(row)}>
                  <tr
                    className={cn(
                      'group border-b border-silver-100 hover:bg-silver-50',
                      // Sin borde inferior cuando lleva algo debajo: la fila y su
                      // desplegable se leen como un solo bloque.
                      desplegada ? 'border-b-0' : 'last:border-0',
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((col, i) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 text-silver-700',
                          nowrap && 'whitespace-nowrap',
                          stickyFirstColumn && i === 0 && celdaFija,
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : String((row as unknown as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                  {desplegada && (
                    <tr className="border-b border-silver-100 last:border-0">
                      <td colSpan={columns.length} className="bg-surface-2 px-4 py-3">
                        {renderExpansion?.(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
        </tbody>
      </table>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-silver-500">
          <Spinner className="size-5" />
          <span>Cargando…</span>
        </div>
      )}
      {!loading && data.length === 0 && (
        <div className="py-10 text-center text-sm text-silver-500">{emptyMessage}</div>
      )}
    </div>
  );
}
