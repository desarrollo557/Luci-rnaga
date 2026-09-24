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
 * directamente, porque una caja cerrada está terminada y volver a escribir en
 * ella es una decisión, no un descuido.
 *
 * Reabrir no toca el consecutivo de UPD: se sigue donde se dejó. Llegó a
 * borrarse el arranque para pedir uno nuevo, y se quitó, porque muchas
 * reaperturas son para corregir un registro y no para seguir digitando.
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
            Para seguir digitando o corregir en ella, reábrela. Sigues con tu mismo consecutivo de UPD, y lo que
            digites hoy queda contado en la jornada de hoy.
          </p>
          <Button onClick={() => reabrir.mutate()} loading={reabrir.isPending}>
            <LockOpen className="size-4" /> Reabrir caja y seguir digitando
          </Button>
        </div>
      </div>
    </Card>
  );
}
