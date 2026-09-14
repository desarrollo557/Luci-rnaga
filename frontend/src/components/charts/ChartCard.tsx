import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ChartCardProps {
  title: string;
  /** Describe qué se está midiendo; en gráficos de una sola serie sustituye a la leyenda. */
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, icon, actions, children, className }: ChartCardProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-silver-200 bg-surface p-5 shadow-sm transition-shadow duration-300 hover:shadow-md',
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-silver-800">
            {icon}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-silver-500">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export interface LeyendaItem {
  nombre: string;
  color: string;
  /** 'linea' para series de línea, 'area' para rellenos y barras. */
  forma?: 'linea' | 'area';
}

/** La leyenda es obligatoria a partir de dos series: la identidad nunca depende solo del color. */
export function Leyenda({ items }: { items: LeyendaItem[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.nombre} className="flex items-center gap-1.5 text-xs text-silver-600">
          {item.forma === 'linea' ? (
            <span className="block h-0.5 w-4 rounded-full" style={{ backgroundColor: item.color }} />
          ) : (
            <span className="block size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          )}
          {item.nombre}
        </li>
      ))}
    </ul>
  );
}
