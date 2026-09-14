import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ClipboardCheck,
  FilterX,
  History,
  Pencil,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import {
  BarrasHorizontales,
  ChartCard,
  SERIES,
  SerieTemporal,
  StatTile,
} from '@/components/charts';
import { historialApi } from '@/lib/api';
import type { CambioCampo, MovimientoHistorial } from '@/lib/api';

const PAGE_SIZE = 20;

interface FiltrosHistorial {
  q: string;
  tipo: string;
  sede: string;
  caja: string;
  desde: string;
  hasta: string;
}

const FILTROS_VACIOS: FiltrosHistorial = { q: '', tipo: '', sede: '', caja: '', desde: '', hasta: '' };

/** Fecha y hora en el formato que se usa en el resto del software. */
function fechaHora(valor: string | null): string {
  if (!valor) return '—';
  const [dia, hora = ''] = valor.replace('T', ' ').split(' ');
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}${hora ? ` · ${hora.slice(0, 5)}` : ''}`;
}

/** Un valor vacío se muestra como guion, no como una cadena en blanco. */
function valor(v: string | null): string {
  return v == null || v === '' ? '—' : v;
}

/**
 * Un cambio, en la forma en que la gente lo lee: el nombre del campo, lo que
 * decía y lo que pasó a decir.
 */
function Cambio({ cambio }: { cambio: CambioCampo }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="font-medium text-silver-700">{cambio.etiqueta}:</span>
      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through decoration-red-300">
        {valor(cambio.antes)}
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-silver-400" aria-hidden="true" />
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
        {valor(cambio.despues)}
      </span>
    </li>
  );
}

/** Una entrada del historial. */
function Movimiento({
  movimiento,
  onVerRegistro,
}: {
  movimiento: MovimientoHistorial;
  onVerRegistro: (idDato: number) => void;
}) {
  const eliminado = movimiento.tipo_cambio === 'ELIMINADO';
  const quien = movimiento.cambio_calidad?.trim() || movimiento.elaborado_por?.trim() || 'Sin identificar';

  return (
    <li className="relative pl-8 pb-5 last:pb-0">
      {/* Hilo de la línea de tiempo; el último punto no lo continúa. */}
      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-silver-200 last:hidden" aria-hidden="true" />
      <span
        className={`absolute left-0 top-1 flex size-6 items-center justify-center rounded-full ${
          eliminado ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-700'
        }`}
        aria-hidden="true"
      >
        {eliminado ? <Trash2 className="size-3.5" /> : <Pencil className="size-3.5" />}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <Badge color={eliminado ? 'red' : 'amber'}>{eliminado ? 'Eliminado' : 'Editado'}</Badge>
        <span className="text-sm font-semibold text-silver-800">{movimiento.upd ?? 'Sin UPD'}</span>
        {movimiento.caja && <span className="text-sm text-silver-500">Caja {movimiento.caja}</span>}
        <span className="text-sm text-silver-400">·</span>
        <span className="text-sm text-silver-500">{fechaHora(movimiento.fecha_cambio)}</span>
        <button
          type="button"
          onClick={() => onVerRegistro(movimiento.id_dato)}
          className="ml-auto rounded-lg border border-silver-200 px-2.5 py-1 text-xs font-medium text-silver-600 transition-colors hover:bg-silver-50 hover:text-silver-900"
        >
          Ver todo el registro
        </button>
      </div>

      <p className="mt-1 text-sm text-silver-500">
        Por <span className="font-medium text-silver-700">{quien}</span>
        {movimiento.sede_calidad ? ` · ${movimiento.sede_calidad}` : ''}
        {movimiento.registro_eliminado && !eliminado ? ' · el registro ya no existe' : ''}
      </p>

      {movimiento.cambios.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-lg bg-silver-50 p-3">
          {movimiento.cambios.map((c) => (
            <Cambio key={c.campo} cambio={c} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-silver-400">
          {eliminado
            ? 'El registro se eliminó; esta es la copia de lo que contenía.'
            : 'Se guardó una versión sin cambios en los datos.'}
        </p>
      )}
    </li>
  );
}

export default function HistorialPage() {
  const [filtros, setFiltros] = useState<FiltrosHistorial>(FILTROS_VACIOS);
  const [page, setPage] = useState(0);
  const [registroAbierto, setRegistroAbierto] = useState<number | null>(null);

  // El historial ronda las 46.000 filas, así que filtrado y paginación viven en
  // SQL. El texto se retrasa 300 ms para no lanzar una consulta por tecla.
  const [qDiferido, setQDiferido] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDiferido(filtros.q.trim()), 300);
    return () => clearTimeout(id);
  }, [filtros.q]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['historial', qDiferido, filtros.tipo, filtros.sede, filtros.caja, filtros.desde, filtros.hasta, page],
    queryFn: async () =>
      (
        await historialApi.list({
          page,
          pageSize: PAGE_SIZE,
          q: qDiferido || undefined,
          tipo: filtros.tipo || undefined,
          sede: filtros.sede || undefined,
          caja: filtros.caja || undefined,
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  // El resumen no depende de los filtros: describe el historial completo.
  const { data: resumen } = useQuery({
    queryKey: ['historial', 'resumen'],
    queryFn: async () => (await historialApi.resumen()).data,
  });

  const movimientos = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hayFiltros = Object.values(filtros).some(Boolean);

  const updateFiltro = (patch: Partial<FiltrosHistorial>) => {
    setFiltros((prev) => ({ ...prev, ...patch }));
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de Cambios"
        description="Cada edición y cada borrado de un registro FUID, con el detalle de qué cambió"
      />

      {resumen && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Movimientos"
              value={resumen.total_movimientos}
              icon={History}
              tono="marca"
              detalle={
                resumen.ultimo_movimiento ? `El último, ${fechaHora(resumen.ultimo_movimiento)}` : undefined
              }
            />
            <StatTile label="Ediciones" value={resumen.ediciones} icon={Pencil} tono="azul" />
            <StatTile label="Eliminaciones" value={resumen.eliminaciones} icon={Trash2} tono="ambar" />
            <StatTile
              label="Registros afectados"
              value={resumen.registros_afectados}
              icon={ClipboardCheck}
              tono="aqua"
              detalle={`En ${resumen.cajas_afectadas} caja(s)`}
            />
          </div>

          {resumen.por_dia.length > 0 && (
            <ChartCard title="Actividad por día" subtitle="Ediciones y eliminaciones registradas">
              <SerieTemporal
                datos={resumen.por_dia.map((d) => ({
                  etiqueta: d.dia.slice(5),
                  Ediciones: d.ediciones,
                  Eliminaciones: d.eliminaciones,
                }))}
                series={[
                  { clave: 'Ediciones', nombre: 'Ediciones', color: SERIES.uno, area: true },
                  { clave: 'Eliminaciones', nombre: 'Eliminaciones', color: SERIES.dos },
                ]}
              />
            </ChartCard>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {resumen.campos_mas_editados.length > 0 && (
              <ChartCard
                title="Qué se corrige más"
                subtitle="Campos con más modificaciones en las últimas 300 ediciones"
              >
                <BarrasHorizontales
                  datos={resumen.campos_mas_editados.map((c) => ({ etiqueta: c.etiqueta, valor: c.total }))}
                  color={SERIES.uno}
                />
              </ChartCard>
            )}

            {resumen.por_persona.length > 0 && (
              <ChartCard
                title="Quién hace los cambios"
                subtitle="Personas con más movimientos"
                icon={<Users className="size-4" />}
              >
                <BarrasHorizontales
                  datos={resumen.por_persona.map((p) => ({ etiqueta: p.persona, valor: p.total }))}
                  color={SERIES.tres}
                  anchoEtiqueta={170}
                />
              </ChartCard>
            )}
          </div>
        </>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
            <Input
              className="h-12 pl-9 text-base"
              placeholder="Buscar por UPD, caja, quién, serie, asunto…"
              value={filtros.q}
              onChange={(e) => updateFiltro({ q: e.target.value })}
            />
          </div>

          <Select
            label="Tipo de cambio"
            placeholder="Todos"
            options={(data?.tipos ?? []).map((tipo) => ({ value: tipo, label: tipo }))}
            value={filtros.tipo}
            onChange={(value) => updateFiltro({ tipo: value })}
          />

          <Select
            label="Sede"
            placeholder="Todas"
            options={(data?.sedes ?? []).map((sede) => ({ value: sede, label: sede }))}
            value={filtros.sede}
            onChange={(value) => updateFiltro({ sede: value })}
          />

          <Input
            label="Caja"
            placeholder="000C000000"
            value={filtros.caja}
            onChange={(e) => updateFiltro({ caja: e.target.value.toUpperCase() })}
          />

          <DatePicker label="Desde" value={filtros.desde} onChange={(value) => updateFiltro({ desde: value })} />
          <DatePicker label="Hasta" value={filtros.hasta} onChange={(value) => updateFiltro({ hasta: value })} />

          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setFiltros(FILTROS_VACIOS);
                setPage(0);
              }}
              disabled={!hayFiltros}
            >
              <FilterX className="mr-1.5 size-4" />
              Limpiar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-silver-500">
            {total === 0 ? 'Sin movimientos' : `${total} movimiento(s)`}
            {isFetching && !isLoading ? ' · actualizando…' : ''}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                Anterior
              </Button>
              <span className="text-sm text-silver-500">
                {page + 1} de {totalPages}
              </span>
              <Button
                variant="ghost"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <LoadingState />
        ) : movimientos.length === 0 ? (
          <p className="py-8 text-center text-sm text-silver-500">
            No hay movimientos que coincidan con los filtros.
          </p>
        ) : (
          <ul className="relative">
            {movimientos.map((m) => (
              <Movimiento key={m.id_historial} movimiento={m} onVerRegistro={setRegistroAbierto} />
            ))}
          </ul>
        )}
      </Card>

      {registroAbierto != null && (
        <LineaDeTiempoRegistro idDato={registroAbierto} onClose={() => setRegistroAbierto(null)} />
      )}
    </div>
  );
}

/** La vida completa de un registro, de lo más antiguo a lo más reciente. */
function LineaDeTiempoRegistro({ idDato, onClose }: { idDato: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['historial', 'registro', idDato],
    queryFn: async () => (await historialApi.registro(idDato)).data,
  });

  const actual = data?.actual as Record<string, string | null> | null | undefined;

  return (
    <Modal open onClose={onClose} title={`Historial del registro ${idDato}`} size="lg">
      {isLoading ? (
        <LoadingState />
      ) : !data ? (
        <p className="text-sm text-silver-500">No hay historial para ese registro.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-silver-50 p-3 text-sm">
            {data.registro_eliminado ? (
              <Badge color="red">Eliminado</Badge>
            ) : (
              <Badge color="green">Vigente</Badge>
            )}
            {actual?.upd && <span className="font-semibold text-silver-800">{actual.upd}</span>}
            {actual?.caja && <span className="text-silver-500">Caja {actual.caja}</span>}
            <span className="text-silver-500">
              {data.movimientos.length} movimiento(s) registrados
            </span>
          </div>

          {data.movimientos.length === 0 ? (
            <p className="text-sm text-silver-500">
              El registro no ha tenido cambios desde que se creó.
            </p>
          ) : (
            <ul className="relative">
              {data.movimientos.map((m) => (
                <Movimiento key={m.id_historial} movimiento={m} onVerRegistro={() => undefined} />
              ))}
            </ul>
          )}

          {actual && (
            <div className="rounded-lg border border-silver-200 p-3">
              <p className="mb-2 text-sm font-semibold text-silver-700">Cómo está ahora</p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {[
                  ['Asunto', actual.asunto],
                  ['Serie', actual.serie],
                  ['Subserie', actual.subserie],
                  ['Folios', actual.folios],
                  ['Fecha inicial', actual.fecha_inicial],
                  ['Fecha final', actual.fecha_final],
                  ['Elaborado por', actual.elaborado_por],
                  ['Estado de revisión', actual.historial_y_cambios],
                ].map(([etiqueta, v]) => (
                  <div key={etiqueta as string} className="flex justify-between gap-3">
                    <dt className="text-silver-500">{etiqueta}</dt>
                    <dd className="truncate font-medium text-silver-800">{valor(v as string | null)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
