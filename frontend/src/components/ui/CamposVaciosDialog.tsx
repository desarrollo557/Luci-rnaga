import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { VALOR_VACIO, type CampoVacio } from '@/lib/camposVacios';

/**
 * Cuántos campos se nombran antes de resumir el resto. Un registro FUID puede
 * llevar veinte campos en blanco y listarlos todos convierte el aviso en un
 * muro de texto que nadie lee.
 */
const MAX_LISTADOS = 8;

export interface CamposVaciosDialogProps {
  /** Campos detectados; `null` o vacío mantiene el diálogo cerrado. */
  campos: CampoVacio[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Aviso previo al guardado cuando quedaron campos de texto en blanco.
 *
 * Confirmar no guarda: rellena los campos con `N/A` y devuelve el formulario
 * para que la persona vea exactamente qué se va a registrar antes de guardar.
 */
export function CamposVaciosDialog({ campos, onConfirm, onCancel }: CamposVaciosDialogProps) {
  const lista = campos ?? [];
  const visibles = lista.slice(0, MAX_LISTADOS);
  const restantes = lista.length - visibles.length;
  const plural = lista.length === 1 ? 'campo' : 'campos';

  return (
    <Modal
      open={lista.length > 0}
      onClose={onCancel}
      title="Hay campos sin diligenciar"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Volver a revisar
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Sí, continuar
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="min-w-0 space-y-3 text-sm text-silver-600">
          <p>
            Vas a guardar {lista.length} {plural} sin información. Se registrarán como{' '}
            <span className="font-semibold text-silver-800">{VALOR_VACIO}</span>.
          </p>

          <ul className="flex flex-wrap gap-1.5">
            {visibles.map(({ campo, label }) => (
              <li
                key={campo}
                className="rounded-md bg-silver-100 px-2 py-1 text-xs font-medium text-silver-700"
              >
                {label}
              </li>
            ))}
            {restantes > 0 && (
              <li className="rounded-md px-2 py-1 text-xs text-silver-500">
                y {restantes} más
              </li>
            )}
          </ul>

          <p className="text-xs text-silver-500">
            Al continuar no se guarda todavía: el formulario queda abierto con los campos
            completados en {VALOR_VACIO} para que los revises y pulses Guardar.
          </p>
        </div>
      </div>
    </Modal>
  );
}
