import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, CheckCircle2, Clock, FileText, FolderOpen, MapPin, Percent, Users } from 'lucide-react';
import { Badge, Card, LoadingState, PageHeader, Table, type Column } from '@/components/ui';
import { reportesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const ROL_COLORS: Record<string, 'blue' | 'green' | 'amber' | 'red'> = {
  TECNICA: 'blue',
  CALIDAD: 'green',
  LIDER: 'amber',
  ADMIN: 'red',
};

interface TopDigitador {
  nombre: string;
  total: number;
}

function Barra({ valor, max, color = 'bg-primary-600' }: { valor: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-silver-100">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

export default function ProduccionPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['produccion', 'estadisticas'],
    queryFn: async () => (await reportesApi.estadisticas()).data,
    staleTime: 60_000,
  });

  const pct = useMemo(() => {
    if (!stats || stats.total_fuids === 0) return 0;
    return Math.round((stats.fuids_aprobados / stats.total_fuids) * 100);
  }, [stats]);

  if (isLoading || !stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingState message="Estamos consultando la información…" />
      </div>
    );
  }

  const statCards = [
    { label: 'FUID Registrados', value: stats.total_fuids, icon: FileText, color: 'text-primary-600 bg-primary-50' },
    { label: 'Cajas Totales', value: stats.total_cajas, icon: Boxes, color: 'text-silver-600 bg-silver-100' },
    { label: 'Cajas en Proceso', value: stats.cajas_en_proceso, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Cajas Finalizadas', value: stats.cajas_finalizadas, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'FUID Aprobados', value: stats.fuids_aprobados, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'FUID Pendientes', value: stats.fuids_pendientes, icon: Clock, color: 'text-silver-600 bg-silver-100' },
    { label: 'Cajas sin FUID', value: stats.cajas_sin_fuids, icon: FolderOpen, color: 'text-red-500 bg-red-50' },
    { label: 'Promedio FUID/Caja', value: stats.promedio_fuids_por_caja, icon: Percent, color: 'text-primary-600 bg-primary-50' },
  ];

  const topColumns: Column<TopDigitador>[] = [
    { key: 'nombre', header: 'Digitador' },
    { key: 'total', header: 'Registros', render: (row) => <Badge color="amber">{row.total}</Badge> },
  ];

  const maxMes = Math.max(0, ...stats.fuids_por_mes.map((m) => m.total));
  const maxSede = Math.max(0, ...stats.fuids_por_sede.map((s) => s.total));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción"
        description="Avance real del negocio: digitación, cajas, revisión y personal"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="flex items-center gap-4 p-5">
            <div className={cn('rounded-xl p-3', card.color)}>
              <card.icon className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-silver-900">
                {typeof card.value === 'number' ? card.value.toLocaleString('es-CO') : card.value}
              </p>
              <p className="text-sm text-silver-500">{card.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold text-silver-800">Avance de revisión</h3>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-silver-600">
              {stats.fuids_aprobados.toLocaleString('es-CO')} de {stats.total_fuids.toLocaleString('es-CO')} aprobados
            </span>
            <span className="font-semibold text-primary-700">{pct}%</span>
          </div>
          <Barra valor={stats.fuids_aprobados} max={stats.total_fuids} color="bg-emerald-500" />

          <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-silver-500">
            Registros por estado de caja
          </h4>
          <div className="space-y-2">
            {stats.por_estado_caja.map(({ estado, total }) => (
              <div
                key={estado}
                className="flex items-center justify-between rounded-lg bg-silver-50 px-3 py-2 text-sm"
              >
                <Badge
                  color={
                    estado === 'FINALIZADO' ? 'green' : estado === 'EN PROCESO' ? 'amber' : 'gray'
                  }
                >
                  {estado}
                </Badge>
                <span className="font-medium text-silver-700">{total.toLocaleString('es-CO')}</span>
              </div>
            ))}
            {stats.por_estado_caja.length === 0 && (
              <p className="text-sm text-silver-500">Sin datos de estado de caja.</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-silver-800">
            <BarChart3 className="size-4 text-primary-600" />
            FUID por mes (últimos 6)
          </h3>
          <div className="space-y-3">
            {stats.fuids_por_mes.map(({ mes, total }) => (
              <div key={mes} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 font-medium text-silver-600">{mes}</span>
                <div className="flex-1">
                  <Barra valor={total} max={maxMes} />
                </div>
                <span className="w-14 shrink-0 text-right font-semibold text-silver-800">
                  {total.toLocaleString('es-CO')}
                </span>
              </div>
            ))}
            {stats.fuids_por_mes.length === 0 && (
              <p className="text-sm text-silver-500">Sin registros con fecha.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-silver-800">
            <MapPin className="size-4 text-primary-600" />
            FUID por sede
          </h3>
          <div className="space-y-3">
            {stats.fuids_por_sede.map(({ sede, total }) => (
              <div key={sede} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate font-medium text-silver-600">{sede}</span>
                <div className="flex-1">
                  <Barra valor={total} max={maxSede} color="bg-silver-500" />
                </div>
                <span className="w-14 shrink-0 text-right font-semibold text-silver-800">
                  {total.toLocaleString('es-CO')}
                </span>
              </div>
            ))}
            {stats.fuids_por_sede.length === 0 && (
              <p className="text-sm text-silver-500">Sin registros con sede.</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-silver-800">
            <Users className="size-4 text-primary-600" />
            Personal por rol
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.usuarios_por_rol.map(({ rol, total }) => (
              <div
                key={rol}
                className="flex items-center gap-2 rounded-lg bg-silver-50 px-3 py-2 text-sm"
              >
                <Badge color={ROL_COLORS[rol] ?? 'gray'}>{rol}</Badge>
                <span className="font-semibold text-silver-800">{total}</span>
              </div>
            ))}
            {stats.usuarios_por_rol.length === 0 && (
              <p className="text-sm text-silver-500">Sin usuarios registrados.</p>
            )}
          </div>

          <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-silver-500">
            Resumen general
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-silver-50 px-3 py-2">
              <p className="text-silver-500">Módulos cliente</p>
              <p className="text-lg font-bold text-silver-900">{stats.total_modulos_cliente.toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-lg bg-silver-50 px-3 py-2">
              <p className="text-silver-500">Usuarios activos</p>
              <p className="text-lg font-bold text-silver-900">{stats.total_usuarios.toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-lg bg-silver-50 px-3 py-2">
              <p className="text-silver-500">Cajas con FUID</p>
              <p className="text-lg font-bold text-silver-900">{stats.cajas_con_fuids.toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-lg bg-silver-50 px-3 py-2">
              <p className="text-silver-500">Cajas sin FUID</p>
              <p className="text-lg font-bold text-red-600">{stats.cajas_sin_fuids.toLocaleString('es-CO')}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-base font-semibold text-silver-800">Top digitadores</h3>
        <Table
          columns={topColumns}
          data={stats.top_digitadores}
          rowKey={(row) => row.nombre}
          emptyMessage="Sin registros por usuario"
        />
      </Card>
    </div>
  );
}