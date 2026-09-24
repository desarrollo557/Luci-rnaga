import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { getApiErrorMessage, modulosCajaApi } from '@/lib/api';
import { CAJA_EN_PROCESO } from '@/lib/estadoCaja';
import { invalidateDomain } from '@/lib/queryInvalidation';

/**
 * "Terminé esta caja": la única forma en que una caja se cierra.
 *
 * Ninguna caja se cierra sola. Hubo una versión que la cerraba al pasar a otra
 * caja o al cambiar de jornada, y se retiró: quien sabe si una caja está
 * terminada es quien la tiene en las manos. Así que mientras la persona no
 * pulse esto, la caja sigue abierta, hoy y mañana, y continuarla es seguir
 * digitando sin pedir nada.
 *
 * Pulsarlo cierra la caja en el momento, atribuida a la jornada de su último
 * registro, y deja la jornada de hoy anotada con la cifra que la persona vio
 * al cerrar, para que el historial de la caja la muestre como una línea
 * propia. Hubo un segundo botón, "la continúo otro día", y también se retiró:
 * sin cierre automático no hace falta declarar que se sigue.
 *
 * Una vez terminada, la propia técnica la reabre desde la caja, sin pedirle
 * permiso a nadie (`CajaTerminada`). Por eso esto es un solo botón y no un
 * diálogo de confirmación: es una decisión de un clic y tiene vuelta atrás en
 * otro clic, así que confirmar sobraría.
 */

interface Props {
  /** Identificador numérico de la caja. */
  cajaId: string | number;
  /** Estado actual de la caja: el botón solo tiene sentido con la caja abierta. */
  estado: string | null | undefined;
}

export function CierreDeJornada({ cajaId, estado }: Props) {
  const queryClient = useQueryClient();

  const terminar = useMutation({
    mutationFn: () => modulosCajaApi.terminarCaja(cajaId),
    onSuccess: (respuesta) => {
      toast.success(respuesta.data.message);
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  if (estado !== CAJA_EN_PROCESO) return null;

  return (
    <Button variant="secondary" onClick={() => terminar.mutate()} loading={terminar.isPending}>
      <CheckCircle2 className="size-4" /> Terminé esta caja
    </Button>
  );
}
