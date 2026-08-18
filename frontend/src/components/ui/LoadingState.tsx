import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';
import { useState, useEffect } from 'react';

/** Componente de loading consistente usado en todas las pages */
export function LoadingState({
  message = 'Cargando información…',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center py-8', className)}>
      <Spinner className="size-6" />
      <span className="ml-2 text-silver-600">{message}</span>
    </div>
  );
}

/** Estados de loading para botones consistentes */
export function useButtonLoading(mutation: any, deps: any[] = []) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(mutation.isPending);
    const unsubscribe = mutation.addEventListener?.('pending', () => setIsLoading(true));
    const unsubscribe2 = mutation.addEventListener?.('success', () => setIsLoading(false));
    const unsubscribe3 = mutation.addEventListener?.('error', () => setIsLoading(false));

    return () => {
      unsubscribe?.();
      unsubscribe2?.();
      unsubscribe3?.();
    };
  }, deps);

  return isLoading;
}