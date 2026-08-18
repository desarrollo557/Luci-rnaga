import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Ruta de retorno; muestra una flecha "volver" en lugar del botón del navegador. */
  backTo?: string;
  /** Texto junto a la flecha (por defecto "Volver"). */
  backLabel?: string;
}

export function PageHeader({ title, description, actions, backTo, backLabel = 'Volver' }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {backTo && (
          <Link
            to={backTo}
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-silver-200 px-2.5 py-1.5 text-sm font-medium text-silver-600 transition-colors hover:bg-silver-50 hover:text-silver-900"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold text-silver-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-silver-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}