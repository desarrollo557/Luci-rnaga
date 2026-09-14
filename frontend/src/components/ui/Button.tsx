import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-brand to-brand-strong text-white shadow-sm shadow-brand/30 hover:from-brand-soft hover:to-brand hover:shadow-md hover:shadow-brand/30 focus-visible:ring-primary-500',
  secondary:
    'border border-silver-300 bg-surface text-silver-700 shadow-sm hover:border-silver-400 hover:bg-silver-50 hover:text-silver-900 focus-visible:ring-silver-400',
  danger:
    'bg-gradient-to-b from-brand to-brand-strong text-white shadow-sm shadow-brand/30 hover:from-brand-soft hover:to-brand hover:shadow-md hover:shadow-brand/30 focus-visible:ring-red-500',
  ghost:
    'text-silver-600 hover:bg-silver-100 hover:text-silver-900 focus-visible:ring-silver-400',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});