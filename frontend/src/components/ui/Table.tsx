import type { ReactNode } from 'react';
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
}

export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyMessage = 'No hay registros',
  className,
}: TableProps<T>) {
  return (
    <div className={cn('overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200">
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading &&
            data.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-slate-700">
                    {col.render
                      ? col.render(row)
                      : String((row as unknown as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
          <Spinner className="size-5" />
          <span>Cargando…</span>
        </div>
      )}
      {!loading && data.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500">{emptyMessage}</div>
      )}
    </div>
  );
}