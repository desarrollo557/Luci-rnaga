import { useMemo } from 'react';
import { AlertTriangle, Gauge, LineChart, Trophy } from 'lucide-react';
import { Badge, LoadingState, SeccionDesplegable } from '@/components/ui';
import { BarrasHorizontales, ChartCard, ESTADO, SERIES } from '@/components/charts';
import { destacadosDe } from '@/lib/destacados';
import { ritmoPorHora } from '@/lib/presencia';
import { señalesDe, useActividad } from './useActividad';

/**
 * Cómo va cada persona hoy, mientras va pasando.
 *
 * La tabla de al lado dice quién está conectado; esto dice quién está rindiendo
 * y a quién hay que preguntarle algo. Son dos preguntas distintas y por eso son
 * dos secciones: una se mira de reojo cada rato, la otra se abre cuando hay que
 * decidir a quién mover de caja o a quién reconocer el día.
 *
 * **Volumen y ritmo van en dos gráficas, no en una.** Quien más lleva hecho
 * casi siempre es quien lleva más horas; quien entra a media mañana puede ir
 * más rápido que nadie y aparecer el último por total. Juntarlos en un solo
 * número esconde los dos méritos.
 */

/** El nombre sin la cédula, que es como llega el de quien ya no tiene cuenta. */
const soloNombre = (valor: string) => valor.replace(/\s*\([^)]*\)\s*$/, '').trim() || valor;

export function AnalisisEnTiempoReal() {
  const { personas, ahora, isPending } = useActividad();

  const medibles = useMemo(
    () =>
      personas.map((p) => ({
        ...señalesDe(p),
        nombre: soloNombre(p.nombre),
        registros: p.registros,
        cajas: p.cajas,
        primerRegistro: p.primer_registro,
        ritmo: ritmoPorHora(p.primer_registro, p.ultimo_registro, p.registros),
      })),
    // Solo depende de los datos: el ritmo se mide entre el primer registro y el
    // último, no contra la hora actual.
    [personas],
  );

  const conRegistros = useMemo(
    () => medibles.filter((p) => p.registros > 0).sort((a, b) => b.registros - a.registros),
    [medibles],
  );
  const conRitmo = useMemo(
    () =>
      medibles
        .filter((p): p is typeof p & { ritmo: number } => p.ritmo !== null)
        .sort((a, b) => b.ritmo - a.ritmo),
    [medibles],
  );
  const { porVolumen, porRitmo, detenidos } = useMemo(
    () => destacadosDe(medibles, ahora),
    [medibles, ahora],
  );

  const totalRegistros = conRegistros.reduce((suma, p) => suma + p.registros, 0);

  return (
    <SeccionDesplegable
      titulo="Análisis en tiempo real"
      icono={<LineChart className="size-5" />}
      resumen={
        isPending
          ? 'Consultando…'
          : porVolumen
            ? `${porVolumen.persona.nombre} lidera con ${porVolumen.valor.toLocaleString('es-CO')} registros · ${totalRegistros.toLocaleString('es-CO')} en total hoy`
            : 'Todavía no hay registros digitados hoy'
      }
    >
      {isPending ? (
        <div className="flex justify-center py-8">
          <LoadingState message="Estamos consultando la información…" />
        </div>
      ) : conRegistros.length === 0 ? (
        <p className="py-6 text-center text-sm text-silver-500">
          Todavía no hay registros digitados hoy. En cuanto alguien guarde el primero, aquí aparece
          el reparto por persona.
        </p>
      ) : (
        <div className="space-y-5">
          {/*
            Lo primero, en palabras: a quién reconocer y a quién preguntar. Una
            gráfica se interpreta; esto se lee.
          */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {porVolumen && (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <Trophy className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-800">Más registros hoy</p>
                  <p className="truncate font-semibold text-silver-900">{porVolumen.persona.nombre}</p>
                  <p className="text-sm text-silver-600">
                    {porVolumen.valor.toLocaleString('es-CO')} registros
                  </p>
                </div>
              </div>
            )}
            {porRitmo && (
              <div className="flex items-start gap-3 rounded-lg border border-silver-200 bg-surface-2 p-3">
                <Gauge className="mt-0.5 size-5 shrink-0 text-silver-600" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-silver-700">Mejor ritmo</p>
                  <p className="truncate font-semibold text-silver-900">{porRitmo.persona.nombre}</p>
                  <p className="text-sm text-silver-600">{porRitmo.valor} registros por hora</p>
                </div>
              </div>
            )}
            {detenidos.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary-700" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary-800">Conectados sin digitar</p>
                  <p className="truncate font-semibold text-silver-900">
                    {detenidos.map((p) => p.nombre).join(', ')}
                  </p>
                  <p className="text-sm text-silver-600">Tienen el software abierto y no avanzan</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard
              title="Registros por persona"
              subtitle="Lo digitado hoy, de más a menos"
            >
              <BarrasHorizontales
                datos={conRegistros.map((p) => ({ etiqueta: p.nombre, valor: p.registros }))}
                color={SERIES.uno}
                anchoEtiqueta={150}
              />
            </ChartCard>

            <ChartCard
              title="Ritmo por persona"
              subtitle="Registros por hora sobre el tiempo que lleva trabajando cada quien"
            >
              {conRitmo.length === 0 ? (
                <p className="py-8 text-center text-sm text-silver-500">
                  Todavía no hay a quién medirle el ritmo. Hace falta un rato de trabajo seguido para
                  que la cifra signifique algo.
                </p>
              ) : (
                <BarrasHorizontales
                  datos={conRitmo.map((p) => ({ etiqueta: p.nombre, valor: p.ritmo }))}
                  color={ESTADO.bueno}
                  anchoEtiqueta={150}
                  formatoValor={(n) => `${n} /h`}
                />
              )}
            </ChartCard>
          </div>

          <p className="text-xs text-silver-500">
            Se actualiza solo. El ritmo se mide del primer registro de la persona al último, no
            sobre la jornada completa: quien entró a media mañana no ha tenido todo el día.{' '}
            <Badge color="gray">{conRegistros.length} personas con trabajo hoy</Badge>
          </p>
        </div>
      )}
    </SeccionDesplegable>
  );
}
