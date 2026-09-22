import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notificacionesApi, type Notificacion } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { intervaloRefresco } from '@/lib/refresco';
import { useAuthStore } from '@/stores/authStore';

/**
 * Los avisos de la persona con sesión, y la conexión por la que llegan al
 * instante.
 *
 * Nacen de la reapertura de cajas por solicitud: la técnica pide reabrir una
 * caja terminada, el líder tiene que enterarse **en ese momento** y la técnica
 * tiene que saber, también al momento, cuándo la caja ya está disponible. Un
 * aviso que llega en el siguiente refresco es una persona parada esperando.
 *
 * Por eso aquí sí hay una conexión abierta (eventos del servidor,
 * `EventSource`), a diferencia del resto de la aplicación, que se refresca
 * cada tanto (`refresco.ts`). Se cierra cuando la pestaña no está en primer
 * plano y se vuelve a abrir al volver, que es lo mismo que ya hacen las
 * consultas periódicas: una pestaña olvidada no mantiene despierto el
 * servidor. Si la conexión no está (un proxy que no la deja pasar, la red
 * caída), la lista se vuelve a pedir cada tanto, así que el aviso llega
 * igual, solo que no al instante.
 *
 * Cada aviso que entra por la conexión se muestra como toast, refresca la
 * campana y, si es una reapertura, refresca la caja: quien esté mirando la
 * caja terminada ve aparecer el formulario sin tocar nada.
 */

export const CLAVE_NOTIFICACIONES = ['notificaciones'] as const;

function avisar(n: Notificacion): void {
  if (n.tipo === 'REAPERTURA_APROBADA') toast.success(n.mensaje);
  else if (n.tipo === 'REAPERTURA_RECHAZADA') toast.warning(n.mensaje);
  else toast.info(n.mensaje);
}

export function useNotificaciones() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [conectado, setConectado] = useState(false);

  const consulta = useQuery({
    queryKey: CLAVE_NOTIFICACIONES,
    queryFn: () => notificacionesApi.list().then((res) => res.data),
    enabled: Boolean(user),
    refetchInterval: conectado ? undefined : intervaloRefresco(Boolean(user)),
  });

  useEffect(() => {
    if (!user || typeof EventSource === 'undefined') return;
    let fuente: EventSource | null = null;

    const abrir = () => {
      if (fuente || document.hidden) return;
      fuente = new EventSource(notificacionesApi.streamUrl, { withCredentials: true });
      fuente.addEventListener('conectado', () => {
        setConectado(true);
        // Lo que haya llegado mientras no había conexión.
        invalidateDomain(queryClient, 'notificaciones');
      });
      fuente.addEventListener('notificacion', (evento) => {
        const n = JSON.parse((evento as MessageEvent<string>).data) as Notificacion;
        avisar(n);
        invalidateDomain(queryClient, 'notificaciones');
        // Una reapertura cambia el estado de la caja que se está mirando.
        if (n.tipo !== 'SOLICITUD_REAPERTURA') invalidateDomain(queryClient, 'modulos-caja');
      });
      fuente.onerror = () => {
        // EventSource se reconecta solo; mientras tanto vuelve el sondeo.
        setConectado(false);
      };
    };
    const cerrar = () => {
      fuente?.close();
      fuente = null;
      setConectado(false);
    };
    const alCambiarVisibilidad = () => {
      if (document.hidden) cerrar();
      else abrir();
    };

    abrir();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      cerrar();
    };
  }, [user, queryClient]);

  const marcarLeidas = useMutation({
    mutationFn: (ids?: number[]) => notificacionesApi.marcarLeidas(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES });
    },
  });

  return {
    notificaciones: consulta.data?.notificaciones ?? [],
    sinLeer: consulta.data?.sin_leer ?? 0,
    cargando: consulta.isPending && Boolean(user),
    conectado,
    marcarLeidas,
  };
}
