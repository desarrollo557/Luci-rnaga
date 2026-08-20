import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DatePicker, type DatePickerProps } from './DatePicker';

interface EditableDatePickerProps extends Omit<DatePickerProps, 'readOnly' | 'disabled' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  defaultUnlocked?: boolean;
  id?: string;
  className?: string;
  min?: string;
  max?: string;
  required?: boolean;
}

export const EditableDatePicker = (
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
    min,
    max,
    required,
    ...props
  }: EditableDatePickerProps
) => {
  const [unlocked, setUnlocked] = useState(defaultUnlocked);
  const inputId = id || `editable-date-${Math.random().toString(36).slice(2)}`;
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
      <DatePicker
        id={inputId}
        value={value}
        onChange={(v) => onChange(v)}
        disabled={!unlocked}
        placeholder={placeholder}
        error={error}
        min={min}
        max={max}
        required={required}
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
};

EditableDatePicker.displayName = 'EditableDatePicker';