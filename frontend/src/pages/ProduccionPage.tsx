import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { formatearHora } from '@/lib/fechas';
import {
  Activity,
  Boxes,
  Download,
  FileStack,
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
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  type Column,
} from '@/components/ui';
import {
  BarrasHorizontales,
  ChartCard,
  ESTADO,
  Leyenda,
  Medidor,
  SERIES,
  SerieTemporal,
  conSeparador,
  etiquetaDia,
  etiquetaMes,
} from '@/components/charts';
import {
  modulosClienteApi,
  reportesApi,
  subModulosApi,
  type CajaDeCliente,
  type ClienteConDetalle,
  type Digitador,
} from '@/lib/api';
import { intervaloRefresco } from '@/lib/refresco';
import { ActividadDelEquipo } from './produccion/ActividadDelEquipo';
import { AnalisisEnTiempoReal } from './produccion/AnalisisEnTiempoReal';
import { useDescargaSeguimiento } from '@/lib/useDescargaSeguimiento';

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

/**
 * Conmutador de la curva: por día o por mes.
 *
 * Dos botones y no un desplegable porque son solo dos opciones y las dos caben
 * a la vista: elegir cuesta un clic en lugar de dos, y se ve cuál está activa
 * sin abrir nada.
 */
function SelectorDeGranularidad({
  valor,
  onChange,
}: {
  valor: 'dia' | 'mes';
  onChange: (valor: 'dia' | 'mes') => void;
}) {
  const opciones = [
    { clave: 'dia' as const, texto: 'Por día' },
    { clave: 'mes' as const, texto: 'Por mes' },
  ];
  return (
    <div
      role="group"
      aria-label="Agrupar la curva"
      className="inline-flex rounded-lg border border-silver-200 bg-surface-2 p-0.5"
    >
      {opciones.map((opcion) => (
        <button
          key={opcion.clave}
          type="button"
          aria-pressed={valor === opcion.clave}
          onClick={() => onChange(opcion.clave)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            valor === opcion.clave
              ? 'bg-surface text-silver-900 shadow-sm'
              : 'text-silver-500 hover:text-silver-700',
          )}
        >
          {opcion.texto}
        </button>
      ))}
    </div>
  );
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

  /*
   * Descarga del seguimiento de inventario en el formato oficial F-PSD-IDA-001.
   * El periodo se elige al descargar y no con los filtros de más abajo, que son
   * del explorador por cliente: el seguimiento se entrega por semana o por mes y
   * quien lo pide viene a eso, no a explorar.
   *
   * Va aquí arriba, antes del estado de carga, y no junto al botón que lo usa:
   * más abajo hay un `return` mientras las cifras cargan, y unos hooks
   * declarados después de él se ejecutarían solo en algunos renders. React
   * aborta con el error 310 y la pantalla queda en blanco.
   */
  const [eligiendoPeriodo, setEligiendoPeriodo] = useState(false);
  const [segDesde, setSegDesde] = useState('');
  const [segHasta, setSegHasta] = useState('');
  /*
   * El seguimiento no siempre se entrega entero: se pide el de un cliente, el
   * de un acta que se está cerrando, o el de una persona. Los cuatro filtros
   * son opcionales y se combinan; sin ninguno sale todo.
   */
  const [segCliente, setSegCliente] = useState('');
  const [segActa, setSegActa] = useState('');
  const [segPersona, setSegPersona] = useState('');
  const seguimiento = useDescargaSeguimiento();
  const descargarSeguimiento = async () => {
    const llego = await seguimiento.descargar({
      desde: segDesde,
      hasta: segHasta,
      cliente: segCliente,
      acta: segActa,
      persona: segPersona,
    });
    if (llego) setEligiendoPeriodo(false);
  };

  /* Los clientes y las actas que se ofrecen salen de lo que hay registrado. */
  const clientesQuery = useQuery({
    queryKey: ['sub-modulos', 'lista'],
    queryFn: () => subModulosApi.list().then((res) => res.data),
    enabled: eligiendoPeriodo,
  });
  const actasQuery = useQuery({
    queryKey: ['modulos-cliente', 'lista'],
    queryFn: () => modulosClienteApi.list().then((res) => res.data),
    enabled: eligiendoPeriodo,
  });
  /*
   * El detalle por cliente, para saber **quién trabajó en cada uno**. Sin esto,
   * el diálogo ofrecía los digitadores de toda la empresa y se podía pedir el
   * seguimiento de alguien que no ha tocado ese cliente: el documento salía
   * vacío y parecía un fallo del sistema.
   *
   * Es la misma consulta que usa el detalle de abajo, sin filtros, así que
   * React Query la comparte en vez de pedirla dos veces.
   */
  const detalleQuery = useQuery({
    queryKey: ['estadisticas', 'detalle', '', '', ''],
    queryFn: async () => (await reportesApi.produccionDetallada({})).data,
    enabled: eligiendoPeriodo,
  });

  const opcionesCliente = useMemo(
    () => (clientesQuery.data ?? []).map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.entidad_remitente}` })),
    [clientesQuery.data],
  );
  /*
   * Los técnicos que se ofrecen: los que han digitado en lo que se está
   * pidiendo. Con un cliente elegido, los suyos; si además hay un acta, solo
   * los de esa acta. Sin cliente, todos los que tienen registros.
   */
  const opcionesTecnico = useMemo(() => {
    const todos = (stats?.digitadores ?? []).map((d) => d.nombre);
    if (!segCliente) return todos.map((nombre) => ({ value: nombre, label: nombre }));
    const cliente = (detalleQuery.data ?? []).find((c) => c.codigo === segCliente);
    if (!cliente) return [];
    const nombres = segActa
      ? [...new Set(cliente.detalle_cajas.filter((c) => c.acta === segActa).flatMap((c) => c.personas))]
      : cliente.digitadores.map((d) => d.nombre);
    return nombres.sort((uno, otro) => uno.localeCompare(otro, 'es')).map((nombre) => ({ value: nombre, label: nombre }));
  }, [stats?.digitadores, detalleQuery.data, segCliente, segActa]);

  /*
   * Si lo elegido deja de estar en la lista —se cambió de cliente o de acta—,
   * se suelta. Quedaría puesto un técnico que no trabajó ahí y el documento
   * saldría vacío sin decir por qué.
   */
  useEffect(() => {
    if (segPersona && !opcionesTecnico.some((o) => o.value === segPersona)) setSegPersona('');
  }, [opcionesTecnico, segPersona]);

  /* Las actas se acotan al cliente elegido: un acta de otro daría un documento vacío. */
  const opcionesActa = useMemo(() => {
    const todas = actasQuery.data ?? [];
    const delCliente = segCliente ? todas.filter((a) => a.codigo === segCliente) : todas;
    const numeros = [...new Set(delCliente.map((a) => String(a.acta_transferencia_modulo ?? '')).filter(Boolean))];
    return numeros
      .sort((uno, otro) => uno.localeCompare(otro, 'es', { numeric: true }))
      .map((n) => ({ value: n, label: `Acta ${n}` }));
  }, [actasQuery.data, segCliente]);

  /*
   * Por mes se ve si el trabajo crece a lo largo del año; por día se ve la
   * semana concreta, qué jornadas rindieron y cuáles se cayeron. Un mes es el
   * promedio de veinte jornadas y esconde justo eso, así que la curva se mira
   * de las dos maneras y el botón decide cuál.
   *
   * Se abre por día, que es como se sigue el trabajo: quien entra a Producción
   * quiere saber cómo va la semana, no la tendencia del año.
   */
  const [granularidad, setGranularidad] = useState<'dia' | 'mes'>('dia');

  const serieDigitacion = useMemo(
    () =>
      granularidad === 'mes'
        ? (stats?.fuids_por_mes ?? []).map((m) => ({
            etiqueta: etiquetaMes(m.mes),
            digitados: m.total,
            aprobados: m.aprobados,
          }))
        : (stats?.fuids_por_dia ?? []).map((d) => ({
            etiqueta: etiquetaDia(d.dia),
            digitados: d.total,
            aprobados: d.aprobados,
          })),
    [stats, granularidad],
  );

  const serieActividad = useMemo(
    () =>
      (stats?.actividad_reciente ?? []).map((d) => ({
        etiqueta: `${d.dia.slice(8)}/${d.dia.slice(5, 7)}`,
        cambios: d.total,
      })),
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
        actions={
          <Button variant="secondary" onClick={() => setEligiendoPeriodo(true)}>
            <Download className="size-4" />
            Seguimiento de inventario
          </Button>
        }
      />

      {/*
        Las dos secciones de la jornada en curso, plegadas.
        
        Viven aquí y no en una pantalla aparte porque responden a lo mismo que
        esta: cómo va la producción. Y van plegadas porque no se miran todo el
        rato: el resumen de la fila cerrada basta para decidir si hay que abrir.
      */}
      <ActividadDelEquipo />
      <AnalisisEnTiempoReal />

      {/*
        Periodo del seguimiento. Se pregunta antes de generar porque este
        documento se entrega por semana o por mes: bajarlo siempre completo
        obligaría a recortarlo a mano después.
      */}
      <Modal
        open={eligiendoPeriodo}
        onClose={() => setEligiendoPeriodo(false)}
        title="Descargar seguimiento de inventario"
        /*
          Ancho medio, no estrecho: los filtros son cinco y el del cliente lleva
          el código y el nombre de la entidad —"051 — CENTRO DE INVESTIGACIÓN…"—,
          que en un diálogo angosto se corta antes de poder distinguir uno de
          otro.
        */
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEligiendoPeriodo(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void descargarSeguimiento()} loading={seguimiento.descargando}>
              <Download className="mr-2 size-4" />
              {seguimiento.descargando ? 'Generando…' : 'Descargar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-silver-600">
            Sale en el formato oficial F-PSD-IDA-001, con una fila por jornada, cliente y colaborador.
            Deje un filtro vacío para no acotar por él.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Cliente"
              placeholder="Todos"
              options={[{ value: '', label: 'Todos' }, ...opcionesCliente]}
              value={segCliente}
              onChange={(valor) => {
                setSegCliente(valor);
                // El acta elegida es de otro cliente: se suelta en vez de
                // quedar puesta y devolver un documento vacío.
                setSegActa('');
              }}
              disabled={seguimiento.descargando}
            />
            <Select
              label="Acta"
              placeholder="Todas"
              options={[{ value: '', label: 'Todas' }, ...opcionesActa]}
              value={segActa}
              onChange={setSegActa}
              disabled={seguimiento.descargando}
            />
            <Select
              label="Técnico"
              placeholder="Todos"
              options={[{ value: '', label: 'Todos' }, ...opcionesTecnico]}
              value={segPersona}
              onChange={setSegPersona}
              disabled={seguimiento.descargando}
              hint={
                segCliente && opcionesTecnico.length === 0
                  ? 'Nadie ha digitado todavía en lo que elegiste'
                  : segCliente
                    ? 'Solo quienes han digitado en este cliente'
                    : undefined
              }
            />
            <DatePicker label="Desde" value={segDesde} onChange={setSegDesde} max={segHasta || undefined} disabled={seguimiento.descargando} />
            <DatePicker label="Hasta" value={segHasta} onChange={setSegHasta} min={segDesde || undefined} disabled={seguimiento.descargando} />
          </div>
          {/*
            La etapa en curso. Son etapas de verdad —consultar, armar, guardar—,
            así que lo que se lee corresponde a lo que el servidor está haciendo.
          */}
          {seguimiento.mensaje && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 rounded-lg border border-silver-200 bg-surface-2 px-3 py-2.5 text-sm text-silver-700"
            >
              <Spinner className="size-4 shrink-0 text-primary-600" />
              <span>{seguimiento.mensaje}</span>
            </div>
          )}
        </div>
      </Modal>

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

      {/*
        Aquí había cuatro tarjetas —aprobados, pendientes, cajas registradas y
        ritmo mensual— y las cuatro repetían algo que ya está más abajo y mejor
        contado: la aprobación la dice el medidor de arriba con su porcentaje;
        las cajas, la tarjeta "Estado de las cajas"; y el ritmo, la curva que
        viene a continuación, que además deja ver la forma y no solo el último
        mes.
      */}

      <ChartCard
        title={granularidad === 'mes' ? 'Digitación y revisión por mes' : 'Digitación y revisión por día'}
        subtitle={
          granularidad === 'mes'
            ? 'Últimos 12 meses con registros. Pasa el cursor por un mes para ver ambas cifras.'
            : 'Últimos 30 días con registros. Pasa el cursor por un día para ver ambas cifras.'
        }
        icon={<TrendingUp className="size-4 text-primary-600" />}
        actions={
          <SelectorDeGranularidad valor={granularidad} onChange={setGranularidad} />
        }
      >
        <SerieTemporal
          datos={serieDigitacion}
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

        {/*
          Lo que queda del bloque lateral: dos cifras que no están en ninguna
          otra parte de la pantalla, y dónde se está trabajando.

          Tenía también las cajas con y sin FUID —que ya cuenta "Estado de las
          cajas"— y una dona de personal por rol, que dice cuántos usuarios hay
          de cada perfil: eso es administración de cuentas, no producción, y en
          un módulo que se mira para saber cómo va el trabajo ocupaba el sitio
          de algo que sí se usa para decidir.
        */}
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
      </div>

      <DetallePorCliente personas={(stats?.digitadores ?? []).map((d) => d.nombre)} />
    </div>
  );
}

/** Las cajas heredadas pueden no tener acta relacionada, y también se ven. */
const SIN_ACTA = 'Sin acta';

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

  /*
   * Las cajas repartidas en sus actas, con el avance de cada una. Un cliente
   * entrega por actas, así que "cómo va el acta 122" tiene que leerse sin
   * sumar filas a ojo.
   */
  const porActa = useMemo(() => {
    const grupos = new Map<string, { acta: string; cajas: CajaDeCliente[]; registros: number; aprobados: number }>();
    for (const caja of cajas) {
      const acta = caja.acta?.trim() || SIN_ACTA;
      const grupo = grupos.get(acta) ?? { acta, cajas: [], registros: 0, aprobados: 0 };
      grupo.cajas.push(caja);
      grupo.registros += caja.registros;
      grupo.aprobados += caja.aprobados;
      grupos.set(acta, grupo);
    }
    return [...grupos.values()].sort((uno, otro) =>
      uno.acta.localeCompare(otro.acta, 'es', { numeric: true }),
    );
  }, [cajas]);

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

      {/*
        Las cajas, agrupadas por su acta.
        
        Es el nivel que faltaba: un cliente entrega por actas, y "cómo va el
        acta 122" era una pregunta que había que contestar sumando filas a ojo
        en una tabla donde el número de acta se repetía en cada una. Cada grupo
        lleva su propio avance, y dentro van sus cajas.
      */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-silver-700">
          Cajas ({cajas.length}) en {porActa.length} {porActa.length === 1 ? 'acta' : 'actas'}
        </h3>
        {porActa.map((grupo) => (
          <div key={grupo.acta} className="rounded-lg border border-silver-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-silver-100 bg-silver-50 px-3 py-2">
              <span className="font-medium text-silver-800">
                {grupo.acta === SIN_ACTA ? SIN_ACTA : `Acta ${grupo.acta}`}
              </span>
              <span className="text-sm text-silver-600">
                {grupo.cajas.length} {grupo.cajas.length === 1 ? 'caja' : 'cajas'} ·{' '}
                <strong className="text-silver-800">{grupo.registros}</strong> registros ·{' '}
                {grupo.aprobados} aprobados
              </span>
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-silver-200 text-left text-xs uppercase tracking-wide text-silver-500">
                    <th className="py-2 pr-3">Caja</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3 text-right">Registros</th>
                    <th className="py-2 pr-3 text-right">Aprobados</th>
                    <th className="py-2 pr-3">Último registro</th>
                    <th className="py-2">Quién digita</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.cajas.map((caja) => (
                    <tr key={caja.caja} className="border-b border-silver-100 last:border-b-0">
                      <td className="py-2 pr-3 font-medium text-silver-800">{caja.caja}</td>
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
        ))}
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
