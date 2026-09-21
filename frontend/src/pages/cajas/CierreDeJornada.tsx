import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui';
import {
  getApiErrorMessage,
  modulosCajaApi,
  type JornadaDeCaja,
  type ResultadoDeJornada,
} from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { fechaHoyLocal } from '@/lib/fechas';
import { useAuthStore } from '@/stores/authStore';

/**
 * Cerrar la jornada desde dentro de la caja: la terminé, o la sigo mañana.
 *
 * El estado de la caja se sigue deduciendo solo de la digitación: quien no
 * pulse nada deja la caja terminada, porque al cambiar de jornada se cierra
 * sola. Esto añade lo que la deducción no puede saber: **la intención de quien
 * está dentro**. Desde fuera, una caja sin registros nuevos puede ser una caja
 * terminada o una que quedó a medias para mañana, y las dos se ven igual; "la
 * continúo otro día" es lo único que la mantiene abierta para la jornada
 * siguiente.
 *
 * Y sobre todo cierra el día. Antes, quien dejaba una caja a medias y la
 * retomaba a la mañana siguiente no tenía dónde quedara constancia de la
 * jornada anterior: la caja seguía abierta, su fecha se movía al día nuevo y
 * el trabajo de la víspera solo existía disperso entre los registros. Ahora la
 * jornada queda declarada, con la cifra que la persona vio al cerrarla, y el
 * historial de la caja la muestra como una línea propia.
 *
 * Dos botones y no uno con dos estados: son dos decisiones distintas y las dos
 * tienen que poder tomarse en un clic, sin abrir nada. Volver a pulsar el otro
 * el mismo día corrige lo declarado, porque uno se da cuenta.
 */

/** El nombre con el que se firman los registros: "NOMBRE (CC)". */
function firmaDe(nombre: string | undefined, cc: string | undefined): string | null {
  return nombre && cc ? `${nombre.toUpperCase()} (${cc})` : null;
}

interface Props {
  /** Identificador numérico de la caja. */
  cajaId: string | number;
}

export function CierreDeJornada({ cajaId }: Props) {
  const queryClient = useQueryClient();
  const usuario = useAuthStore((state) => state.user);
  const firma = firmaDe(usuario?.nombre, usuario?.cc);

  const jornadasQuery = useQuery({
    queryKey: ['modulos-caja', 'jornadas', Number(cajaId)],
    queryFn: () => modulosCajaApi.jornadas(cajaId).then((res) => res.data),
    enabled: Boolean(cajaId),
  });

  const hoy = fechaHoyLocal();
  const jornadaDeHoy: JornadaDeCaja | undefined = (jornadasQuery.data ?? []).find(
    (j) => j.fecha === hoy && j.colaborador === firma,
  );

  const declarar = useMutation({
    mutationFn: (resultado: ResultadoDeJornada) => modulosCajaApi.declararJornada(cajaId, resultado),
    onSuccess: (respuesta) => {
      toast.success(respuesta.data.message);
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  // Sin haber digitado nada hoy en esta caja no hay jornada que cerrar, y un
  // par de botones ahí solo serían dos cosas más que leer.
  if (!firma || !jornadaDeHoy) return null;

  const declarado = jornadaDeHoy.resultado;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {declarado && (
        <Badge color={declarado === 'TERMINADA' ? 'green' : 'amber'}>
          {declarado === 'TERMINADA' ? 'Terminada por ti hoy' : 'La continúas otro día'}
        </Badge>
      )}
      {declarado !== 'TERMINADA' && (
        <Button
          variant="secondary"
          onClick={() => declarar.mutate('TERMINADA')}
          loading={declarar.isPending}
        >
          <CheckCircle2 className="size-4" /> Terminé esta caja
        </Button>
      )}
      {declarado !== 'CONTINUA' && (
        <Button
          variant="secondary"
          onClick={() => declarar.mutate('CONTINUA')}
          loading={declarar.isPending}
        >
          <CalendarClock className="size-4" /> La continúo otro día
        </Button>
      )}
    </div>
  );
}
