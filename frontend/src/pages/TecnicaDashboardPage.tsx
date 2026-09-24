import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Package, PackageOpen, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Button,
  Card,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { getApiErrorMessage, inventarioApi, modulosCajaApi } from '@/lib/api';
import { descargarBlob } from '@/lib/utils';
import { CAJA_EN_PROCESO } from '@/lib/estadoCaja';
import { fechaHoyLocal } from '@/lib/fechas';
import { useAuthStore } from '@/stores/authStore';
import { ArbolDeCajas } from './tecnica/ArbolDeCajas';
import { MiSeguimiento } from './tecnica/MiSeguimiento';

interface TecnicaStats {
  usuario: { id: number; nombre: string; cc: string };
  resumen: {
    cajas_asignadas: number;
    fuid_creados: number;
    fuid_hoy: number;
    ultimo_upd_global: string | null;
  };
  detalle_cajas: Array<{
    id: number;
    caja_modulo: string;
    codigo_cliente: string | null;
    entidad_cliente: string | null;
    acta: string | null;
    estado_caja: string | null;
    fecha_finalizacion: string | null;
    fuid_creados: number;
    fuid_hoy: number;
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

      <MiSeguimiento />

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

      {/*
        Lo producido, en una línea. Antes eran tres tarjetas con un icono cada
        una que ocupaban media pantalla para decir tres números; y faltaba el
        único que se mira todo el día, que es cuánto llevo hoy.
      */}
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-silver-600">Registros de hoy</p>
            <p className="text-2xl font-bold text-primary-700">{formatNumber(s.resumen.fuid_hoy)}</p>
          </div>
          <div>
            <p className="text-sm text-silver-600">Registros en total</p>
            <p className="text-2xl font-bold text-silver-900">{formatNumber(s.resumen.fuid_creados)}</p>
          </div>
          <div>
            <p className="text-sm text-silver-600">Cajas asignadas</p>
            <p className="text-2xl font-bold text-silver-900">
              {s.resumen.cajas_asignadas}
              {cajasSinTerminar.length > 0 && (
                <span className="ml-2 text-sm font-medium text-amber-700">
                  {cajasSinTerminar.length} sin terminar
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-silver-600">Último UPD</p>
            <p className="font-mono text-xl font-bold text-silver-900">{formatUpd(s.resumen.ultimo_upd_global)}</p>
          </div>
        </div>
      </Card>

      {/*
        Las cajas, en el orden en que existen: cliente, acta, caja. Cada nivel
        dice cuántas cajas tiene y cuántas están sin terminar, que es lo que
        hace falta para decidir dónde entrar; el resto se abre solo si se pide.
      */}
      <Card>
        <div className="flex items-center gap-2 border-b border-silver-200 p-4">
          <Users className="size-5 text-silver-600" />
          <div>
            <h3 className="text-lg font-semibold text-silver-800">Mis cajas</h3>
            <p className="text-sm text-silver-500">
              Cuánto llevas digitado en cada cliente, en cada acta y en cada caja
            </p>
          </div>
        </div>
        <ArbolDeCajas cajas={s.detalle_cajas} />
      </Card>

    </div>
  );
}