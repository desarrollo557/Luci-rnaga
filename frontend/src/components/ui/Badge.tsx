import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeColor = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple';

export interface BadgeProps {
  color?: BadgeColor;
  className?: string;
  children: ReactNode;
}

const colorClasses: Record<BadgeColor, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-primary-100 text-primary-800',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({ color = 'gray', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClasses[color],
        className,
      )}
    >
      {children}
    </span>
  );
}