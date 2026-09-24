import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, TrendingUp, Users } from 'lucide-react';
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
import { fechaHoyLocal, formatearFecha } from '@/lib/fechas';
import { useAuthStore } from '@/stores/authStore';
import { ArbolDeCajas } from './tecnica/ArbolDeCajas';
import { DiasTrabajados } from './tecnica/DiasTrabajados';
import { MiSeguimiento } from './tecnica/MiSeguimiento';

interface TecnicaStats {
  usuario: { id: number; nombre: string; cc: string };
  resumen: {
    cajas_asignadas: number;
    fuid_creados: number;
    ultimo_upd_global: string | null;
  };
  produccion_por_dia: Array<{ dia: string; caja: string; registros: number }>;
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

  /** Día del que se está mirando lo producido; vacío es el acumulado. */
  const [diaElegido, setDiaElegido] = useState('');

  const { data: stats, isLoading, error, refetch } = useQuery<TecnicaStats>({
    queryKey: ['modulos-caja', 'tecnica-stats'],
    queryFn: () => modulosCajaApi.getTecnicaStats().then((res) => res.data),
    enabled: rol === 'TECNICA',
  });


  /*
   * Los días con trabajo, del más reciente al más antiguo. El servidor manda el
   * detalle por día y caja; aquí se suma por día, que es lo que se elige.
   */
  const diasTrabajados = useMemo(() => {
    const porDia = new Map<string, number>();
    for (const fila of stats?.produccion_por_dia ?? []) {
      porDia.set(fila.dia, (porDia.get(fila.dia) ?? 0) + fila.registros);
    }
    return [...porDia.entries()]
      .map(([dia, registros]) => ({ dia, registros }))
      .sort((uno, otro) => otro.dia.localeCompare(uno.dia));
  }, [stats?.produccion_por_dia]);

  /*
   * Las cajas que ve el árbol. Sin día elegido son todas, con su total. Con un
   * día elegido, cada caja lleva lo que se digitó en ella **ese día** y las que
   * no se tocaron se quedan fuera: el árbol pasa a contestar "qué hice ese día"
   * sin cambiar de forma.
   */
  const cajasDelArbol = useMemo(() => {
    const detalleCajas = stats?.detalle_cajas ?? [];
    if (!diaElegido) return detalleCajas;
    const delDia = new Map<string, number>();
    for (const fila of stats?.produccion_por_dia ?? []) {
      if (fila.dia === diaElegido) delDia.set(fila.caja, fila.registros);
    }
    return detalleCajas
      .filter((caja) => delDia.has(caja.caja_modulo))
      .map((caja) => ({ ...caja, fuid_creados: delDia.get(caja.caja_modulo) ?? 0 }));
  }, [stats?.detalle_cajas, stats?.produccion_por_dia, diaElegido]);

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


  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi Panel Técnico"
        description={`${user.nombre} · ${formatNumber(s.resumen.fuid_creados)} registros en ${
          s.resumen.cajas_asignadas
        } cajas asignadas · último ${formatUpd(s.resumen.ultimo_upd_global)}`}
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
        Los días con trabajo. Es el cuarto eje del panel —día, cliente, acta,
        caja— y el que enlaza con los otros tres: al elegir un día, el árbol de
        abajo enseña lo de ese día y nada más.
      */}
      <Card className="p-4">
        <DiasTrabajados dias={diasTrabajados} elegido={diaElegido} onElegir={setDiaElegido} />
      </Card>

      {/*
        Las cajas, en el orden en que existen: cliente, acta, caja. Cada nivel
        dice lo producido y cuántas cajas están sin terminar, y esas ramas vienen
        abiertas: es a lo que se vuelve al entrar.
      */}
      <Card>
        <div className="flex items-center gap-2 border-b border-silver-200 p-4">
          <Users className="size-5 text-silver-600" />
          <div>
            <h3 className="text-lg font-semibold text-silver-800">Mis cajas</h3>
            <p className="text-sm text-silver-500">
              {diaElegido
                ? `Lo que digitaste el ${formatearFecha(diaElegido)}, por cliente, acta y caja`
                : 'Cuánto llevas digitado en cada cliente, en cada acta y en cada caja'}
            </p>
          </div>
        </div>
        {cajasDelArbol.length === 0 ? (
          <p className="p-4 text-sm text-silver-500">
            Ese día no digitaste en ninguna caja.
          </p>
        ) : (
          <ArbolDeCajas cajas={cajasDelArbol} />
        )}
      </Card>
    </div>
  );
}