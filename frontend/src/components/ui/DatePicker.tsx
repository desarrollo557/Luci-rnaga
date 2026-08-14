import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface DatePickerProps {
  label?: string;
  error?: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const defaultPlaceholder = 'Seleccione una fecha';

const monthTitleFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

function formatISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplay(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function getViewMonth(value: string): Date {
  if (value) {
    const [year, month] = value.split('-').map(Number);
    if (year && month) return new Date(year, month - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export const DatePicker = function DatePicker({
  label,
  error,
  hint,
  value,
  onChange,
  min,
  max,
  disabled = false,
  placeholder = defaultPlaceholder,
  className,
  id,
  required,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => getViewMonth(value));
  const wrapperRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const today = useMemo(() => new Date(), []);
  const todayISO = formatISO(today);

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, i) => {
      const dayNumber = i - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      return { iso: formatISO(new Date(year, month, dayNumber)), day: dayNumber };
    });
  }, [viewMonth]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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

  const openCalendar = () => {
    if (disabled) return;
    setViewMonth(getViewMonth(value));
    setOpen(true);
  };

  const goToPrevMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));

  const goToNextMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const isDisabled = (iso: string) => Boolean((min && iso < min) || (max && iso > max));

  const handleDayClick = (iso: string) => {
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const handleToday = () => {
    onChange(todayISO);
    setViewMonth(getViewMonth(todayISO));
  };

  const handleClear = () => {
    onChange('');
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
          id={fieldId}
          type="button"
          disabled={disabled}
          onClick={openCalendar}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-silver-300 bg-white px-3 text-sm text-silver-800 shadow-sm transition-all duration-200 ease-in-out hover:border-silver-400 hover:shadow focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:bg-silver-50 disabled:hover:border-silver-300 disabled:hover:shadow-none',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15',
          )}
        >
          <span className={cn('truncate text-left', !value && 'text-silver-400')}>
            {value ? formatDisplay(value) : placeholder}
          </span>
          <CalendarDays className="size-5 shrink-0 text-primary-600" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-silver-200 bg-white p-4 shadow-2xl ring-1 ring-silver-900/5 animate-[modal-panel-in_0.2s_ease-out]">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={goToPrevMonth}
                aria-label="Mes anterior"
                className="rounded-lg p-1 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-medium capitalize text-silver-800">
                {monthTitleFormatter.format(viewMonth)}
              </span>
              <button
                type="button"
                onClick={goToNextMonth}
                aria-label="Mes siguiente"
                className="rounded-lg p-1 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="flex h-8 items-center justify-center text-xs font-medium text-silver-400"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, index) => {
                if (!cell) return <div key={`empty-${index}`} />;
                const dayDisabled = disabled || isDisabled(cell.iso);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={dayDisabled}
                    onClick={() => handleDayClick(cell.iso)}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg text-sm transition-colors duration-150',
                      cell.iso === value
                        ? 'bg-primary-600 text-white hover:bg-primary-600'
                        : dayDisabled
                          ? 'cursor-not-allowed text-silver-300'
                          : 'text-silver-800 hover:bg-primary-50 hover:text-primary-700',
                      cell.iso === todayISO && cell.iso !== value && !dayDisabled && 'ring-1 ring-primary-500',
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-silver-100 pt-3">
              <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={handleToday}>
                Hoy
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={handleClear}>
                Limpiar
              </Button>
            </div>
          </div>
        )}
      </div>
      {!error && hint && <p className="mt-1 text-xs text-silver-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};
