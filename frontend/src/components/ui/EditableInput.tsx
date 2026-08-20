import { useState, type ForwardedRef, forwardRef } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input, type InputProps } from './Input';

interface EditableInputProps extends Omit<InputProps, 'readOnly' | 'disabled' | 'onChange'> {
  /** Valor del input */
  value: string;
  /** Callback cuando cambia el valor (solo si está desbloqueado) */
  onChange: (value: string) => void;
  /** Etiqueta */
  label?: string;
  /** Mensaje de error */
  error?: string;
  /** Texto de ayuda (debajo del input) */
  hint?: string;
  /** Placeholder */
  placeholder?: string;
  /** Si true, inicia desbloqueado (editable) */
  defaultUnlocked?: boolean;
  /** id para accesibilidad */
  id?: string;
  /** Clases extra */
  className?: string;
}

export const EditableInput = forwardRef<HTMLInputElement, EditableInputProps>(
  (
    {
      value,
      onChange,
      label,
      error,
      hint,
      placeholder,
      defaultUnlocked = false,
      id,
      className,
      ...props
    },
    ref: ForwardedRef<HTMLInputElement>
  ) => {
    const [unlocked, setUnlocked] = useState(defaultUnlocked);
    const inputId = id || `editable-${Math.random().toString(36).slice(2)}`;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-silver-700 mb-1 flex items-center gap-1">
            {label}
            <button
              type="button"
              onClick={() => setUnlocked((u) => !u)}
              className="ml-1 p-0.5 rounded hover:bg-silver-100 transition-colors text-silver-500 hover:text-silver-700"
              aria-label={unlocked ? 'Bloquear edición' : 'Desbloquear para editar'}
              aria-pressed={unlocked}
              title={unlocked ? 'Bloquear (solo lectura)' : 'Desbloquear para editar'}
            >
              {unlocked ? <Unlock className="size-4 text-green-600" /> : <Lock className="size-4" />}
            </button>
          </label>
        )}
        <Input
          ref={ref}
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={!unlocked}
          disabled={!unlocked}
          placeholder={placeholder}
          error={error}
          hint={hint}
          className={cn(
            'transition-colors',
            unlocked ? '' : 'bg-silver-50 cursor-not-allowed',
            className
          )}
          aria-describedby={`${hint ? hintId : ''} ${error ? errorId : ''}`.trim() || undefined}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-silver-500">
            {unlocked ? '🔓 Editando — ' : '🔒 Solo lectura — '}{hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

EditableInput.displayName = 'EditableInput';