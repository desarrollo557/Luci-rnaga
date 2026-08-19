import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  /** Habilita verificación por cédula: el usuario debe escribir su cédula para confirmar. */
  requireCc?: boolean;
  /** Cédula del usuario logueado (obligatoria si requireCc=true). */
  userCc?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  loading = false,
  requireCc = false,
  userCc = '',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [cc, setCc] = useState('');

  // Al abrir o cerrar el diálogo se limpia el campo para que cada intento
  // parta de cero y nunca quede una cédula previa "validada".
  useEffect(() => {
    if (!open) setCc('');
  }, [open]);

  const expectedCc = userCc.trim();
  const ccMatches = !requireCc || (expectedCc !== '' && cc.trim() === expectedCc);
  const ccTouched = cc.trim() !== '';
  const ccError = ccTouched && !ccMatches ? 'La cédula no coincide. Verifícala e inténtalo de nuevo.' : undefined;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={!ccMatches}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm text-silver-600">{description}</p>}
      {requireCc && (
        <div className="mt-4">
          <Input
            label="Escriba su cédula para confirmar"
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="Su número de cédula"
            error={ccError}
            hint={ccMatches ? undefined : 'La cédula debe coincidir con la del usuario en sesión.'}
          />
        </div>
      )}
    </Modal>
  );
}