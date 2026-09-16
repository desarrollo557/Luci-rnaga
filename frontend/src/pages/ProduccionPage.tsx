import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatearHora } from '@/lib/fechas';
import {
  Activity,
  Boxes,
  CheckCircle2,
  FileStack,
  FileText,
  FilterX,
  Layers,
  MapPin,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import {
  BarrasHorizontales,
  ChartCard,
  Dona,
  ESTADO,
  Leyenda,
  Medidor,
  SERIES,
  SERIES_ORDEN,
  SerieTemporal,
  StatTile,
  conSeparador,
  etiquetaMes,
} from '@/components/charts';
import {
  reportesApi,
  type ClienteConDetalle,
  type Digitador,
} from '@/lib/api';
import { intervaloRefresco } from '@/lib/refresco';

/** El estado de la caja es una escala reservada, no una serie más. */
const COLOR_ESTADO_CAJA: Record<string, string> = {
  FINALIZADO: ESTADO.bueno,
  'EN PROCESO': ESTADO.advertencia,
  'SIN ESTADO': 'var(--chart-atenuado)',
};

/** "SALLY PINEDA (1046812542)" → "SALLY PINEDA". */
function nombreSinCedula(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/, '').trim() || nombre;
}

export default function ProduccionPage() {
  const { data: stats, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['produccion', 'estadisticas'],
    queryFn: async () => (await reportesApi.estadisticas()).data,
    // Sin `staleTime` largo: este panel existe para mirar cómo va el trabajo
    // ahora, y con un minuto de margen enseñaba cifras viejas a quien lo tenía
    // abierto justo cuando entraba el trabajo.
    refetchInterval: intervaloRefresco(),
  });
  const [filtroDigitador, setFiltroDigitador] = useState('');

  const serieMensual = useMemo(
    () =>
      (stats?.fuids_por_mes ?? []).map((m) => ({
        etiqueta: etiquetaMes(m.mes),
        digitados: m.total,
        aprobados: m.aprobados,
      })),
    [stats],
  );

  const serieActividad = useMemo(
    () =>
      (stats?.actividad_reciente ?? []).map((d) => ({
        etiqueta: `${d.dia.slice(8)}/${d.dia.slice(5, 7)}`,
        cambios: d.total,
      })),
    [stats],
  );

  const tendenciaDigitacion = useMemo(
    () => (stats?.fuids_por_mes ?? []).map((m) => m.total),
    [stats],
  );

  // Búsqueda por nombre, cédula, rol o sede sobre TODOS los digitadores.
  const termino = filtroDigitador.trim().toLowerCase();
  const digitadoresFiltrados = useMemo(() => {
    const todos = stats?.digitadores ?? [];
    if (!termino) return todos;
    return todos.filter((d) =>
      [d.nombre, d.cc ?? '', d.rol ?? '', d.sede ?? ''].some((campo) => campo.toLowerCase().includes(termino)),
    );
  }, [stats, termino]);

  if (isLoading || !stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingState message="Estamos consultando la información…" />
      </div>
    );
  }

  const pctAvance =
    stats.total_fuids > 0 ? Math.round((stats.fuids_aprobados / stats.total_fuids) * 100) : 0;

  const columnasDigitadores: Column<Digitador>[] = [
    {
      key: 'nombre',
      header: 'Digitador',
      render: (row) => (
        <div>
          <p className="font-medium text-silver-800">{nombreSinCedula(row.nombre)}</p>
          <p className="text-xs text-silver-500">
            {row.cc ? `CC ${row.cc}` : 'Sin cédula'}
            {row.rol ? ` · ${row.rol}` : ' · Sin usuario activo'}
            {row.sede ? ` · ${row.sede}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Registros',
      render: (row) => (
        <span className="font-semibold text-silver-800" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {conSeparador(row.total)}
        </span>
      ),
    },
    {
      key: 'aprobados',
      header: 'Aprobados',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{conSeparador(row.aprobados)}</span>
      ),
    },
    {
      key: 'pct',
      header: '% Aprobado',
      render: (row) => {
        const pct = row.total > 0 ? Math.round((row.aprobados / row.total) * 100) : 0;
        return <Badge color={pct >= 50 ? 'green' : pct >= 20 ? 'amber' : 'gray'}>{pct}%</Badge>;
      },
    },
    {
      key: 'cajas',
      header: 'Cajas',
      render: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{conSeparador(row.cajas)}</span>,
    },
    {
      key: 'ultimo_registro',
      header: 'Último registro',
      render: (row) => <span className="text-silver-600">{row.ultimo_registro ?? '—'}</span>,
    },
  ];

  const porcionesCajas = stats.cajas_por_estado.map((c) => ({
    etiqueta: c.estado,
    valor: c.total,
    color: COLOR_ESTADO_CAJA[c.estado] ?? 'var(--chart-atenuado)',
  }));

  const sedePrincipal = stats.fuids_por_sede[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción"
        description={`Cifras calculadas directamente sobre la base de datos · actualizadas a las ${formatearHora(
          dataUpdatedAt || Date.now(),
        )}`}
      />

      {/* Cifra guía del panel: una sola, y el resto la contextualiza. */}
      <section className="rounded-xl border border-silver-200 bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-silver-500">
              FUID digitados en total
            </p>
            <p className="mt-1 text-5xl font-bold leading-none text-silver-900">
              {conSeparador(stats.total_fuids)}
            </p>
            <p className="mt-2 text-sm text-silver-500">
              repartidos en {conSeparador(stats.cajas_con_fuids)} cajas ·{' '}
              {stats.promedio_fuids_por_caja} registros por caja en promedio
            </p>
          </div>
          <div className="min-w-64 flex-1">
            <Medidor
              valor={stats.fuids_aprobados}
              total={stats.total_fuids}
              color={SERIES.tres}
              etiquetaValor="aprobado"
              etiquetaTotal="aprobados"
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="FUID aprobados"
          value={stats.fuids_aprobados}
          icon={CheckCircle2}
          tono="aqua"
          detalle={`${pctAvance}% del total digitado`}
        />
        <StatTile
          label="FUID pendientes de revisión"
          value={stats.fuids_pendientes}
          icon={FileText}
          tono="ambar"
          detalle={`${100 - pctAvance}% del total digitado`}
        />
        <StatTile
          label="Cajas registradas"
          value={stats.total_cajas}
          icon={Boxes}
          tono="azul"
          detalle={`${conSeparador(stats.cajas_sin_fuids)} aún sin FUID`}
        />
        <StatTile
          label="Ritmo mensual"
          value={tendenciaDigitacion[tendenciaDigitacion.length - 1] ?? 0}
          icon={TrendingUp}
          tono="marca"
          detalle="registros del último mes con datos"
          tendencia={tendenciaDigitacion}
          colorTendencia={SERIES.uno}
        />
      </div>

      <ChartCard
        title="Digitación y revisión por mes"
        subtitle="Últimos 12 meses con registros. Pasa el cursor por un mes para ver ambas cifras."
        icon={<TrendingUp className="size-4 text-primary-600" />}
      >
        <SerieTemporal
          datos={serieMensual}
          alto={280}
          series={[
            { clave: 'digitados', nombre: 'Digitados', color: SERIES.uno, area: true },
            { clave: 'aprobados', nombre: 'Aprobados', color: SERIES.tres },
          ]}
        />
        <Leyenda
          items={[
            { nombre: 'Digitados', color: SERIES.uno, forma: 'linea' },
            { nombre: 'Aprobados', color: SERIES.tres, forma: 'linea' },
          ]}
        />
      </ChartCard>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <ChartCard
          title="Estado de las cajas"
          subtitle={`${conSeparador(stats.total_cajas)} cajas registradas`}
          icon={<Boxes className="size-4 text-primary-600" />}
        >
          <Medidor
            valor={stats.cajas_finalizadas}
            total={stats.total_cajas}
            color={ESTADO.bueno}
            etiquetaValor="cajas finalizadas"
            etiquetaTotal="cajas finalizadas"
          />
          <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
            {porcionesCajas.map((p) => (
              <div key={p.etiqueta} className="rounded-lg bg-silver-50 px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-xs text-silver-500">
                  <span className="block size-2 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                  {p.etiqueta}
                </dt>
                <dd className="mt-1 text-lg font-bold text-silver-900">{conSeparador(p.valor)}</dd>
              </div>
            ))}
            <div className="rounded-lg bg-silver-50 px-3 py-2.5">
              <dt className="text-xs text-silver-500">Sin FUID</dt>
              <dd className="mt-1 text-lg font-bold text-primary-700">
                {conSeparador(stats.cajas_sin_fuids)}
              </dd>
            </div>
          </dl>
        </ChartCard>

        <ChartCard
          title="Avance por cliente"
          subtitle="Los 8 clientes con más registros digitados y cuántos ya están aprobados"
          icon={<Layers className="size-4 text-primary-600" />}
        >
          <BarrasHorizontales
            datos={stats.avance_por_submodulo.map((s) => ({
              etiqueta: s.entidad ? `${s.submodulo} · ${s.entidad}` : `Cliente ${s.submodulo}`,
              valor: s.total,
              parcial: s.aprobados,
            }))}
            color={SERIES.uno}
            colorParcial={SERIES.tres}
            anchoEtiqueta={160}
            nombreParcial="aprobados"
            nombreResto="pendientes"
          />
          <Leyenda
            items={[
              { nombre: 'Aprobados', color: SERIES.tres, forma: 'area' },
              { nombre: 'Pendientes de revisión', color: SERIES.uno, forma: 'area' },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Cambios en los registros"
        subtitle="Ediciones y eliminaciones de FUID guardadas en el historial, últimos 30 días con movimiento"
        icon={<Activity className="size-4 text-primary-600" />}
      >
        <SerieTemporal
          datos={serieActividad}
          alto={220}
          series={[{ clave: 'cambios', nombre: 'Cambios registrados', color: SERIES.dos, area: true }]}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Digitadores"
          subtitle={`${stats.digitadores.length} personas con registros digitados · volumen, aprobación y cajas trabajadas`}
          icon={<Users className="size-4 text-primary-600" />}
          className="lg:col-span-2"
        >
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
            <Input
              value={filtroDigitador}
              onChange={(event) => setFiltroDigitador(event.target.value)}
              placeholder="Buscar digitador por nombre, cédula, rol o sede…"
              className="pl-9"
              aria-label="Buscar digitador"
            />
          </div>
          <Table
            columns={columnasDigitadores}
            data={digitadoresFiltrados}
            rowKey={(row) => row.nombre}
            emptyMessage={termino ? 'Ningún digitador coincide con la búsqueda' : 'Sin registros por usuario'}
          />
        </ChartCard>

        <div className="space-y-6">
          <ChartCard
            title="Cobertura documental"
            subtitle="Alcance del inventario"
            icon={<FileStack className="size-4 text-primary-600" />}
          >
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-silver-600">Clientes</dt>
                <dd className="font-semibold text-silver-900">{conSeparador(stats.total_clientes)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-silver-600">Actas de transferencia</dt>
                <dd className="font-semibold text-silver-900">{conSeparador(stats.total_actas)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-silver-600">Cajas con FUID</dt>
                <dd className="font-semibold text-silver-900">{conSeparador(stats.cajas_con_fuids)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-silver-600">Cajas sin FUID</dt>
                <dd className="font-semibold text-primary-700">{conSeparador(stats.cajas_sin_fuids)}</dd>
              </div>
              {sedePrincipal && (
                <div className="flex items-center justify-between border-t border-silver-100 pt-3">
                  <dt className="flex items-center gap-1.5 text-silver-600">
                    <MapPin className="size-3.5" /> {sedePrincipal.sede}
                  </dt>
                  <dd className="font-semibold text-silver-900">{conSeparador(sedePrincipal.total)}</dd>
                </div>
              )}
            </dl>
          </ChartCard>

          <ChartCard title="Personal por rol" subtitle={`${stats.total_usuarios} usuarios registrados`}>
            <Dona
              porciones={stats.usuarios_por_rol.map((u, i) => ({
                etiqueta: u.rol,
                valor: u.total,
                color: SERIES_ORDEN[i % SERIES_ORDEN.length],
              }))}
              tamano={140}
              centroValor={String(stats.total_usuarios)}
              centroEtiqueta="personas"
            />
          </ChartCard>
        </div>
      </div>

      <DetallePorCliente personas={(stats?.digitadores ?? []).map((d) => d.nombre)} />
    </div>
  );
}

/** Cifra suelta del panel del cliente. */
function Cifra({ etiqueta, valor, detalle }: { etiqueta: string; valor: number | string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-silver-200 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-silver-500">{etiqueta}</p>
      <p className="text-xl font-bold text-silver-900">{valor}</p>
      {detalle && <p className="text-xs text-silver-500">{detalle}</p>}
    </div>
  );
}

function fecha(valor: string | null): string {
  if (!valor) return '—';
  const [a, m, d] = valor.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Lo que se ha hecho en un cliente: sus cajas, su avance y quién trabaja en él. */
function PanelDelCliente({ cliente, estadoCaja }: { cliente: ClienteConDetalle; estadoCaja: string }) {
  const avance = cliente.registros > 0 ? Math.round((cliente.aprobados / cliente.registros) * 100) : 0;
  const cajasHechas = cliente.cajas > 0 ? Math.round((cliente.cajas_finalizadas / cliente.cajas) * 100) : 0;

  // "Sin empezar" no es un estado de la caja, sino no haber digitado nada en
  // ella: se resuelve por los registros, no por la columna de estado.
  const cajas = cliente.detalle_cajas.filter((caja) => {
    if (!estadoCaja) return true;
    if (estadoCaja === 'SIN_REGISTROS') return caja.registros === 0;
    return (caja.estado ?? '').toUpperCase() === estadoCaja;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Cifra etiqueta="Actas" valor={cliente.actas} />
        <Cifra
          etiqueta="Cajas"
          valor={cliente.cajas}
          detalle={`${cliente.cajas_finalizadas} terminadas · ${cliente.cajas_en_proceso} en proceso`}
        />
        <Cifra
          etiqueta="Cajas terminadas"
          valor={`${cajasHechas}%`}
          detalle={`${cliente.cajas_sin_registros} sin empezar`}
        />
        <Cifra etiqueta="Registros" valor={cliente.registros} detalle={`${cliente.pendientes} sin revisar`} />
        <Cifra
          etiqueta="Aprobados"
          valor={`${avance}%`}
          detalle={`${cliente.aprobados} de ${cliente.registros}`}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-silver-700">Cajas ({cajas.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-silver-200 text-left text-xs uppercase tracking-wide text-silver-500">
                <th className="py-2 pr-3">Caja</th>
                <th className="py-2 pr-3">Acta</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Registros</th>
                <th className="py-2 pr-3 text-right">Aprobados</th>
                <th className="py-2 pr-3">Último registro</th>
                <th className="py-2">Quién digita</th>
              </tr>
            </thead>
            <tbody>
              {cajas.map((caja) => (
                <tr key={caja.caja} className="border-b border-silver-100 last:border-b-0">
                  <td className="py-2 pr-3 font-medium text-silver-800">{caja.caja}</td>
                  <td className="py-2 pr-3 text-silver-600">{caja.acta ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <Badge color={caja.estado === 'FINALIZADO' ? 'green' : 'amber'}>
                      {caja.estado ?? 'Sin estado'}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-silver-800">{caja.registros}</td>
                  <td className="py-2 pr-3 text-right text-silver-600">{caja.aprobados}</td>
                  <td className="py-2 pr-3 text-silver-600">{fecha(caja.ultimo_dia)}</td>
                  <td className="py-2 text-silver-600">
                    {caja.personas.length > 0 ? caja.personas.join(', ') : 'Sin digitar'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cliente.digitadores.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-silver-700">
            Personas trabajando en este cliente ({cliente.digitadores.length})
          </h3>
          <ul className="divide-y divide-silver-100 rounded-lg border border-silver-200">
            {cliente.digitadores.map((d) => (
              <li key={d.nombre} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium text-silver-800">{d.nombre}</span>
                {d.rol && <Badge color="gray">{d.rol}</Badge>}
                <span className="text-silver-600">
                  {d.registros} registro(s) en {d.cajas.length} caja(s)
                </span>
                <span className="ml-auto text-silver-500">
                  del {fecha(d.primer_dia)} al {fecha(d.ultimo_dia)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Producción de un cliente concreto.
 *
 * El resumen de arriba mira el conjunto; aquí se elige un cliente y se ve lo
 * suyo: cuántas actas y cajas tiene, cuántas están terminadas, cuánto se ha
 * digitado y revisado, y quién está trabajando en cada caja.
 */
function DetallePorCliente({ personas }: { personas: string[] }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [persona, setPersona] = useState('');
  const [estadoCaja, setEstadoCaja] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<string>('');

  // Persona y fechas se envían al servidor para que las cifras sean las de ese
  // recorte; el buscador y el estado de la caja solo afinan lo que ya llegó.
  const { data, isLoading } = useQuery({
    queryKey: ['estadisticas', 'detalle', desde, hasta, persona],
    queryFn: async () =>
      (
        await reportesApi.produccionDetallada({
          desde: desde || undefined,
          hasta: hasta || undefined,
          persona: persona || undefined,
        })
      ).data,
  });

  const clientes = useMemo(() => {
    const lista = data ?? [];
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return lista;
    return lista.filter(
      (c) => c.cliente.toLowerCase().includes(texto) || c.codigo.toLowerCase().includes(texto),
    );
  }, [data, busqueda]);
  // Al entrar se muestra el cliente con más producción, para no dejar el panel
  // vacío esperando un clic.
  const actual = clientes.find((c) => c.codigo === seleccionado) ?? clientes[0];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-silver-900">Productividad por cliente</h2>
          <p className="text-sm text-silver-500">
            Elija un cliente para ver sus cajas, su avance y quién trabaja en él
          </p>
        </div>
        {/* Ancho acotado: con el del formulario, los selectores se iban al otro
            extremo de la tarjeta y dejaban el título descolgado. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52">
            <Select
              label="Persona"
              placeholder="Todas"
              options={personas.map((p) => ({ value: p, label: p }))}
              value={persona}
              onChange={setPersona}
            />
          </div>
          <div className="w-44">
            <Select
              label="Estado de la caja"
              placeholder="Todos"
              options={[
                { value: 'FINALIZADO', label: 'Finalizadas' },
                { value: 'EN PROCESO', label: 'En proceso' },
                { value: 'SIN_REGISTROS', label: 'Sin empezar' },
              ]}
              value={estadoCaja}
              onChange={setEstadoCaja}
            />
          </div>
          <div className="w-40">
            <DatePicker label="Desde" value={desde} onChange={setDesde} />
          </div>
          <div className="w-40">
            <DatePicker label="Hasta" value={hasta} onChange={setHasta} />
          </div>
          {(persona || estadoCaja || desde || hasta || busqueda) && (
            <Button
              variant="ghost"
              onClick={() => {
                setPersona('');
                setEstadoCaja('');
                setDesde('');
                setHasta('');
                setBusqueda('');
              }}
            >
              <FilterX className="mr-1.5 size-4" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : clientes.length === 0 ? (
        <p className="py-6 text-center text-sm text-silver-500">
          No hay clientes con cajas registradas en ese rango de fechas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
              <Input
                className="pl-9"
                placeholder="Buscar cliente…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {clientes.map((c) => {
              const activo = actual?.codigo === c.codigo;
              return (
                <li key={c.codigo}>
                  <button
                    type="button"
                    onClick={() => setSeleccionado(c.codigo)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      activo ? 'border-primary-300 bg-primary-50' : 'border-silver-200 hover:bg-silver-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-silver-100 px-1.5 py-0.5 text-xs font-semibold text-silver-700">
                        {c.codigo}
                      </span>
                      <span className="truncate text-sm font-medium text-silver-900">{c.cliente}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-silver-500">
                      {c.registros} registro(s) · {c.cajas} caja(s)
                    </span>
                  </button>
                </li>
              );
            })}
            </ul>
            {clientes.length === 0 && (
              <p className="px-1 text-sm text-silver-500">Ningún cliente coincide con la búsqueda.</p>
            )}
          </div>

          {actual ? (
            <PanelDelCliente cliente={actual} estadoCaja={estadoCaja} />
          ) : (
            <p className="text-sm text-silver-500">Seleccione un cliente.</p>
          )}
        </div>
      )}
    </Card>
  );
}
