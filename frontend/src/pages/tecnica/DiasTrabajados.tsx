import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fechaHoyLocal, formatearFecha } from '@/lib/fechas';

/**
 * Los días que la persona trabajó, en un calendario.
 *
 * Es el cuarto eje del panel: el árbol contesta cuánto lleva en cada cliente,
 * acta y caja, y esto contesta cuándo lo hizo. Los dos se cruzan al elegir un
 * día, porque entonces el árbol enseña lo de ese día y nada más.
 *
 * Antes era una fila de botones, uno por día con trabajo. Con dos semanas ya
 * era una lista larga que no decía en qué semana caía cada fecha ni dejaba ver
 * un hueco —tres días seguidos sin digitar—, que es justo lo que se mira al
 * repasar el mes. El calendario lo dice de un vistazo: los días con trabajo
 * llevan su cifra y los demás quedan apagados.
 */

/** Como en el resto del software, la semana empieza en lunes. */
const DIAS_DE_LA_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

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
}

const conSeparador = (n: number) => n.toLocaleString('es-CO');

function comoISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** El mes de una fecha ISO, como fecha local sin sorpresas de zona horaria. */
function mesDe(iso: string): Date {
  const [anio, mes] = iso.split('-').map(Number);
  return new Date(anio, (mes ?? 1) - 1, 1);
}

export function DiasTrabajados({ dias, elegido, onElegir }: Props) {
  const registrosPorDia = useMemo(() => new Map(dias.map((d) => [d.dia, d.registros])), [dias]);

  /*
   * El mes que se enseña al abrir: el del día elegido si lo hay, y si no el del
   * último día con trabajo. Abrir en el mes corriente dejaría el calendario en
   * blanco a quien lleva una semana sin digitar.
   */
  const [mes, setMes] = useState<Date>(() => mesDe(elegido || dias[0]?.dia || fechaHoyLocal()));

  const celdas = useMemo(() => {
    const anio = mes.getFullYear();
    const numeroDeMes = mes.getMonth();
    // La semana empieza en lunes: el domingo de JavaScript es 0 y aquí va al final.
    const primerDiaSemana = (new Date(anio, numeroDeMes, 1).getDay() + 6) % 7;
    const diasDelMes = new Date(anio, numeroDeMes + 1, 0).getDate();
    const total = Math.ceil((primerDiaSemana + diasDelMes) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const numero = i - primerDiaSemana + 1;
      if (numero < 1 || numero > diasDelMes) return null;
      return { iso: comoISO(new Date(anio, numeroDeMes, numero)), numero };
    });
  }, [mes]);

  const nombreDelMes = mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const hoy = fechaHoyLocal();

  if (dias.length === 0) {
    return (
      <p className="text-sm text-silver-500">
        Todavía no hay días con registros. En cuanto digites, aquí aparece lo de cada día.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-silver-500" />
          <p className="text-sm text-silver-600">
            {elegido
              ? `Mostrando lo digitado el ${formatearFecha(elegido)}`
              : 'Elige un día para ver lo que hiciste, por cliente, acta y caja'}
          </p>
        </div>
        {elegido && (
          <Button variant="ghost" size="sm" onClick={() => onElegir('')}>
            Ver todo el acumulado
          </Button>
        )}
      </div>

      <div className="max-w-sm rounded-xl border border-silver-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            aria-label="Mes anterior"
            className="rounded-lg p-1 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-900"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium capitalize text-silver-800">{nombreDelMes}</span>
          <button
            type="button"
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            aria-label="Mes siguiente"
            className="rounded-lg p-1 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-900"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {DIAS_DE_LA_SEMANA.map((inicial, i) => (
            <div key={`${inicial}-${i}`} className="flex h-6 items-center justify-center text-xs text-silver-400">
              {inicial}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {celdas.map((celda, i) => {
            if (!celda) return <div key={`vacia-${i}`} />;
            const registros = registrosPorDia.get(celda.iso);
            const trabajado = registros !== undefined;
            const esElegido = celda.iso === elegido;
            return (
              <button
                key={celda.iso}
                type="button"
                /* Un día sin trabajo no se elige: el árbol saldría vacío. */
                disabled={!trabajado}
                aria-pressed={esElegido}
                title={trabajado ? `${conSeparador(registros)} registros` : undefined}
                onClick={() => onElegir(esElegido ? '' : celda.iso)}
                className={cn(
                  'flex h-12 flex-col items-center justify-center rounded-lg text-sm transition-colors',
                  !trabajado && 'text-silver-300',
                  trabajado && !esElegido && 'bg-primary-50 font-medium text-primary-800 hover:bg-primary-100',
                  esElegido && 'bg-brand font-semibold text-white',
                  celda.iso === hoy && !esElegido && 'ring-1 ring-inset ring-primary-300',
                )}
              >
                <span>{celda.numero}</span>
                {trabajado && (
                  <span className={cn('text-[10px] leading-tight', esElegido ? 'text-white/90' : 'text-primary-600')}>
                    {conSeparador(registros)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
