import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { getApiErrorMessage, modulosCajaApi } from '@/lib/api';
import { formatearFecha } from '@/lib/fechas';
import { invalidateDomain } from '@/lib/queryInvalidation';
import type { ModuloCaja } from '@/types';

/**
 * Lo que ve la técnica en una caja terminada, en lugar del formulario.
 *
 * Una caja terminada se reabre a propósito, en un clic, y lo hace la propia
 * técnica: nadie tiene que autorizarla. Se muestra así, y no el formulario
 * directamente, porque reabrir tiene una consecuencia que conviene ver: al
 * reabrir se pierde el arranque de UPD en esta caja y, en cuanto la caja vuelve
 * a estar en proceso, la digitación pide el número con el que se continúa.
 *
 * El momento importa. Al reabrir se refrescan a la vez la caja y el siguiente
 * UPD: el formulario y el diálogo del UPD inicial aparecen cuando la caja ya
 * está abierta, nunca sobre la caja cerrada.
 */

interface Props {
  caja: ModuloCaja;
}

export function CajaTerminada({ caja }: Props) {
  const queryClient = useQueryClient();

  const reabrir = useMutation({
    mutationFn: () => modulosCajaApi.cambiarEstado(caja.id, 'EN PROCESO'),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Caja reabierta');
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <Card padding="p-4" className="border-primary-200 bg-primary-50">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-primary-800" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-silver-900">
            Esta caja está terminada
            {caja.fecha_finalizacion ? ` desde el ${formatearFecha(caja.fecha_finalizacion)}` : ''}.
          </p>
          <p className="text-sm text-silver-700">
            Para seguir digitando o corregir en ella, reábrela. Al reabrirla te pediremos el número del UPD con el
            que continúas, y lo que digites hoy quedará contado en la jornada de hoy.
          </p>
          <Button onClick={() => reabrir.mutate()} loading={reabrir.isPending}>
            <LockOpen className="size-4" /> Reabrir caja y seguir digitando
          </Button>
        </div>
      </div>
    </Card>
  );
}
