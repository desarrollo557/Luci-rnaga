import { Clock, Lock, Send } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { formatearFecha, hace } from '@/lib/fechas';
import type { ModuloCaja } from '@/types';
import { useSolicitudDeReapertura } from './useSolicitudDeReapertura';

/**
 * Lo que ve la técnica en una caja terminada, en lugar del formulario.
 *
 * Una caja terminada no se le reabre digitando en ella ni cambiando el
 * estado: hace falta la autorización del líder. Aquí se le dice y se le da
 * la forma de pedirla, en un clic. La solicitud le llega al líder al instante
 * y, cuando la autoriza, el aviso vuelve por la misma vía: la caja se refresca
 * sola y el formulario reaparece sin que la técnica toque nada.
 */

/** El nombre sin la cédula que lleva pegada en la firma. */
const soloNombre = (firma: string | null) => (firma ? firma.replace(/\s*\([^)]*\)\s*$/, '').trim() || firma : '');

interface Props {
  caja: ModuloCaja;
}

export function CajaTerminada({ caja }: Props) {
  const { pendiente, ultima, solicitar } = useSolicitudDeReapertura(caja.id, true);
  const rechazada = !pendiente && ultima?.estado === 'RECHAZADA' ? ultima : undefined;

  return (
    <Card padding="p-4" className="border-primary-200 bg-primary-50">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-primary-800" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-silver-900">
            Esta caja está terminada
            {caja.fecha_finalizacion ? ` desde el ${formatearFecha(caja.fecha_finalizacion)}` : ''}.
          </p>
          {pendiente ? (
            <>
              <p className="text-sm text-silver-700">
                Ya pediste reabrirla ({hace(pendiente.creada_en)}). En cuanto el líder la autorice, esta pantalla se
                desbloquea sola y te llegará el aviso a tus notificaciones.
              </p>
              <Badge color="amber">
                <Clock className="mr-1 inline size-3.5" /> Esperando al líder
              </Badge>
            </>
          ) : (
            <>
              <p className="text-sm text-silver-700">
                Para volver a digitar o corregir en ella necesitas la autorización del líder. Pídela aquí: le llega al
                momento y te avisaremos en cuanto la caja esté disponible.
              </p>
              {rechazada && (
                <p className="text-sm text-red-700">
                  La última solicitud ({hace(rechazada.resuelta_en ?? rechazada.creada_en)}) no fue autorizada
                  {rechazada.resuelta_por ? ` por ${soloNombre(rechazada.resuelta_por)}` : ''}. Puedes volver a pedirla.
                </p>
              )}
              <Button onClick={() => solicitar.mutate()} loading={solicitar.isPending}>
                <Send className="size-4" /> Pedir autorización al líder
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/** El mismo pedido, como botón, para la vista de la caja. */
export function BotonPedirReapertura({ cajaId }: { cajaId: number }) {
  const { pendiente, solicitar } = useSolicitudDeReapertura(cajaId, true);
  if (pendiente) {
    return (
      <Badge color="amber">
        <Clock className="mr-1 inline size-3.5" /> Reapertura pedida al líder
      </Badge>
    );
  }
  return (
    <Button variant="secondary" onClick={() => solicitar.mutate()} loading={solicitar.isPending}>
      <Send className="size-4" /> Pedir reapertura al líder
    </Button>
  );
}
