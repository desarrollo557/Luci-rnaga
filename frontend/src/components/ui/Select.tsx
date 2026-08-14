import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  error?: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  required?: boolean;
}

export const Select = function Select({
  label,
  options,
  error,
  hint,
  placeholder,
  value,
  onChange,
  disabled = false,
  className,
  id,
  required,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Mantiene el popover dentro del viewport y lo deja flotando sobre cualquier contenedor.
  useEffect(() => {
    if (!open || !position || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    let { top, left } = position;
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, top - rect.height - 16);
    }
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (top !== position.top || left !== position.left) {
      setPosition({ top, left, width: position.width });
    }
  }, [open, position]);

  const openDropdown = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    setOpen(true);
  };

  const handleOptionClick = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={cn('w-full', className)}>
      {label && (
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-silver-700">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          id={fieldId}
          type="button"
          disabled={disabled}
          onClick={openDropdown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-silver-300 bg-white px-3 text-sm text-silver-800 shadow-sm transition-all duration-200 ease-in-out hover:border-silver-400 hover:shadow focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:bg-silver-50 disabled:hover:border-silver-300 disabled:hover:shadow-none',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15',
          )}
        >
          <span className={cn('truncate text-left', !selected && 'text-silver-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-silver-400 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>

        {open &&
          position &&
          createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                zIndex: 60,
                width: position.width,
              }}
              className="max-h-64 overflow-y-auto rounded-xl border border-silver-200 bg-white p-1.5 shadow-2xl ring-1 ring-silver-900/5 animate-[modal-panel-in_0.2s_ease-out]"
            >
              {options.length === 0 ? (
                <p className="p-3 text-sm text-silver-500">Sin opciones</p>
              ) : (
                options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleOptionClick(opt.value)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150',
                        isSelected
                          ? 'bg-primary-50 font-medium text-primary-700'
                          : 'text-silver-800 hover:bg-primary-50 hover:text-primary-700',
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="size-4 shrink-0 text-primary-600" />}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )}
      </div>
      {!error && hint && <p className="mt-1 text-xs text-silver-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};
