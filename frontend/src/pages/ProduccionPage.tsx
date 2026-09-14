import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Boxes,
  CheckCircle2,
  FileStack,
  FileText,
  Layers,
  MapPin,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Badge, Input, LoadingState, PageHeader, Table, type Column } from '@/components/ui';
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
import { reportesApi, type Digitador } from '@/lib/api';

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
    staleTime: 60_000,
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
        description={`Cifras calculadas directamente sobre la base de datos · actualizadas a las ${new Date(
          dataUpdatedAt || Date.now(),
        ).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
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
              etiquetaValor="aprobado por calidad"
              etiquetaTotal="aprobados por calidad"
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
            { clave: 'aprobados', nombre: 'Aprobados por calidad', color: SERIES.tres },
          ]}
        />
        <Leyenda
          items={[
            { nombre: 'Digitados', color: SERIES.uno, forma: 'linea' },
            { nombre: 'Aprobados por calidad', color: SERIES.tres, forma: 'linea' },
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
          subtitle="Los 8 clientes con más registros digitados y cuántos ya pasaron calidad"
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
              { nombre: 'Aprobados por calidad', color: SERIES.tres, forma: 'area' },
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
          subtitle={`${stats.digitadores.length} personas con registros digitados · volumen, aprobación por calidad y cajas trabajadas`}
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
    </div>
  );
}
