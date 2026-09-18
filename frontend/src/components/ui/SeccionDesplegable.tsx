import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Una fila que se abre y muestra su contenido.
 *
 * Sirve para meter en una pantalla que ya está llena piezas que no se miran
 * todo el tiempo. Producción es la pantalla del líder y ya trae sus cifras; la
 * actividad del equipo y el análisis por persona se consultan cuando hacen
 * falta, así que viven aquí dentro en vez de ocupar sitio permanentemente o
 * mandar a la persona a otra pantalla.
 *
 * El resumen de la cabecera se ve con la fila cerrada, que es lo que hace útil
 * el plegado: se decide si merece la pena abrir sin tener que abrir.
 *
 * El contenido no se monta hasta la primera apertura. Estas secciones consultan
 * al servidor y se refrescan solas; montarlas cerradas sería pedir datos que
 * nadie está mirando.
 */

export interface SeccionDesplegableProps {
  titulo: string;
  /** Qué hay dentro, en una línea, visible con la fila cerrada. */
  resumen?: ReactNode;
  icono?: ReactNode;
  /** Abierta desde el principio. Por defecto se abre al pulsar. */
  abiertaPorDefecto?: boolean;
  children: ReactNode;
  className?: string;
}

export function SeccionDesplegable({
  titulo,
  resumen,
  icono,
  abiertaPorDefecto = false,
  children,
  className,
}: SeccionDesplegableProps) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  /** Una vez abierta, el contenido se queda montado y conserva su estado. */
  const [seAbrioAlgunaVez, setSeAbrioAlgunaVez] = useState(abiertaPorDefecto);
  const idContenido = useId();

  const alternar = () => {
    setAbierta((previo) => !previo);
    setSeAbrioAlgunaVez(true);
  };

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-silver-200 bg-surface shadow-sm transition-shadow duration-300 hover:shadow-md',
        className,
      )}
    >
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        aria-controls={idContenido}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      >
        {icono && <span className="shrink-0 text-silver-500">{icono}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-silver-800">{titulo}</span>
          {resumen && <span className="mt-0.5 block text-sm text-silver-600">{resumen}</span>}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-5 shrink-0 text-silver-400 transition-transform duration-200',
            abierta && 'rotate-180',
          )}
        />
      </button>

      {seAbrioAlgunaVez && (
        <div id={idContenido} hidden={!abierta} className="border-t border-silver-200 p-5">
          {children}
        </div>
      )}
    </section>
  );
}
