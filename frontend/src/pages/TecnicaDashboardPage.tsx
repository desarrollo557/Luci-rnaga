import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Package, PackageOpen, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Badge,
  Button,
  Card,
  LoadingState,
  PageHeader,
  Table,
  type Column,
} from '@/components/ui';
import { getApiErrorMessage, inventarioApi, modulosCajaApi } from '@/lib/api';
import { descargarBlob } from '@/lib/utils';
import { CAJA_EN_PROCESO, estadoDeCaja } from '@/lib/estadoCaja';
import { fechaHoyLocal } from '@/lib/fechas';
import { useAuthStore } from '@/stores/authStore';

interface TecnicaStats {
  usuario: { id: number; nombre: string; cc: string };
  resumen: {
    cajas_asignadas: number;
    fuid_creados: number;
    ultimo_upd_global: string | null;
  };
  detalle_cajas: Array<{
    id: number;
    caja_modulo: string;
    estado_caja: string | null;
    fecha_finalizacion: string | null;
    fuid_creados: number;
    ultimo_upd_caja: string | null;
    rango_inicio: string | null;
    rango_ultimo: string | null;
  }>;
}

function formatUpd(upd: string | null): string {
  if (!upd) return '—';
  return upd;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

export default function TecnicaDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const rol = user?.rol;

  // Solo permitir acceso a TECNICA
  useEffect(() => {
    if (rol && rol !== 'TECNICA') {
      toast.error('Acceso denegado: solo para técnicos');
      navigate('/produccion');
    }
  }, [navigate, rol]);

  const { data: stats, isLoading, error, refetch } = useQuery<TecnicaStats>({
    queryKey: ['modulos-caja', 'tecnica-stats'],
    queryFn: () => modulosCajaApi.getTecnicaStats().then((res) => res.data),
    enabled: rol === 'TECNICA',
  });

  /*
   * El inventario general propio: todo lo que esta persona ha digitado, en el
   * formato FUID, sin pasar por el líder. La respuesta es un archivo, así que
   * un error llega también como archivo y hay que leerlo para dar el motivo.
   */
  const descargarInventario = useMutation({
    mutationFn: () => inventarioApi.descargarMiInventario().then((res) => res.data as Blob),
    onSuccess: (blob) => {
      descargarBlob(blob, `Inventario_FUID_${(user?.nombre ?? 'mio').replace(/\s+/g, '_')}_${fechaHoyLocal()}.xlsx`);
      toast.success('Inventario descargado');
    },
    onError: async (err: unknown) => {
      const datos = axios.isAxiosError(err) ? err.response?.data : undefined;
      if (datos instanceof Blob) {
        try {
          const cuerpo = JSON.parse(await datos.text()) as { error?: string };
          if (cuerpo.error) {
            toast.error(cuerpo.error);
            return;
          }
        } catch {
          // Sigue con el mensaje genérico.
        }
      }
      toast.error(getApiErrorMessage(err));
    },
  });

  const columns: Column<NonNullable<TecnicaStats['detalle_cajas']>[0]>[] = [
    { key: 'caja_modulo', header: 'Caja' },
    {
      key: 'rango_inicio',
      header: 'Rango Inicio',
      render: (row) => <span className="font-mono text-sm">{formatUpd(row.rango_inicio)}</span>,
    },
    {
      key: 'rango_ultimo',
      header: 'Último UPD Asignado',
      render: (row) => <span className="font-mono text-sm">{formatUpd(row.rango_ultimo)}</span>,
    },
    {
      key: 'fuid_creados',
      header: 'FUIDs Creados',
      render: (row) => <span className="font-semibold">{formatNumber(row.fuid_creados)}</span>,
    },
    {
      key: 'ultimo_upd_caja',
      header: 'Último UPD Real',
      render: (row) => <span className="font-mono text-sm">{formatUpd(row.ultimo_upd_caja)}</span>,
    },
    {
      key: 'estado_caja',
      header: 'Estado',
      render: (row) => {
        const estado = estadoDeCaja({ estado: row.estado_caja, fechaFinalizacion: row.fecha_finalizacion }, fechaHoyLocal());
        return <Badge color={estado.color}>{estado.etiqueta}</Badge>;
      },
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          // Se pasa el origen para que el botón de volver de la digitación
          // devuelva al panel, en lugar de subir al acta de la caja.
          onClick={() => navigate(`/cajas/${row.id}/datos`, { state: { from: '/mi-panel' } })}
        >
          <Package className="size-4" /> Ir a Digitación
        </Button>
      ),
    },
  ];

  if (!user || rol !== 'TECNICA') return null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mi Panel Técnico"
          description="Resumen de tus cajas, UPDs y progreso"
        />
        <Card>
          <div className="flex justify-center py-10">
            <LoadingState message="Cargando tu panel técnico…" />
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mi Panel Técnico"
          description="Resumen de tus cajas, UPDs y progreso"
        />
        <Card>
          <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
            <p className="text-red-600">Error al cargar estadísticas</p>
            <Button variant="secondary" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const s = stats!;
  const cajasSinTerminar = s.detalle_cajas.filter((c) => c.estado_caja === CAJA_EN_PROCESO);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi Panel Técnico"
        description={`Bienvenido, ${user.nombre} (CC: ${user.cc}) — Resumen de tus cajas, UPDs y progreso`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => refetch()}>
              <TrendingUp className="size-4" /> Actualizar
            </Button>
            <Button onClick={() => descargarInventario.mutate()} loading={descargarInventario.isPending}>
              <Download className="size-4" /> Descargar mi inventario
            </Button>
          </div>
        }
      />

      {/*
        Lo primero: la caja que quedó a medias. Es el trabajo que hay que
        retomar, y llegar a ella por clientes, actas y cajas costaba tres o
        cuatro pasos. Sigue abierta porque nadie la ha dado por terminada:
        ninguna caja se cierra sola.
      */}
      {cajasSinTerminar.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <PackageOpen className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="font-semibold text-silver-900">
                  {cajasSinTerminar.length === 1
                    ? 'Tienes una caja sin terminar'
                    : `Tienes ${cajasSinTerminar.length} cajas sin terminar`}
                </p>
                <p className="text-sm text-silver-600">
                  Continúa donde la dejaste. La caja sigue abierta hasta que la des por terminada desde la digitación; si ya la cerraste y necesitas volver, reábrela desde la caja y te pediremos el UPD con el que continúas.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {cajasSinTerminar.map((c) => (
                  <Button
                    key={c.id}
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/cajas/${c.id}/datos`, { state: { from: '/mi-panel' } })}
                  >
                    <Package className="size-4" /> Continuar caja {c.caja_modulo}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tarjetas de resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 border-primary-200 bg-primary-50">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <Package className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-silver-600">Cajas Asignadas</p>
              <p className="text-2xl font-bold text-silver-900">{s.resumen.cajas_asignadas}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 border-green-200 bg-green-50">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
              <FileText className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-silver-600">FUIDs Creados</p>
              <p className="text-2xl font-bold text-silver-900">{formatNumber(s.resumen.fuid_creados)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <TrendingUp className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-silver-600">Último UPD Global</p>
              <p className="text-xl font-bold font-mono text-silver-900">{formatUpd(s.resumen.ultimo_upd_global)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Detalle por caja */}
      <Card>
        <div className="p-4 border-b border-silver-200">
          <h3 className="text-lg font-semibold text-silver-800 flex items-center gap-2">
            <Users className="size-5" />
            Detalle por Caja Asignada
          </h3>
        </div>
        {s.detalle_cajas.length === 0 ? (
          <div className="p-8 text-center text-silver-500">
            No tienes cajas asignadas. Contacta a tu líder para que te asigne una.
          </div>
        ) : (
          <Table
            columns={columns}
            data={s.detalle_cajas}
            rowKey={(row) => row.id}
            loading={isLoading}
            emptyMessage="No hay cajas asignadas"
          />
        )}
      </Card>

      {/* Progreso por rango */}
      {s.detalle_cajas.length > 0 && (
        <Card>
          <div className="p-4 border-b border-silver-200">
            <h3 className="text-lg font-semibold text-silver-800 flex items-center gap-2">
              <TrendingUp className="size-5" />
              Progreso de Rango UPD por Caja
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {s.detalle_cajas.map((caja) => (
              <div key={caja.id} className="rounded-lg border border-silver-200 p-4 bg-silver-50">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                  <div>
                    <p className="font-semibold text-silver-800">{caja.caja_modulo}</p>
                    <p className="text-sm text-silver-500">
                      Rango: <span className="font-mono">{formatUpd(caja.rango_inicio)}</span> →{' '}
                      <span className="font-mono">{formatUpd(caja.rango_ultimo)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-silver-600">
                    <span><strong>{caja.fuid_creados}</strong> FUIDs creados</span>
                    <span>Último real: <strong className="font-mono">{formatUpd(caja.ultimo_upd_caja)}</strong></span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/cajas/${caja.id}/datos`, { state: { from: '/mi-panel' } })}
                  >
                    <Package className="size-4" /> Continuar Digitación
                  </Button>
                  {caja.rango_inicio && caja.rango_ultimo && (
                    <span className="text-xs text-silver-500 font-mono">
                      {caja.rango_inicio} → {caja.rango_ultimo}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}