import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, CheckCircle2, Clock, FileText } from 'lucide-react';
import { Badge, Card, PageHeader, Spinner, Table, type Column } from '@/components/ui';
import { reportesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

interface TopDigitador {
  nombre: string;
  total: number;
}

export default function ProduccionPage() {
  const { data: fuidRows = [], isLoading } = useQuery({
    queryKey: ['fuid-con-estado-caja'],
    queryFn: async () => (await reportesApi.fuidConEstadoCaja()).data,
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    const total = fuidRows.length;
    const cajas = new Set(fuidRows.map((r) => r.caja).filter(Boolean));
    const aprobados = fuidRows.filter((r) => r.historial_y_cambios === 'OK').length;
    const pendientes = total - aprobados;

    const porUsuario = new Map<string, number>();
    for (const r of fuidRows) {
      const nombre = r.elaborado_por?.trim();
      if (!nombre) continue;
      porUsuario.set(nombre, (porUsuario.get(nombre) ?? 0) + 1);
    }
    const top: TopDigitador[] = Array.from(porUsuario.entries())
      .map(([nombre, totalUsuarios]) => ({ nombre, total: totalUsuarios }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const porEstadoCaja = new Map<string, number>();
    for (const r of fuidRows) {
      const estado = r.estado_caja ?? 'SIN ESTADO';
      porEstadoCaja.set(estado, (porEstadoCaja.get(estado) ?? 0) + 1);
    }

    const pct = total > 0 ? Math.round((aprobados / total) * 100) : 0;
    return { total, cajas: cajas.size, aprobados, pendientes, pct, top, porEstadoCaja };
  }, [fuidRows]);

  const statCards = [
    {
      label: 'FUID Registrados',
      value: metrics.total,
      icon: FileText,
      color: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Cajas en Producción',
      value: metrics.cajas,
      icon: Boxes,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Aprobados',
      value: metrics.aprobados,
      icon: CheckCircle2,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Pendientes',
      value: metrics.pendientes,
      icon: Clock,
      color: 'text-slate-600 bg-slate-100',
    },
  ];

  const topColumns: Column<TopDigitador>[] = [
    { key: 'nombre', header: 'Digitador' },
    {
      key: 'total',
      header: 'Registros',
      render: (row) => <Badge color="amber">{row.total}</Badge>,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción"
        description="Resumen del avance de digitación y revisión de FUID"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="flex items-center gap-4 p-5">
            <div className={cn('rounded-xl p-3', card.color)}>
              <card.icon className="size-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{card.value.toLocaleString('es-CO')}</p>
              <p className="text-sm text-slate-500">{card.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-base font-semibold text-slate-800">Avance de revisión</h3>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-600">{metrics.aprobados.toLocaleString('es-CO')} de {metrics.total.toLocaleString('es-CO')} aprobados</span>
            <span className="font-semibold text-primary-700">{metrics.pct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${metrics.pct}%` }}
            />
          </div>

          <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Registros por estado de caja
          </h4>
          <div className="space-y-2">
            {Array.from(metrics.porEstadoCaja.entries()).map(([estado, count]) => (
              <div key={estado} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <Badge
                  color={
                    estado === 'FINALIZADO' ? 'green' : estado === 'EN PROCESO' ? 'amber' : 'gray'
                  }
                >
                  {estado}
                </Badge>
                <span className="font-medium text-slate-700">{count.toLocaleString('es-CO')}</span>
              </div>
            ))}
            {metrics.porEstadoCaja.size === 0 && (
              <p className="text-sm text-slate-500">Sin datos de estado de caja.</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-base font-semibold text-slate-800">Top digitadores</h3>
          <Table columns={topColumns} data={metrics.top} rowKey={(row) => row.nombre} emptyMessage="Sin registros por usuario" />
        </Card>
      </div>
    </div>
  );
}
