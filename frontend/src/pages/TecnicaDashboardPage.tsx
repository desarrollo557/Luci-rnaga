import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Package, PackageOpen, TrendingUp, Users } from 'lucide-react';
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

  /*
   * Las columnas, en el orden en que se lee una caja: de quién es, con qué acta
   * entró, cuál es, cuánto lleva uno en ella y cómo está.
   *
   * El cliente y el acta faltaban, y sin ellos el panel era una lista de
   * números de caja: "051C000516" no dice a quién hay que entregarla.
   *
   * De los tres UPD que había —arranque asignado, último asignado y último
   * real— se dejan dos en una sola columna, "desde → último". El asignado y el
   * real son el mismo número en cuanto se digita, así que enseñar los dos
   * ocupaba una columna para repetir un dato.
   */
  const columns: Column<NonNullable<TecnicaStats['detalle_cajas']>[0]>[] = [
    {
      key: 'entidad_cliente',
      header: 'Cliente',
      render: (row) =>
        row.entidad_cliente ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-silver-800">{row.entidad_cliente}</p>
            {row.codigo_cliente && <p className="font-mono text-xs text-silver-500">{row.codigo_cliente}</p>}
          </div>
        ) : (
          <span className="text-silver-400">—</span>
        ),
    },
    {
      key: 'acta',
      header: 'Acta',
      render: (row) =>
        row.acta ? <span className="font-mono text-sm">{row.acta}</span> : <span className="text-silver-400">—</span>,
    },
    {
      key: 'caja_modulo',
      header: 'Caja',
      render: (row) => <span className="font-mono text-sm font-medium">{row.caja_modulo}</span>,
    },
    {
      key: 'fuid_creados',
      header: 'Mis registros',
      render: (row) => <span className="font-semibold">{formatNumber(row.fuid_creados)}</span>,
    },
    {
      key: 'rango_inicio',
      header: 'UPD (desde → último)',
      render: (row) => (
        <span className="font-mono text-sm">
          {formatUpd(row.rango_inicio)} <span className="text-silver-400">→</span>{' '}
          {formatUpd(row.ultimo_upd_caja ?? row.rango_ultimo)}
        </span>
      ),
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

      {/*
        El seguimiento va al final: se saca al cerrar el día o cuando lo pide
        el líder, y lo que se viene a hacer a esta pantalla es retomar una caja.
      */}
      <MiSeguimiento />
    </div>
  );
}