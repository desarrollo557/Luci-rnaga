import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, HelpCircle, Loader2, TrendingUp, User } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Flex,
  Grid,
  Progress,
  Table,
  type Column,
} from '@/components/ui';
import { rangosUpdApi, subModulosApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/ui/PageHeader';

interface AvanceRow {
  usuario_id: number;
  nombre: string;
  total_asignadas: number;
  finalizadas: number;
  pendientes: number;
  porcentaje: number;
}

interface AvanceResponse {
  por_tecnico: AvanceRow[];
  filtro: { asignado_por: number | null; sub_modulo_id: number | null };
}

interface SubModulo {
  id: number;
  codigo: string;
  entidad_remitente: string;
}

function ProgressRing({ porcentaje }: { porcentaje: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (porcentaje / 100) * circumference;

  let color = 'text-emerald-600';
  if (porcentaje < 30) color = 'text-amber-600';
  if (porcentaje === 0) color = 'text-silver-400';

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
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
          className={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
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

function StatCard({ icon: Icon, label, value, color = 'text-silver-600', trend }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color?: string; trend?: string }) {
  return (
    <Card className="p-4">
      <Flex gap-3 align="center">
        <div className={`p-2 rounded-lg bg-silver-100 ${color}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-silver-500 truncate">{label}</p>
          <p className="text-xl font-semibold text-silver-900">{value}</p>
          {trend && <p className="text-xs text-emerald-600">{trend}</p>}
        </div>
      </Flex>
    </Card>
  );
}

export default function MiAvancePage() {
  const user = useAuthStore((state) => state.user);
  const [subModuloId, setSubModuloId] = useState<number | undefined>();
  const [subModulos, setSubModulos] = useState<SubModulo[]>([]);

  // Cargar sub-módulos para el filtro
  useEffect(() => {
    subModulosApi.list().then((res) => setSubModulos(res.data)).catch(() => toast.error('No se pudieron cargar los sub-módulos'));
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['rangos-upd', 'mi-avance', subModuloId],
    queryFn: () => rangosUpdApi.miAvance(subModuloId).then((res) => res.data),
    enabled: Boolean(user?.rol === 'TECNICA'),
    staleTime: 30_000,
  });

  const avance = data?.por_tecnico?.[0];

  // Recargar al cambiar filtro
  useEffect(() => {
    refetch();
  }, [subModuloId, refetch]);

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
      <Flex direction="column" align="center" gap-4 className="py-12">
        <Loader2 className="size-8 text-primary-600 animate-spin" />
        <p className="text-silver-500">Cargando tu avance…</p>
      </Flex>
    );
  }

  if (isError) {
    return (
      <Card className="max-w-md mx-auto mt-10 p-8 text-center">
        <AlertCircle className="size-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-silver-800 mb-2">Error al cargar</h2>
        <p className="text-silver-600 mb-4">{error instanceof Error ? error.message : 'Inténtalo de nuevo'}</p>
        <Button variant="outline" onClick={() => refetch()}>
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
          Aún no tienes rangos de UPD activos o agotados para mostrar.
          Pídele a tu líder que te asigne un rango para comenzar.
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi Avance UPD"
        description={`Progreso de ${nombre} — Rangos activos y agotados`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={subModuloId ?? ''}
              onChange={(e) => setSubModuloId(e.target.value ? Number(e.target.value) : undefined)}
              className="px-3 py-1.5 border border-silver-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todos los sub-módulos</option>
              {subModulos.map((sm) => (
                <option key={sm.id} value={sm.id}>
                  {sm.codigo} — {sm.entidad_remitente}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => refetch()} size="sm">
              <Loader2 className="size-4 mr-1" /> Actualizar
            </Button>
          </div>
        }
      />

      {/* Resumen principal */}
      <Card className="p-6">
        <Flex gap-6 wrap align="center" justify="between">
          <div className="flex-1 min-w-[280px]">
            <Flex gap-3 align="center" wrap>
              <Avatar size="lg" fallback={nombre.charAt(0)} />
              <div>
                <h3 className="text-xl font-semibold text-silver-800">{nombre}</h3>
                <p className="text-sm text-silver-500">Perfil: Técnica Digitalizadora</p>
              </div>
            </Flex>
          </div>
          <ProgressRing porcentaje={porcentaje} />
        </Flex>
      </Card>

      {/* Tarjetas de estadísticas */}
      <Grid columns={{ base: 1, sm: 2, lg: 4 }} gap-4>
        <StatCard
          icon={TrendingUp}
          label="Total asignadas"
          value={total_asignadas.toLocaleString()}
          color="text-blue-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Finalizadas"
          value={finalizadas.toLocaleString()}
          color="text-emerald-600"
          trend={`${porcentaje}% completado`}
        />
        <StatCard
          icon={Clock}
          label="Pendientes"
          value={pendientes.toLocaleString()}
          color="text-amber-600"
          trend={pendientes === 0 ? '¡Todo al día!' : 'Por procesar'}
        />
        <StatCard
          icon={User}
          label="Rangos activos"
          value={data?.por_tecnico.length ?? 1}
          color="text-primary-600"
        />
      </Grid>

      {/* Detalle por sub-módulo si hay más de uno */}
      {data && data.por_tecnico.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalle por sub-módulo</CardTitle>
            <CardDescription>Desglose de tu avance en cada sub-módulo asignado</CardDescription>
          </CardHeader>
          <CardContent>
            <Table
              columns={[
                { key: 'sub_modulo', header: 'Sub-módulo' },
                { key: 'total_asignadas', header: 'Asignadas', align: 'right' },
                { key: 'finalizadas', header: 'Finalizadas', align: 'right' },
                { key: 'pendientes', header: 'Pendientes', align: 'right' },
                { key: 'porcentaje', header: 'Avance', align: 'right' },
              ]}
              data={data.por_tecnico.map((row) => ({
                ...row,
                sub_modulo: `${row.nombre}`, // En el service no trae sub_módulo por separado, es total por técnico
              }))}
              rowKey={(row) => row.usuario_id}
            />
          </CardContent>
        </Card>
      )}

      {/* Barra de progreso grande */}
      <Card>
        <CardHeader>
          <CardTitle>Progreso global</CardTitle>
          <CardDescription>
            {pendientes === 0 ? '¡Has completado todas las UPDs asignadas!' : `Te faltan ${pendientes.toLocaleString()} UPDs por procesar`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={porcentaje} className="h-4" max={100} />
          <div className="mt-3 flex justify-between text-sm text-silver-500">
            <span>0%</span>
            <span>{porcentaje}%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Info adicional */}
      <Card className="bg-silver-50 border-silver-200">
        <CardContent className="pt-6">
          <Flex gap-4 wrap align="center" justify="between">
            <Flex gap-2 align="center" wrap>
              <InfoCircle className="size-5 text-primary-600" />
              <span className="text-sm text-silver-700">
                El avance se calcula sobre rangos <strong>activos</strong> y <strong>agotados</strong>.
                Los rangos revocados no cuentan.
              </span>
            </Flex>
            <Flex gap-2 align="center" wrap>
              <InfoCircle className="size-5 text-primary-600" />
              <span className="text-sm text-silver-700">
                Cada vez que guardas un registro con UPD, se marca como consumida y tu avance se actualiza automáticamente.
              </span>
            </Flex>
          </Flex>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCircle({ className }: { className?: string }) {
  return <HelpCircle className={className} />;
}