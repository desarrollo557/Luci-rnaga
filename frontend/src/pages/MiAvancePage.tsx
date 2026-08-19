import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  TrendingUp,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, PageHeader, Select, Table, type Column } from '@/components/ui';
import { rangosUpdApi, subModulosApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface AvanceRow {
  usuario_id: number;
  nombre: string;
  total_asignadas: number;
  finalizadas: number;
  pendientes: number;
  porcentaje: number;
}

interface SubModulo {
  id: number;
  codigo: string;
  entidad_remitente: string;
}

/** Anillo de progreso SVG standalone (sin dependencia de <Progress>). */
function ProgressRing({ porcentaje }: { porcentaje: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (porcentaje / 100) * circumference;

  let stroke = '#10b981'; // emerald-600
  if (porcentaje < 30) stroke = '#f59e0b'; // amber-600
  if (porcentaje === 0) stroke = '#cbd5e1'; // silver-300

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          className="text-silver-200"
          strokeWidth="6"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="56"
          cy="56"
        />
        <circle
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={stroke}
          fill="transparent"
          r={radius}
          cx="56"
          cy="56"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="absolute text-center">
        <span className="text-2xl font-bold text-silver-800">{porcentaje}%</span>
        <span className="block text-xs text-silver-500">completado</span>
      </span>
    </div>
  );
}

/** Tarjeta de estadística: icono + label + valor, usando solo Card y Tailwind. */
function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  trend?: string;
  iconColor: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg bg-silver-100 ${iconColor}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-silver-500 truncate">{label}</p>
          <p className="text-xl font-semibold text-silver-900">{value}</p>
          {trend && <p className="text-xs text-emerald-600">{trend}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function MiAvancePage() {
  const user = useAuthStore((state) => state.user);
  const [subModuloId, setSubModuloId] = useState<number | undefined>();
  const [subModulos, setSubModulos] = useState<SubModulo[]>([]);

  // Cargar sub-módulos para el filtro.
  useEffect(() => {
    subModulosApi
      .list()
      .then((res) => setSubModulos(res.data))
      .catch(() => toast.error('No se pudieron cargar los sub-módulos'));
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rangos-upd', 'mi-avance', subModuloId],
    queryFn: () => rangosUpdApi.miAvance(subModuloId).then((res) => res.data),
    enabled: Boolean(user?.rol === 'TECNICA'),
    staleTime: 30_000,
  });

  const avance = data?.por_tecnico?.[0];

  if (user?.rol !== 'TECNICA') {
    return (
      <Card className="max-w-md mx-auto mt-10 p-8 text-center">
        <AlertCircle className="size-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-silver-800 mb-2">Acceso restringido</h2>
        <p className="text-silver-600">Esta página es exclusiva para el perfil TECNICA.</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="size-8 text-primary-600 animate-spin" />
        <p className="text-silver-500">Cargando tu avance…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="max-w-md mx-auto mt-10 p-8 text-center">
        <AlertCircle className="size-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-silver-800 mb-2">Error al cargar</h2>
        <p className="text-silver-600 mb-4">
          {error instanceof Error ? error.message : 'Inténtalo de nuevo'}
        </p>
        <Button onClick={() => refetch()}>
          Reintentar
        </Button>
      </Card>
    );
  }

  if (!avance) {
    return (
      <Card className="max-w-2xl mx-auto mt-10 p-8 text-center">
        <HelpCircle className="size-12 text-silver-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-silver-800 mb-2">Sin rangos asignados</h2>
        <p className="text-silver-600 mb-6">
          Aún no tienes rangos de UPD activos o agotados para mostrar. Pídele a tu líder que te
          asigne un rango para comenzar.
        </p>
        {subModulos.length > 0 && (
          <div className="text-sm text-silver-500">
            Sub-módulos disponibles: {subModulos.map((s) => s.codigo).join(', ')}
          </div>
        )}
      </Card>
    );
  }

  const { total_asignadas, finalizadas, pendientes, porcentaje, nombre } = avance;
  const rangosCount = data?.por_tecnico.length ?? 1;

  // Columnas para la tabla de detalle (solo si hay varias filas).
  const columns: Column<AvanceRow>[] = [
    { key: 'nombre', header: 'Técnica' },
    { key: 'total_asignadas', header: 'Asignadas' },
    { key: 'finalizadas', header: 'Finalizadas' },
    { key: 'pendientes', header: 'Pendientes' },
    { key: 'porcentaje', header: 'Avance %' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi Avance UPD"
        description={`Progreso de ${nombre} — Rangos activos y agotados`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Select
                options={[
                  { value: '', label: 'Todos los sub-módulos' },
                  ...subModulos.map((sm) => ({ value: String(sm.id), label: `${sm.codigo} — ${sm.entidad_remitente}` })),
                ]}
                value={subModuloId != null ? String(subModuloId) : ''}
                onChange={(value) => setSubModuloId(value ? Number(value) : undefined)}
                placeholder="Seleccione un sub-módulo"
                size="lg"
                className="min-w-72"
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => refetch()}
            >
              <Loader2 className="size-4 mr-1" /> Actualizar
            </Button>
          </div>
        }
      />

      {/* Resumen principal */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[260px] flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-lg font-bold">
              {nombre.charAt(0)}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-silver-800">{nombre}</h3>
              <p className="text-sm text-silver-500">Perfil: Técnica Digitalizadora</p>
              <Badge color="red" className="mt-1">
                {user?.rol}
              </Badge>
            </div>
          </div>
          <ProgressRing porcentaje={porcentaje} />
        </div>
      </Card>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Total asignadas"
          value={total_asignadas.toLocaleString()}
          iconColor="text-blue-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Finalizadas"
          value={finalizadas.toLocaleString()}
          trend={`${porcentaje}% completado`}
          iconColor="text-emerald-600"
        />
        <StatCard
          icon={Clock}
          label="Pendientes"
          value={pendientes.toLocaleString()}
          trend={pendientes === 0 ? '¡Todo al día!' : 'Por procesar'}
          iconColor="text-amber-600"
        />
        <StatCard
          icon={User}
          label="Rangos"
          value={rangosCount}
          iconColor="text-primary-600"
        />
      </div>

      {/* Barra de progreso grande (HTML/CSS sin <Progress>). */}
      <Card>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-silver-700">Progreso global</span>
            <span className="text-sm text-silver-500">
              {pendientes === 0
                ? '¡Has completado todas las UPDs asignadas!'
                : `Te faltan ${pendientes.toLocaleString()} UPDs por procesar`}
            </span>
          </div>
          <div className="w-full h-4 bg-silver-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-silver-400">
            <span>0%</span>
            <span>{porcentaje}%</span>
            <span>100%</span>
          </div>
        </div>
      </Card>

      {/* Detalle por técnico si hay varias filas. */}
      {data && data.por_tecnico.length > 1 && (
        <Card>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-silver-800 mb-3">Detalle</h3>
            <Table
              columns={columns}
              data={data.por_tecnico}
              rowKey={(row) => row.usuario_id}
            />
          </div>
        </Card>
      )}

      {/* Info adicional */}
      <Card className="bg-silver-50">
        <div className="p-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="size-5 text-primary-600" />
            <span className="text-sm text-silver-700">
              El avance se calcula sobre rangos <strong>activos</strong> y{' '}
              <strong>agotados</strong>. Los revocados no cuentan.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <HelpCircle className="size-5 text-primary-600" />
            <span className="text-sm text-silver-700">
              Cada vez que guardas un registro con UPD, se marca como consumida y tu avance se
              actualiza automáticamente.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
