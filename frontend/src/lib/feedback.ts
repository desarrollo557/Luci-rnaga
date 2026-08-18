import { toast } from 'sonner';
import { getApiErrorMessage } from './api';

export interface ToastApiErrorOptions {
  /** Mensaje adicional contextual (ej: "No se pudieron cargar los usuarios"). */
  context?: string;
  /** Oculta la línea de soporte ("Estamos trabajando en ello..."). */
  noSupport?: boolean;
}

const SUPPORT_MESSAGE = 'Estamos trabajando en ello. Si el problema persiste, comunícate con el área de sistemas.';

/**
 * Muestra un toast de error con el mensaje específico del backend y una línea
 * de soporte. Uso centralizado para mutaciones y fallos puntuales.
 */
export function toastApiError(error: unknown, opts: ToastApiErrorOptions = {}): void {
  const specific = getApiErrorMessage(error);
  const message = opts.context ? `${opts.context} ${specific}` : specific;
  toast.error(message, { description: opts.noSupport ? undefined : SUPPORT_MESSAGE });
}
