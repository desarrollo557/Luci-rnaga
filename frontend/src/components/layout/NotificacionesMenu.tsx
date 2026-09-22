import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Inbox, LockOpen, MailQuestion, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui';
import {
  getApiErrorMessage,
  solicitudesReaperturaApi,
  type Notificacion,
  type TipoDeNotificacion,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { hace } from '@/lib/fechas';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { useAuthStore } from '@/stores/authStore';
import { tieneAlgunRol } from '@/types';
import { useNotificaciones } from './useNotificaciones';

/**
 * La campana: los avisos de la persona y, para el líder, las solicitudes de
 * reapertura que esperan su respuesta.
 *
 * Para el líder lo primero son las solicitudes pendientes, con los dos
 * botones a la vista: reabrir o rechazar es un clic desde aquí, sin ir a la
 * caja. Debajo van los avisos, los leídos y los que no. Para la técnica son
 * solo avisos, y el de "la caja ya está disponible" lleva a la caja.
 *
 * Abrir la campana marca los avisos como leídos. Lo que sigue pidiendo algo,
 * las solicitudes pendientes, se queda contando en la insignia hasta que se
 * atienda: leerlo no es atenderlo.
 */

/** El nombre sin la cédula que lleva pegada en la firma. */
const soloNombre = (firma: string) => firma.replace(/\s*\([^)]*\)\s*$/, '').trim() || firma;

function Icono({ tipo }: { tipo: TipoDeNotificacion }) {
  if (tipo === 'REAPERTURA_APROBADA') return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />;
  if (tipo === 'REAPERTURA_RECHAZADA') return <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />;
  return <MailQuestion className="mt-0.5 size-5 shrink-0 text-primary-700" />;
}

export function NotificacionesMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const atiende = tieneAlgunRol(user, ['LIDER', 'ADMIN']);
  const [abierto, setAbierto] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const { notificaciones, sinLeer, cargando, marcarLeidas } = useNotificaciones();

  const pendientesQuery = useQuery({
    queryKey: ['solicitudes-reapertura', 'pendientes'],
    queryFn: () => solicitudesReaperturaApi.list({ estado: 'PENDIENTE' }).then((res) => res.data),
    enabled: atiende,
  });
  const pendientes = pendientesQuery.data ?? [];
  const idsPendientes = new Set(pendientes.map((s) => s.id));

  const resolver = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'aprobar' | 'rechazar' }) =>
      decision === 'aprobar' ? solicitudesReaperturaApi.aprobar(id) : solicitudesReaperturaApi.rechazar(id),
    onSuccess: (res) => {
      toast.success(res.data.message);
      invalidateDomain(queryClient, 'notificaciones');
      invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
      // Si otra persona ya la atendió, la lista tiene que dejar de ofrecerla.
      invalidateDomain(queryClient, 'notificaciones');
    },
  });

  useEffect(() => {
    if (!abierto) return;
    const alClic = (evento: MouseEvent) => {
      if (!panel.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const alTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [abierto]);

  if (!user) return null;

  // Las solicitudes pendientes se muestran arriba con sus botones; su aviso no
  // se repite abajo.
  const avisos = notificaciones.filter(
    (n) => !(atiende && n.tipo === 'SOLICITUD_REAPERTURA' && n.solicitud_id !== null && idsPendientes.has(n.solicitud_id)),
  );
  const avisosSinLeer = avisos.filter((n) => !n.leida_en).length;
  const total = avisosSinLeer + pendientes.length;

  const alternar = () => {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && sinLeer > 0) marcarLeidas.mutate(undefined);
  };

  const irALaCaja = (n: Notificacion) => {
    if (n.caja_id === null) return;
    setAbierto(false);
    navigate(`/cajas/${n.caja_id}/datos`);
  };

  const resolviendo = (id: number, decision: 'aprobar' | 'rechazar') =>
    resolver.isPending && resolver.variables?.id === id && resolver.variables.decision === decision;

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={alternar}
        aria-label={total > 0 ? `Notificaciones, ${total} sin atender` : 'Notificaciones'}
        aria-expanded={abierto}
        className="relative inline-flex items-center justify-center rounded-lg p-2 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700"
      >
        <Bell className="size-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 z-50 mt-2 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-silver-200 bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-silver-200 px-4 py-3">
            <p className="text-sm font-semibold text-silver-900">Notificaciones</p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar notificaciones"
              className="rounded-lg p-1 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {atiende && pendientes.length > 0 && (
              <section className="border-b border-silver-200 bg-primary-50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-800">
                  Esperan tu autorización
                </p>
                <ul className="space-y-3">
                  {pendientes.map((s) => (
                    <li key={s.id} className="space-y-2">
                      <p className="text-sm text-silver-800">
                        <span className="font-medium">{soloNombre(s.solicitante)}</span> pide reabrir la caja{' '}
                        <span className="font-mono">{s.caja_modulo}</span>
                      </p>
                      <p className="text-xs text-silver-500">{hace(s.creada_en)}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => resolver.mutate({ id: s.id, decision: 'aprobar' })}
                          loading={resolviendo(s.id, 'aprobar')}
                          disabled={resolver.isPending}
                        >
                          <LockOpen className="size-4" /> Reabrir
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => resolver.mutate({ id: s.id, decision: 'rechazar' })}
                          loading={resolviendo(s.id, 'rechazar')}
                          disabled={resolver.isPending}
                        >
                          <X className="size-4" /> Rechazar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {avisos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-silver-500">
                <Inbox className="size-6 text-silver-400" />
                {cargando ? 'Consultando…' : 'No tienes avisos'}
              </div>
            ) : (
              <ul className="divide-y divide-silver-100">
                {avisos.map((n) => (
                  <li key={n.id} className={cn('px-4 py-3', !n.leida_en && 'bg-silver-50')}>
                    <div className="flex items-start gap-3">
                      <Icono tipo={n.tipo} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-silver-800">{n.mensaje}</p>
                        <p className="mt-0.5 text-xs text-silver-500">{hace(n.creada_en)}</p>
                        {n.tipo === 'REAPERTURA_APROBADA' && n.caja_id !== null && (
                          <Button size="sm" variant="secondary" className="mt-2" onClick={() => irALaCaja(n)}>
                            Ir a la caja
                          </Button>
                        )}
                        {atiende && n.tipo === 'SOLICITUD_REAPERTURA' && (
                          <Badge color="gray" className="mt-2">
                            Atendida
                          </Badge>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
