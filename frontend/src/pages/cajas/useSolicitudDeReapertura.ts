import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorCode, getApiErrorMessage, solicitudesReaperturaApi } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';

/**
 * Pedir al líder que reabra una caja terminada, y saber si ya se pidió.
 *
 * Lo usan la pantalla de digitación, que muestra la petición en lugar del
 * formulario cuando la caja está terminada, y la vista de la caja, que la
 * ofrece como botón. Los dos tienen que decir lo mismo: si hay una solicitud
 * pendiente, se está esperando al líder; si no, se puede pedir.
 */
export function useSolicitudDeReapertura(cajaId: number | string | undefined, activo: boolean) {
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ['solicitudes-reapertura', 'caja', String(cajaId ?? '')],
    queryFn: () => solicitudesReaperturaApi.list({ caja_id: cajaId as number | string }).then((res) => res.data),
    enabled: activo && cajaId !== undefined && cajaId !== '',
  });

  const solicitudes = consulta.data ?? [];
  const pendiente = solicitudes.find((s) => s.estado === 'PENDIENTE');
  // Las pendientes van primero; entre las demás, la más reciente.
  const ultima = solicitudes.find((s) => s.estado !== 'PENDIENTE');

  const solicitar = useMutation({
    mutationFn: () => solicitudesReaperturaApi.solicitar(cajaId as number | string),
    onSuccess: (res) => {
      toast.success(res.data.message);
      invalidateDomain(queryClient, 'notificaciones');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
      // La caja se reabrió mientras tanto: que la pantalla lo vea.
      if (getApiErrorCode(error) === 'CAJA_YA_ABIERTA') invalidateDomain(queryClient, 'modulos-caja');
    },
  });

  return { pendiente, ultima, cargando: consulta.isPending && activo, solicitar };
}
