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
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Cómo se comparan lo tecleado y una opción: sin tildes y sin mayúsculas.
 *
 * Los catálogos del software van en mayúsculas, pero quien digita escribe con
 * la mano suelta y no tiene por qué acertar la tilde de «GESTIÓN» para llegar a
 * su opción.
 */
function plano(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Cuánto dura lo tecleado antes de volver a empezar.
 *
 * Novecientos milisegundos: lo bastante para escribir cuatro o cinco letras sin
 * correr, y lo bastante poco para que la siguiente palabra empiece limpia en
 * vez de pegarse a la anterior.
 */
const MEMORIA_DE_TECLEO_MS = 900;

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
  size = 'md',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const selected = options.find((opt) => opt.value === value);

  /*
   * El teclado, que es como se elige cuando se está digitando de corrido.
   *
   * Quien llena el FUID tiene las dos manos en el teclado y soltar una para
   * buscar el ratón cuesta más que la elección misma. Así que este selector se
   * maneja como el de toda la vida: se escriben las primeras letras de la
   * opción, se confirma con Enter y se sigue con el Tab. Las flechas mueven una
   * a una para lo demás.
   *
   * `activo` es la opción resaltada, que no es la elegida: es la que Enter va a
   * elegir. `tecleado` es lo que se lleva escrito, que se olvida solo.
   */
  const [activo, setActivo] = useState(-1);
  const [tecleado, setTecleado] = useState('');
  const olvido = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opcionesRef = useRef<(HTMLButtonElement | null)[]>([]);

  /** La primera opción que empieza por lo tecleado; si ninguna empieza, la primera que lo contenga. */
  const buscarPorTexto = (texto: string): number => {
    const busca = plano(texto);
    if (!busca) return -1;
    const empieza = options.findIndex((opt) => plano(opt.label).startsWith(busca));
    if (empieza >= 0) return empieza;
    return options.findIndex((opt) => plano(opt.label).includes(busca));
  };

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
    // Se abre sobre lo que ya estaba elegido: desde ahí las flechas mueven a lo
    // de al lado, que es lo que se espera al corregir una elección anterior.
    setActivo(options.findIndex((opt) => opt.value === value));
  };

  const handleOptionClick = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
  };

  /** Lo tecleado se olvida solo, para que la siguiente búsqueda empiece limpia. */
  const recordarTecleo = (texto: string) => {
    setTecleado(texto);
    if (olvido.current) clearTimeout(olvido.current);
    olvido.current = setTimeout(() => setTecleado(''), MEMORIA_DE_TECLEO_MS);
  };

  // La opción resaltada se trae a la vista: con veinte asuntos en la caja, la
  // que se buscó puede estar fuera de la ventana del desplegable.
  useEffect(() => {
    if (!open || activo < 0) return;
    // Con `?.` también en el método: jsdom no lo implementa y las pruebas de
    // componentes montan este selector.
    opcionesRef.current[activo]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activo]);

  // Al cerrar no queda memoria de nada: ni resaltado ni letras a medias.
  useEffect(() => {
    if (open) return;
    setActivo(-1);
    setTecleado('');
    if (olvido.current) clearTimeout(olvido.current);
  }, [open]);

  useEffect(() => () => { if (olvido.current) clearTimeout(olvido.current); }, []);

  /**
   * El teclado del selector, esté abierto o cerrado.
   *
   * Cerrado, escribir una letra lo abre y ya busca con ella: así se llega con
   * Tab, se escriben cuatro letras y se confirma sin haber mirado la lista.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      if (options.length === 0) return;
      const paso = event.key === 'ArrowDown' ? 1 : -1;
      const desde = activo < 0 ? (paso === 1 ? -1 : options.length) : activo;
      setActivo((desde + paso + options.length) % options.length);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!open) return; // El botón se encarga: abrir es su acción por omisión.
      event.preventDefault();
      // Con el espacio dentro de una búsqueda manda la búsqueda: hay asuntos de
      // varias palabras y escribirlos exige poder espaciar.
      if (event.key === ' ' && tecleado) {
        const texto = `${tecleado} `;
        recordarTecleo(texto);
        const encontrado = buscarPorTexto(texto);
        if (encontrado >= 0) setActivo(encontrado);
        return;
      }
      if (activo >= 0 && options[activo]) handleOptionClick(options[activo].value);
      else setOpen(false);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!open || options.length === 0) return;
      event.preventDefault();
      setActivo(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }

    if (event.key === 'Backspace') {
      if (!tecleado) return;
      event.preventDefault();
      const texto = tecleado.slice(0, -1);
      recordarTecleo(texto);
      const encontrado = buscarPorTexto(texto);
      if (encontrado >= 0) setActivo(encontrado);
      return;
    }

    // Una letra, un número o un signo: eso es buscar.
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (!open) openDropdown();
      const texto = `${tecleado}${event.key}`;
      recordarTecleo(texto);
      const encontrado = buscarPorTexto(texto);
      if (encontrado >= 0) setActivo(encontrado);
    }
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
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-activedescendant={open && activo >= 0 ? `${fieldId}-opcion-${activo}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className={cn(
            `flex w-full items-center justify-between gap-2 rounded-lg border border-silver-300 bg-surface text-silver-800 shadow-sm transition-all duration-200 ease-in-out hover:border-silver-400 hover:shadow focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:hover:border-silver-300 disabled:hover:shadow-none`,
            size === 'sm' && 'h-9 px-2.5 text-sm',
            size === 'md' && 'h-10 px-3 text-sm',
            size === 'lg' && 'h-12 px-4 text-base',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15',
          )}
        >
          <span className={cn('truncate text-left', !selected && 'text-silver-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              'shrink-0 text-silver-400 transition-transform duration-200',
              size === 'lg' ? 'size-5' : 'size-4',
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
              className={cn(
                'overflow-y-auto rounded-xl border border-silver-200 bg-surface p-1.5 shadow-2xl ring-1 ring-silver-900/5 animate-[modal-panel-in_0.2s_ease-out]',
                size === 'lg' ? 'max-h-96' : 'max-h-64',
              )}
            >
              {/* Lo que se lleva escrito, para que el salto del resaltado se
                  entienda: sin esto, teclear parece mover la lista sola. */}
              {tecleado && (
                <p className="truncate px-3 pb-1.5 pt-1 text-xs text-silver-500">
                  Buscando <span className="font-medium text-silver-700">{tecleado}</span> — Enter para elegir
                </p>
              )}
              {options.length === 0 ? (
                <p className="p-3 text-sm text-silver-500">Sin opciones</p>
              ) : (
                options.map((opt, indice) => {
                  const isSelected = opt.value === value;
                  const isActivo = indice === activo;
                  return (
                    <button
                      key={opt.value}
                      ref={(nodo) => {
                        opcionesRef.current[indice] = nodo;
                      }}
                      id={`${fieldId}-opcion-${indice}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleOptionClick(opt.value)}
                      onMouseEnter={() => setActivo(indice)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors duration-150',
                        size === 'lg' ? 'py-2.5' : 'py-2',
                        isSelected
                          ? 'bg-primary-50 font-medium text-primary-700'
                          : 'text-silver-800 hover:bg-primary-50 hover:text-primary-700',
                        // El resaltado del teclado se ve aunque la opción ya sea
                        // la elegida: dice cuál se lleva Enter, no cuál está puesta.
                        isActivo && 'bg-primary-50 text-primary-700 ring-2 ring-inset ring-primary-300',
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
