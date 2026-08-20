import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';

interface SuggestionInputProps {
  caja: string;
  campo: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

interface EditableSuggestionInputProps extends Omit<SuggestionInputProps, 'disabled' | 'readOnly' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  defaultUnlocked?: boolean;
  id?: string;
  className?: string;
}

// SuggestionInput simple inline para evitar dependencias circulares
function SimpleSuggestionInput({
  campo,
  value,
  onChange,
  disabled,
  readOnly,
  placeholder,
}: SuggestionInputProps) {
  const [suggestions] = useState<string[]>([]);

  return (
    <div className="w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        list={`sug-${campo}`}
        className="w-full rounded border border-silver-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-silver-50 disabled:cursor-not-allowed readOnly:bg-silver-50 readOnly:cursor-not-allowed"
      />
      <datalist id={`sug-${campo}`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}

interface EditableSuggestionInputProps extends Omit<SuggestionInputProps, 'disabled' | 'readOnly' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  defaultUnlocked?: boolean;
  id?: string;
  className?: string;
}

export const EditableSuggestionInput = ({
  caja,
  campo,
  value,
  onChange,
  label,
  error,
  hint,
  placeholder,
  defaultUnlocked = false,
  id,
  className,
}: EditableSuggestionInputProps) => {
  const [unlocked, setUnlocked] = useState(defaultUnlocked);
  const inputId = id || `editable-sug-${Math.random().toString(36).slice(2)}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-silver-700 mb-1 flex items-center gap-1">
          {label}
          <button
            type="button"
            onClick={() => setUnlocked((prev) => !prev)}
            className="ml-1 p-0.5 rounded hover:bg-silver-100 transition-colors text-silver-500 hover:text-silver-700"
            aria-label={unlocked ? 'Bloquear edición' : 'Desbloquear para editar'}
            aria-pressed={unlocked}
            title={unlocked ? 'Bloquear (solo lectura)' : 'Desbloquear para editar'}
          >
            {unlocked ? <Unlock className="size-4 text-green-600" /> : <Lock className="size-4" />}
          </button>
        </label>
      )}
      <SimpleSuggestionInput
        caja={caja}
        campo={campo}
        value={value}
        onChange={onChange}
        disabled={!unlocked}
        readOnly={!unlocked}
        placeholder={placeholder}
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