import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps {
  children: ReactNode;
  className?: string;
  /**
   * Relleno interior, como clase de utilidad.
   *
   * Va aparte de `className` porque desde ahí no se puede cambiar: las clases
   * se concatenan tal cual y, con dos reglas de la misma especificidad, gana la
   * que el CSS ordene después, no la que se pasó. Pedirlo por su propia
   * propiedad hace que el valor que se indica sea el que se aplica.
   */
  padding?: string;
}

export function Card({ children, className, padding = 'p-6' }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-silver-200 bg-surface shadow-sm transition-shadow duration-300 hover:shadow-md', padding, className)}>
      {children}
    </div>
  );
}