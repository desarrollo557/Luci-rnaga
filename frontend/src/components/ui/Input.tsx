import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-silver-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-10 w-full rounded-lg border border-silver-300 bg-white px-3 text-sm text-silver-800 shadow-sm transition-all duration-200 ease-in-out placeholder:text-silver-400 hover:border-silver-400 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 hover:shadow disabled:cursor-not-allowed disabled:bg-silver-50 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#fff] [&:-webkit-autofill]:[-webkit-text-fill-color:#40464f]',
          error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {!error && hint && <p className="mt-1 text-xs text-silver-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
});