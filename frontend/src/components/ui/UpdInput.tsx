import { useState, forwardRef, type ForwardedRef } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/cn';

export const UPD_PREFIJO = 'UPD';
export const UPD_DIGITOS = 7;

/** 'UPD0003133' → '0003133'. Devuelve '' si no trae el formato esperado. */
export function updANumero(upd: string): string {
  const limpio = (upd ?? '').trim().toUpperCase();
  if (limpio.startsWith(UPD_PREFIJO)) return limpio.slice(UPD_PREFIJO.length);
  return limpio.replace(/\D/g, '');
}

/** '3133' → 'UPD0003133'. Devuelve '' si no hay dígitos. */
export function numeroAUpd(numero: string): string {
  const digitos = (numero ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  return UPD_PREFIJO + digitos.padStart(UPD_DIGITOS, '0');
}

export interface UpdInputProps {
  /** Número sin prefijo ni relleno; el componente solo maneja dígitos. */
  value: string;
  onChange: (numero: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  defaultUnlocked?: boolean;
  onBlur?: () => void;
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

/**
 * Campo de UPD que muestra el prefijo `UPD` como parte fija del control y deja
 * escribir únicamente el número. Evita que la persona teclee las siglas y que
 * un error de formato llegue al servidor.
 */
export const UpdInput = forwardRef<HTMLInputElement, UpdInputProps>(function UpdInput(
  { value, onChange, label, error, hint, disabled, defaultUnlocked = false, onBlur, autoFocus, id, className },
  ref: ForwardedRef<HTMLInputElement>,
) {
  const [unlocked, setUnlocked] = useState(defaultUnlocked);
  const inputId = id || 'upd-numero';
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const vistaPrevia = numeroAUpd(value);
  const readOnlyLocked = !unlocked || disabled;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1 flex items-center gap-1 text-sm font-medium text-silver-700">
          {label}
          <button
            type="button"
            onClick={() => setUnlocked((prev) => !prev)}
            className="ml-1 rounded p-0.5 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700"
            aria-label={unlocked ? 'Bloquear edición del UPD' : 'Desbloquear edición del UPD'}
            aria-pressed={unlocked}
            title={unlocked ? 'Bloquear (solo lectura)' : 'Desbloquear para editar'}
          >
            {unlocked ? <Unlock className="size-4 text-green-600" /> : <Lock className="size-4" />}
          </button>
        </label>
      )}

      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-lg border bg-surface transition-colors',
          error
            ? 'border-red-400 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500'
            : 'border-silver-300 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500',
          readOnlyLocked && 'bg-surface-muted',
        )}
      >
        <span
          aria-hidden="true"
          className="flex select-none items-center border-r border-silver-200 bg-silver-100 px-3 text-sm font-semibold tracking-wide text-silver-600"
        >
          {UPD_PREFIJO}
        </span>
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={readOnlyLocked}
          readOnly={readOnlyLocked}
          onBlur={onBlur}
          value={value}
          maxLength={UPD_DIGITOS}
          placeholder="0000000"
          // Solo dígitos: el prefijo lo pone el propio control.
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, UPD_DIGITOS))}
          className={cn(
            'min-w-0 flex-1 px-3 py-2 text-sm text-silver-900 outline-none',
            readOnlyLocked && 'cursor-not-allowed bg-surface-muted',
          )}
          style={{ fontVariantNumeric: 'tabular-nums' }}
          aria-describedby={`${hint ? hintId : ''} ${error ? errorId : ''}`.trim() || undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>

      {vistaPrevia && !error && (
        <p className="mt-1 text-xs text-silver-500">
          Se guardará como <span className="font-semibold text-silver-700">{vistaPrevia}</span>
        </p>
      )}
      {hint && !error && !vistaPrevia && (
        <p id={hintId} className="mt-1 text-xs text-silver-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
