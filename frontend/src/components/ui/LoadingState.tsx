import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export interface LoadingStateProps {
  /** Mensaje acompañante del spinner, ej: "Estamos consultando la información...". */
  message?: string;
  className?: string;
  children?: ReactNode;
}

/** Spinner con mensaje comunicativo para estados de carga de consultas. */
export function LoadingState({ message = 'Estamos consultando la información…', className, children }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-10 text-silver-500', className)}>
      <Spinner className="size-6 text-primary-600" />
      <p className="text-sm">{message}</p>
      {children}
    </div>
  );
}
