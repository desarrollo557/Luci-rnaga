import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatearFecha } from '@/lib/fechas';

/**
 * Los días que la persona trabajó, con lo que produjo cada uno.
 *
 * Es el cuarto eje del panel: el árbol contesta cuánto lleva en cada cliente,
 * acta y caja, y esto contesta cuánto hizo cada día. Los dos se cruzan al
 * elegir un día, porque entonces el árbol enseña lo de ese día y nada más.
 *
 * Solo salen los días con trabajo. Una fila por cada día del calendario, con
 * los fines de semana en cero, obligaría a buscar entre huecos lo que se vino
 * a mirar.
 */

export interface DiaTrabajado {
  dia: string;
  registros: number;
}

interface Props {
  /** Los días con trabajo, del más reciente al más antiguo. */
  dias: readonly DiaTrabajado[];
  /** El día elegido, o vacío para ver el total acumulado. */
  elegido: string;
  onElegir: (dia: string) => void;
  /** Cuántos días se enseñan sin desplegar el resto. */
  tope?: number;
}

const conSeparador = (n: number) => n.toLocaleString('es-CO');

export function DiasTrabajados({ dias, elegido, onElegir, tope = 14 }: Props) {
  const visibles = useMemo(() => dias.slice(0, tope), [dias, tope]);

  if (dias.length === 0) {
    return (
      <p className="text-sm text-silver-500">
        Todavía no hay días con registros. En cuanto digites, aquí aparece lo de cada día.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 text-silver-500" />
        <p className="text-sm text-silver-600">
          {elegido
            ? `Mostrando lo digitado el ${formatearFecha(elegido)}`
            : 'Elige un día para ver lo que hiciste ese día, por cliente, acta y caja'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Volver al acumulado es un botón más, no una cruz escondida. */}
        <button
          type="button"
          onClick={() => onElegir('')}
          aria-pressed={elegido === ''}
          className={cn(
            'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
            elegido === ''
              ? 'border-primary-300 bg-primary-50 text-primary-800'
              : 'border-silver-200 text-silver-700 hover:bg-silver-50',
          )}
        >
          <span className="block font-medium">Todo</span>
          <span className="block text-xs text-silver-500">acumulado</span>
        </button>

        {visibles.map((dia) => {
          const activo = dia.dia === elegido;
          return (
            <button
              key={dia.dia}
              type="button"
              onClick={() => onElegir(activo ? '' : dia.dia)}
              aria-pressed={activo}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                activo
                  ? 'border-primary-300 bg-primary-50 text-primary-800'
                  : 'border-silver-200 text-silver-700 hover:bg-silver-50',
              )}
            >
              <span className="block font-medium">{formatearFecha(dia.dia)}</span>
              <span className={cn('block text-xs', activo ? 'text-primary-700' : 'text-silver-500')}>
                {conSeparador(dia.registros)} {dia.registros === 1 ? 'registro' : 'registros'}
              </span>
            </button>
          );
        })}
      </div>

      {dias.length > visibles.length && (
        <p className="text-xs text-silver-500">
          Se muestran los {visibles.length} días más recientes de los {dias.length} con trabajo.
        </p>
      )}
    </div>
  );
}
