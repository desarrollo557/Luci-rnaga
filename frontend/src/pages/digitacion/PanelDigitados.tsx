import { CheckCircle2, Eye } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatearHora } from '@/lib/fechas';
import type { FuidDato } from '@/types';

/**
 * Lo que ya se digitó en la caja, a la vista mientras se digita lo siguiente.
 *
 * El formulario se abre en un diálogo y tapa la tabla de registros que hay
 * detrás. Encadenando veinte registros seguidos, la única señal de que algo se
 * guardaba era una confirmación que se apagaba a los dos segundos y medio: al
 * rato no quedaba nada en pantalla que dijera qué se llevaba hecho. Este panel
 * deja ese rastro permanente al lado del formulario, sin que haya que pulsar
 * nada para verlo.
 *
 * Muestra cuatro datos por registro, no las trece columnas de la tabla: el
 * número de orden y el UPD identifican, el asunto es lo que permite reconocer el
 * documento de un vistazo, y los folios y la hora dan la medida de lo hecho. El
 * resto sigue en la tabla, para cuando se cierre el formulario.
 */

export interface PanelDigitadosProps {
  /** Los registros de la caja, en cualquier orden: aquí se ordenan. */
  registros: FuidDato[];
  /** UPD guardados sin cerrar el formulario, para distinguir lo de esta sesión. */
  deEstaSesion: Set<string>;
  /** UPD del último guardado, que se resalta un momento. */
  ultimoGuardado?: string | null;
  /** UPD que quedó listo para el registro siguiente. */
  proximoUpd?: string;
  /** Abrir un registro para mirarlo en detalle y, si hace falta, corregirlo. */
  onVistaPrevia: (registro: FuidDato) => void;
  /** El registro que se está mirando o corrigiendo, para marcarlo en la lista. */
  abierto?: number | null;
}

/**
 * De lo más reciente a lo más antiguo.
 *
 * Ordena por el momento de creación, no por el número de orden: los registros
 * heredados de la base antigua pueden no traerlo, y el identificador desempata
 * cuando dos caen en el mismo instante.
 */
function masRecientesPrimero(registros: FuidDato[]): FuidDato[] {
  return [...registros].sort((a, b) => {
    const creadoA = a.created_at ?? '';
    const creadoB = b.created_at ?? '';
    if (creadoA !== creadoB) return creadoB.localeCompare(creadoA);
    return (b.id ?? 0) - (a.id ?? 0);
  });
}

export function PanelDigitados({
  registros,
  deEstaSesion,
  ultimoGuardado,
  proximoUpd,
  onVistaPrevia,
  abierto,
}: PanelDigitadosProps) {
  const ordenados = masRecientesPrimero(registros);
  const total = registros.length;

  return (
    <aside
      aria-label="Registros ya digitados en esta caja"
      /*
        En pantalla ancha es una columna a la derecha, del alto del diálogo. En
        pantalla estrecha pasa debajo del formulario y se limita el alto: si
        creciera sin tope, empujaría el formulario fuera de la vista.
      */
      className="flex min-h-0 max-h-64 flex-col rounded-xl border border-silver-200 bg-surface-2 lg:h-full lg:max-h-none lg:w-[21rem] lg:shrink-0"
    >
      <div className="border-b border-silver-200 px-4 py-3">
        <p className="text-sm font-semibold text-silver-800">Digitado en esta caja</p>
        <p className="mt-0.5 text-xs text-silver-600">
          {total.toLocaleString('es-CO')} {total === 1 ? 'registro' : 'registros'}
          {deEstaSesion.size > 0 && ` · ${deEstaSesion.size} en esta sesión`}
        </p>
        {/*
          El aviso de guardado vive aquí, no encima del formulario. Antes era un
          cartel grande que tapaba los campos justo cuando hay que empezar a
          escribir el siguiente registro.
        */}
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs font-medium text-green-700">
          {ultimoGuardado && (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
              {ultimoGuardado} guardado{proximoUpd ? ` · sigue ${proximoUpd}` : ''}
            </span>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {total === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-silver-500">
            Todavía no hay registros en esta caja. El primero que guarde aparecerá aquí.
          </p>
        ) : (
          <ul className="divide-y divide-silver-100">
            {ordenados.map((registro) => {
              const upd = registro.upd ?? '';
              const esElUltimo = Boolean(ultimoGuardado) && upd === ultimoGuardado;
              return (
                <li
                  key={registro.id}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2.5 transition-colors duration-500',
                    deEstaSesion.has(upd) && 'bg-primary-50/60',
                    esElUltimo && 'bg-green-50',
                    registro.id === abierto && 'bg-silver-100 ring-1 ring-inset ring-silver-300',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-silver-800">{upd || '—'}</span>
                      <span className="shrink-0 text-xs text-silver-500">
                        N° {registro.n_orden ?? '—'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-silver-700" title={registro.asunto ?? ''}>
                      {registro.asunto?.trim() || 'Sin asunto'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-silver-500">
                      {registro.folios != null && registro.folios !== '' ? `${registro.folios} folios` : 'Sin folios'}
                      {registro.created_at && ` · ${formatearHora(registro.created_at)}`}
                    </p>
                  </div>
                  {/*
                    La lupa está siempre visible, no solo al pasar el ratón: es la
                    única forma de llegar al detalle desde aquí, y una acción que
                    hay que descubrir moviendo el ratón no la encuentra nadie.
                  */}
                  <button
                    type="button"
                    onClick={() => onVistaPrevia(registro)}
                    title={`Ver el detalle de ${upd || 'este registro'}`}
                    aria-label={`Ver el detalle de ${upd || 'este registro'}`}
                    className="mt-0.5 shrink-0 rounded-lg p-1.5 text-silver-400 transition-colors hover:bg-silver-200 hover:text-silver-700 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  >
                    <Eye className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
