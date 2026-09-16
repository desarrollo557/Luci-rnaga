import { forwardRef, useCallback, useId, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Campo de párrafo: se ve igual que `Input` y arranca con su mismo alto, pero al
 * llegar al borde derecho el texto salta de línea y el campo crece hacia abajo
 * para mostrarlo entero. Es para lo que se escribe largo —el asunto manual y las
 * notas del FUID—, donde una sola línea obliga a desplazarse dentro del propio
 * campo para releer lo ya escrito.
 *
 * El alto lo fija el componente en cada cambio a partir de `scrollHeight`, así
 * que la barra de desplazamiento interna sobra: de ahí `resize-none` y
 * `overflow-hidden`. La transición se limita al borde y a la sombra a propósito;
 * animar el alto haría temblar el campo mientras se teclea.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, value, onChange, ...rest },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const propio = useRef<HTMLTextAreaElement | null>(null);

  const ajustarAlto = useCallback((elemento: HTMLTextAreaElement | null) => {
    if (!elemento) return;
    // Volver a 'auto' antes de medir: `scrollHeight` nunca decrece por sí solo y
    // sin esto el campo se quedaría grande al borrar texto.
    elemento.style.height = 'auto';
    // `scrollHeight` mide contenido más relleno, pero no el borde, y con
    // `box-sizing: border-box` el alto que se asigna sí lo incluye. Asignarlo tal
    // cual dejaría el campo dos píxeles corto y recortaría la última línea.
    // `offsetHeight - clientHeight` es justo ese borde.
    const borde = elemento.offsetHeight - elemento.clientHeight;
    elemento.style.height = `${elemento.scrollHeight + borde}px`;
  }, []);

  // El valor también cambia desde fuera: al abrir el formulario para editar un
  // registro o al encadenar el siguiente tras guardar. Sin esto, un texto de
  // varias líneas se abriría con el alto de una sola.
  useLayoutEffect(() => {
    ajustarAlto(propio.current);
  }, [value, ajustarAlto]);

  const guardarReferencia = (elemento: HTMLTextAreaElement | null) => {
    propio.current = elemento;
    if (typeof ref === 'function') ref(elemento);
    else if (ref) ref.current = elemento;
  };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1 block text-sm font-medium text-silver-700">
          {label}
        </label>
      )}
      <textarea
        ref={guardarReferencia}
        id={textareaId}
        rows={1}
        value={value}
        onChange={(event) => {
          ajustarAlto(event.currentTarget);
          onChange?.(event);
        }}
        className={cn(
          'block min-h-10 w-full resize-none overflow-hidden rounded-lg border border-silver-300 bg-surface px-3 py-2.5 text-sm leading-5 text-silver-800 shadow-sm transition-[border-color,box-shadow] duration-200 ease-in-out placeholder:text-silver-400 hover:border-silver-400 hover:shadow focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:bg-surface-muted',
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
