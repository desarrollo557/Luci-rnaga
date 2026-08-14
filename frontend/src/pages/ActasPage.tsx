import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  type Column,
} from '@/components/ui';
import { getApiErrorMessage, modulosCajaApi, modulosClienteApi, type ModuloCajaInput } from '@/lib/api';
import { validCaja } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';
import type { ModuloCaja } from '@/types';

const ESTADOS_CAJA = ['EN PROCESO', 'FINALIZADO'] as const;

interface CajaForm {
  caja_modulo: string;
  entidad_remitente_caja: string;
  entidad_productora_caja: string;
  unidad_administrativa_caja: string;
  oficina_productora_caja: string;
  objeto_caja: string;
  acta_trans_caja: string;
  fecha_trans_caja: string;
  estado_caja: string;
}

const EMPTY_CAJA_FORM: CajaForm = {
  caja_modulo: '',
  entidad_remitente_caja: '',
  entidad_productora_caja: '',
  unidad_administrativa_caja: '',
  oficina_productora_caja: '',
  objeto_caja: '',
  acta_trans_caja: '',
  fecha_trans_caja: '',
  estado_caja: 'EN PROCESO',
};

function EstadoBadge({ estado }: { estado: string }) {
  const color = estado === 'FINALIZADO' ? 'green' : estado === 'EN PROCESO' ? 'amber' : 'gray';
  return <Badge color={color}>{estado || '—'}</Badge>;
}

function FuidCount({ cajaModulo }: { cajaModulo: string }) {
  const fuidQuery = useQuery({
    queryKey: ['modulos-caja', 'fuid-count', cajaModulo],
    queryFn: () => modulosCajaApi.countFuidDatosReal(cajaModulo).then((res) => res.data),
  });

  if (fuidQuery.isPending) return <Spinner className="size-4 text-primary-600" />;
  return <span>{fuidQuery.data?.total ?? 0}</span>;
}

export default function ActasPage() {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const isManager = user?.rol === 'ADMIN' || user?.rol === 'LIDER';

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCaja, setEditingCaja] = useState<ModuloCaja | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuloCaja | null>(null);
  const [cajaForm, setCajaForm] = useState<CajaForm>(() => ({ ...EMPTY_CAJA_FORM }));
  const [cajaErrors, setCajaErrors] = useState<Partial<Record<keyof CajaForm, string>>>({});

  const cajasQuery = useQuery({
    queryKey: ['modulos-caja', 'list', id],
    queryFn: () => modulosCajaApi.list(id as string).then((res) => res.data),
    enabled: Boolean(id),
  });

  const moduloQuery = useQuery({
    queryKey: ['modulos-cliente', 'get', id],
    queryFn: () => modulosClienteApi.get(id as string).then((res) => res.data),
    enabled: Boolean(id),
  });

  const codigoModulo = moduloQuery.data?.codigo ?? '';
  const actaModulo = moduloQuery.data?.acta_transferencia_modulo ?? '';
  // Placeholder de caja: prefijo del código del módulo + "C" + 6 ceros (ej. 015C000000).
  const cajaPlaceholder = /^\d{1,3}$/.test(codigoModulo)
    ? `${codigoModulo.padStart(3, '0')}C000000`
    : '000C000000';

  const createMutation = useMutation({
    mutationFn: (data: ModuloCajaInput) => modulosCajaApi.create(data),
    onSuccess: () => {
      toast.success('Caja creada correctamente');
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'list', id] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ cajaId, data }: { cajaId: number; data: Omit<ModuloCajaInput, 'id_modulo_caja'> }) =>
      modulosCajaApi.update(cajaId, data),
    onSuccess: () => {
      toast.success('Caja actualizada correctamente');
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'list', id] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (cajaId: number) => modulosCajaApi.remove(cajaId),
    onSuccess: () => {
      toast.success('Caja eliminada');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'list', id] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof CajaForm, string>> = {};

    if (!cajaForm.caja_modulo.trim()) {
      nextErrors.caja_modulo = 'El número de caja es requerido';
    } else {
      const cajaError = validCaja(cajaForm.caja_modulo);
      if (cajaError) nextErrors.caja_modulo = cajaError;
    }
    if (!cajaForm.entidad_remitente_caja.trim())
      nextErrors.entidad_remitente_caja = 'La entidad remitente es requerida';
    if (!cajaForm.entidad_productora_caja.trim())
      nextErrors.entidad_productora_caja = 'La entidad productora es requerida';
    if (!cajaForm.unidad_administrativa_caja.trim())
      nextErrors.unidad_administrativa_caja = 'La unidad administrativa es requerida';
    if (!cajaForm.oficina_productora_caja.trim())
      nextErrors.oficina_productora_caja = 'La oficina productora es requerida';
    if (!cajaForm.objeto_caja.trim()) nextErrors.objeto_caja = 'El objeto es requerido';
    if (!cajaForm.acta_trans_caja.trim())
      nextErrors.acta_trans_caja = 'El acta de transferencia es requerida';

    setCajaErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const baseData = {
      caja_modulo: cajaForm.caja_modulo.trim(),
      entidad_remitente_caja: cajaForm.entidad_remitente_caja.trim(),
      entidad_productora_caja: cajaForm.entidad_productora_caja.trim(),
      unidad_administrativa_caja: cajaForm.unidad_administrativa_caja.trim(),
      oficina_productora_caja: cajaForm.oficina_productora_caja.trim(),
      objeto_caja: cajaForm.objeto_caja.trim(),
      acta_trans_caja: cajaForm.acta_trans_caja.trim(),
      fecha_trans_caja: cajaForm.fecha_trans_caja || null,
      estado_caja: cajaForm.estado_caja,
    };

    if (editingCaja) {
      updateMutation.mutate({ cajaId: editingCaja.id, data: baseData });
      return;
    }

    if (!id) {
      toast.error('Falta el identificador del módulo cliente');
      return;
    }

    createMutation.mutate({ ...baseData, id_modulo_caja: Number(id) });
  };

  const openNuevaCaja = () => {
    setEditingCaja(null);
    const codigoModulo = moduloQuery.data?.codigo ?? '';
    const actaModulo = moduloQuery.data?.acta_transferencia_modulo ?? '';
    // Entidades de referencia: se toman de una caja existente del módulo, así la
    // nueva caja hereda los mismos valores que muestra la tabla de actas.
    const cajaReferencia = cajasQuery.data?.find(
      (c) => c.entidad_remitente_caja?.trim() || c.entidad_productora_caja?.trim(),
    );
    // Prefijo de caja: los 3 primeros dígitos del código del módulo + "C" (ej. 015C).
    const prefijoCaja = /^\d{1,3}$/.test(codigoModulo) ? `${codigoModulo.padStart(3, '0')}C` : '';
    setCajaForm({
      ...EMPTY_CAJA_FORM,
      caja_modulo: prefijoCaja,
      acta_trans_caja: actaModulo,
      entidad_remitente_caja:
        cajaReferencia?.entidad_remitente_caja ?? moduloQuery.data?.entidad_remitente ?? '',
      entidad_productora_caja: cajaReferencia?.entidad_productora_caja ?? '',
    });
    setCajaErrors({});
    setModalOpen(true);
  };

  const handleEditarCaja = (caja: ModuloCaja) => {
    setEditingCaja(caja);
    setCajaForm({
      caja_modulo: caja.caja_modulo,
      entidad_remitente_caja: caja.entidad_remitente_caja,
      entidad_productora_caja: caja.entidad_productora_caja,
      unidad_administrativa_caja: caja.unidad_administrativa_caja,
      oficina_productora_caja: caja.oficina_productora_caja,
      objeto_caja: caja.objeto_caja,
      acta_trans_caja: caja.acta_trans_caja,
      fecha_trans_caja: caja.fecha_trans_caja?.slice(0, 10) ?? '',
      estado_caja: caja.estado_caja,
    });
    setCajaErrors({});
    setModalOpen(true);
  };

  const columns: Column<ModuloCaja>[] = [
    { key: 'caja_modulo', header: 'Caja' },
    { key: 'entidad_remitente_caja', header: 'Entidad Remitente' },
    { key: 'entidad_productora_caja', header: 'Entidad Productora' },
    { key: 'acta_trans_caja', header: 'Acta' },
    {
      key: 'fecha_trans_caja',
      header: 'Fecha Trans.',
      render: (caja) => (caja.fecha_trans_caja ? caja.fecha_trans_caja.slice(0, 10) : '—'),
    },
    {
      key: 'fuid',
      header: 'N° FUID',
      render: (caja) => <FuidCount cajaModulo={caja.caja_modulo} />,
    },
    {
      key: 'estado_caja',
      header: 'Estado',
      render: (caja) => <EstadoBadge estado={caja.estado_caja} />,
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (caja) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/clientes/${id}/actas/${caja.id}/cajas`}>
            <Button variant="secondary" size="sm">
              <FileText className="size-4" /> Ver Caja
            </Button>
          </Link>
          {isManager && (
            <>
              <Button variant="secondary" size="sm" onClick={() => handleEditarCaja(caja)}>
                <Pencil className="size-4" /> Editar
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteTarget(caja)}>
                <Trash2 className="size-4" /> Eliminar
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actas"
        description="Clientes / Actas — Cajas del módulo cliente"
        actions={
          isManager ? (
            <Button onClick={openNuevaCaja} disabled={!id}>
              <Plus className="size-4" /> Nueva Caja
            </Button>
          ) : undefined
        }
      />

      <Table
        columns={columns}
        data={cajasQuery.data ?? []}
        rowKey={(caja) => caja.id}
        loading={cajasQuery.isPending}
        emptyMessage="No hay cajas para este módulo cliente"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCaja ? 'Editar Caja' : 'Nueva Caja'}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="caja-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="caja-form" onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <Input
            label="Caja (000C000000)"
            value={cajaForm.caja_modulo}
            onChange={(event) => setCajaForm({ ...cajaForm, caja_modulo: event.target.value })}
            error={cajaErrors.caja_modulo}
            placeholder={cajaPlaceholder}
          />
          <Input
            label="Entidad Remitente"
            value={cajaForm.entidad_remitente_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, entidad_remitente_caja: event.target.value })}
            error={cajaErrors.entidad_remitente_caja}
          />
          <Input
            label="Entidad Productora"
            value={cajaForm.entidad_productora_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, entidad_productora_caja: event.target.value })}
            error={cajaErrors.entidad_productora_caja}
          />
          <Input
            label="Unidad Administrativa"
            value={cajaForm.unidad_administrativa_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, unidad_administrativa_caja: event.target.value })}
            error={cajaErrors.unidad_administrativa_caja}
          />
          <Input
            label="Oficina Productora"
            value={cajaForm.oficina_productora_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, oficina_productora_caja: event.target.value })}
            error={cajaErrors.oficina_productora_caja}
          />
          <Input
            label="Objeto"
            value={cajaForm.objeto_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, objeto_caja: event.target.value })}
            error={cajaErrors.objeto_caja}
          />
          <Input
            label="Acta de Transferencia"
            value={cajaForm.acta_trans_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, acta_trans_caja: event.target.value })}
            error={cajaErrors.acta_trans_caja}
            placeholder={actaModulo || 'Ingrese el número de acta'}
          />
          <DatePicker
            label="Fecha de Transferencia"
            value={cajaForm.fecha_trans_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, fecha_trans_caja: value })}
          />
          <Select
            label="Estado"
            options={ESTADOS_CAJA.map((estado) => ({ value: estado, label: estado }))}
            value={cajaForm.estado_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, estado_caja: value })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar caja"
        description={`¿Estás seguro de que deseas eliminar la caja ${deleteTarget?.caja_modulo ?? ''}?`}
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
