import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Boxes,
  CheckCircle2,
  FileStack,
  FileText,
  Layers,
  MapPin,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Badge, LoadingState, PageHeader, Table, type Column } from '@/components/ui';
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
import { reportesApi } from '@/lib/api';

/** El estado de la caja es una escala reservada, no una serie más. */
const COLOR_ESTADO_CAJA: Record<string, string> = {
  FINALIZADO: ESTADO.bueno,
  'EN PROCESO': ESTADO.advertencia,
  'SIN ESTADO': '#b8bdc5',
};

interface FilaDigitador {
  nombre: string;
  total: number;
  aprobados: number;
}

export default function ProduccionPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['produccion', 'estadisticas'],
    queryFn: async () => (await reportesApi.estadisticas()).data,
    staleTime: 60_000,
  });

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

  if (isLoading || !stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingState message="Estamos consultando la información…" />
      </div>
    );
  }

  const pctAvance =
    stats.total_fuids > 0 ? Math.round((stats.fuids_aprobados / stats.total_fuids) * 100) : 0;

  const columnasDigitadores: Column<FilaDigitador>[] = [
    { key: 'nombre', header: 'Digitador' },
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
  ];

  const porcionesCajas = stats.cajas_por_estado.map((c) => ({
    etiqueta: c.estado,
    valor: c.total,
    color: COLOR_ESTADO_CAJA[c.estado] ?? '#b8bdc5',
  }));

  const sedePrincipal = stats.fuids_por_sede[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción"
        description="Avance real del negocio: digitación, cajas, revisión y personal"
      />

      {/* Cifra guía del panel: una sola, y el resto la contextualiza. */}
      <section className="rounded-xl border border-silver-200 bg-white p-6 shadow-sm">
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
          title="Avance por submódulo"
          subtitle="Registros digitados y cuántos ya pasaron calidad"
          icon={<Layers className="size-4 text-primary-600" />}
        >
          <BarrasHorizontales
            datos={stats.avance_por_submodulo.map((s) => ({
              etiqueta: `Submódulo ${s.submodulo}`,
              valor: s.total,
              parcial: s.aprobados,
            }))}
            color={SERIES.uno}
            colorParcial={SERIES.tres}
            anchoEtiqueta={110}
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
        title="Actividad de revisión"
        subtitle="Cambios registrados en el historial durante los últimos 30 días con movimiento"
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
          title="Top digitadores"
          subtitle="Volumen y proporción aprobada por calidad"
          icon={<Users className="size-4 text-primary-600" />}
          className="lg:col-span-2"
        >
          <Table
            columns={columnasDigitadores}
            data={stats.top_digitadores}
            rowKey={(row) => row.nombre}
            emptyMessage="Sin registros por usuario"
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
                <dt className="text-silver-600">Módulos cliente</dt>
                <dd className="font-semibold text-silver-900">
                  {conSeparador(stats.total_modulos_cliente)}
                </dd>
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
