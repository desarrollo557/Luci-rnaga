import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { exportExcel } from '@/lib/utils';
import {
  Badge,
  Button,
  ConfirmDialog,
  EditableInput,
  EditableDatePicker,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import { modulosCajaApi, modulosClienteApi } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { useAuthStore } from '@/stores/authStore';
import type { ModuloCaja } from '@/types';

const ESTADOS_CAJA = ['EN PROCESO', 'FINALIZADO'] as const;

interface CajaForm {
  numero_inicial: string;
  numero_final: string;
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
  numero_inicial: '',
  numero_final: '',
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

  const cajasData = cajasQuery.data ?? [];
  const loadingCajas = cajasQuery.isLoading;

  const moduloQuery = useQuery({
    queryKey: ['modulos-cliente', 'get', id],
    queryFn: () => modulosClienteApi.get(id as string).then((res) => res.data),
    enabled: Boolean(id),
  });

  const actaModulo = moduloQuery.data?.acta_transferencia_modulo ?? '';

  const updateMutation = useMutation({
    mutationFn: ({ cajaId, data }: { cajaId: number; data: { caja_modulo: string; entidad_remitente_caja: string; entidad_productora_caja: string; unidad_administrativa_caja: string; oficina_productora_caja: string; objeto_caja: string; acta_trans_caja: string; fecha_trans_caja: string | null; estado_caja: string } }) =>
      modulosCajaApi.update(cajaId, data),
    onSuccess: () => {
      toast.success('Caja actualizada correctamente');
      setModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const createSerieMutation = useMutation({
    mutationFn: (data: { id_modulo_caja: number; numero_inicial: string; numero_final: string; entidad_remitente_caja: string; acta_trans_caja: string; fecha_trans_caja: string | null; entidad_productora_caja: string; unidad_administrativa_caja: string; oficina_productora_caja: string; objeto_caja: string; estado_caja: string }) =>
      modulosCajaApi.createSerie(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Serie de cajas creada correctamente');
      setModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cajaId: number) => modulosCajaApi.remove(cajaId),
    onSuccess: () => {
      toast.success('Caja eliminada');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof CajaForm, string>> = {};

    if (!cajaForm.entidad_remitente_caja?.trim()) {
      nextErrors.entidad_remitente_caja = 'La entidad remitente es requerida';
    }
    if (!cajaForm.entidad_productora_caja?.trim()) {
      nextErrors.entidad_productora_caja = 'La entidad productora es requerida';
    }
    if (!cajaForm.unidad_administrativa_caja?.trim()) {
      nextErrors.unidad_administrativa_caja = 'La unidad administrativa es requerida';
    }
    if (!cajaForm.oficina_productora_caja?.trim()) {
      nextErrors.oficina_productora_caja = 'La oficina productora es requerida';
    }
    if (!cajaForm.objeto_caja?.trim()) {
      nextErrors.objeto_caja = 'El objeto es requerido';
    }
    if (!cajaForm.acta_trans_caja?.trim()) {
      nextErrors.acta_trans_caja = 'El acta de transferencia es requerida';
    }

    setCajaErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Validar formato 6 dígitos para número inicial y final
    if (!/^\d{6}$/.test(cajaForm.numero_inicial)) {
      setCajaErrors({ ...nextErrors, numero_inicial: 'Debe tener 6 dígitos numéricos' });
      return;
    }
    if (!/^\d{6}$/.test(cajaForm.numero_final)) {
      setCajaErrors({ ...nextErrors, numero_final: 'Debe tener 6 dígitos numéricos' });
      return;
    }
    const ini = parseInt(cajaForm.numero_inicial, 10);
    const fin = parseInt(cajaForm.numero_final, 10);
    if (ini > fin) {
      setCajaErrors({ ...nextErrors, numero_inicial: 'El inicial no puede ser mayor que el final' });
      return;
    }

    const baseData = {
      id_modulo_caja: Number(id),
      numero_inicial: cajaForm.numero_inicial,
      numero_final: cajaForm.numero_final,
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
      // Para edición, actualizar una sola caja (usar el número del inicial)
      const prefijo = editingCaja.caja_modulo.slice(0, 4); // ej. "051C"
      updateMutation.mutate({
        cajaId: editingCaja.id,
        data: {
          caja_modulo: `${prefijo}${cajaForm.numero_inicial}`,
          entidad_remitente_caja: cajaForm.entidad_remitente_caja.trim(),
          entidad_productora_caja: cajaForm.entidad_productora_caja.trim(),
          unidad_administrativa_caja: cajaForm.unidad_administrativa_caja.trim(),
          oficina_productora_caja: cajaForm.oficina_productora_caja.trim(),
          objeto_caja: cajaForm.objeto_caja.trim(),
          acta_trans_caja: cajaForm.acta_trans_caja.trim(),
          fecha_trans_caja: cajaForm.fecha_trans_caja || null,
          estado_caja: cajaForm.estado_caja,
        },
      });
      return;
    }

    if (!id) {
      toast.error('Falta el identificador del módulo cliente');
      return;
    }

    createSerieMutation.mutate(baseData);
  };

  const handleExportExcel = () => {
    // Exportar todas las cajas cargadas
    const rows = cajasData;
    if (rows.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = [
      { label: 'Caja', key: 'caja_modulo' },
      { label: 'Entidad Remitente', key: 'entidad_remitente_caja' },
      { label: 'Entidad Productora', key: 'entidad_productora_caja' },
      { label: 'Acta', key: 'acta_trans_caja' },
      { label: 'Fecha', key: 'fecha_trans_caja' },
      { label: 'Estado', key: 'estado_caja' },
    ];

    exportExcel(
      'Actas por Cliente',
      headers,
      rows,
      `actas_cliente_${id || 'all'}`
    );
  };

  const openNuevaCaja = () => {
    setEditingCaja(null);
    const actaModulo = moduloQuery.data?.acta_transferencia_modulo ?? '';
    // Entidades de referencia: se toman de una caja existente del módulo, así la
    // nueva caja hereda los mismos valores que muestra la tabla de actas.
    const todasLasCajas: ModuloCaja[] = cajasData;
    const cajaReferencia =
      todasLasCajas.find((c) => c.entidad_remitente_caja?.trim() || c.entidad_productora_caja?.trim());
    // Sugerir siguiente número inicial basado en la última caja creada
    const ultimaCaja = [...cajasData].sort((a, b) => {
      const na = parseInt(a.caja_modulo.slice(-6), 10);
      const nb = parseInt(b.caja_modulo.slice(-6), 10);
      return nb - na;
    })[0];
    const sugeridoInicial = ultimaCaja
      ? String(parseInt(ultimaCaja.caja_modulo.slice(-6), 10) + 1).padStart(6, '0')
      : '000001';
    setCajaForm({
      ...EMPTY_CAJA_FORM,
      numero_inicial: sugeridoInicial,
      numero_final: sugeridoInicial,
      acta_trans_caja: actaModulo,
      entidad_remitente_caja:
        cajaReferencia?.entidad_remitente_caja ?? moduloQuery.data?.entidad_remitente ?? '',
      entidad_productora_caja: cajaReferencia?.entidad_productora_caja ?? '',
      unidad_administrativa_caja: cajaReferencia?.unidad_administrativa_caja ?? '',
      oficina_productora_caja: cajaReferencia?.oficina_productora_caja ?? '',
      objeto_caja: cajaReferencia?.objeto_caja ?? '',
      fecha_trans_caja: moduloQuery.data?.fecha_trans_modulo?.slice(0, 10) ?? '',
    });
    setCajaErrors({});
    setModalOpen(true);
  };

  const handleEditarCaja = (caja: ModuloCaja) => {
    setEditingCaja(caja);
    // Para edición, extraer el número de 6 dígitos del final del caja_modulo
    const numero = caja.caja_modulo.slice(-6);
    setCajaForm({
      numero_inicial: numero,
      numero_final: numero,
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
      render: (caja: ModuloCaja) => (caja.fecha_trans_caja ? caja.fecha_trans_caja.slice(0, 10) : '—'),
    },
    {
      key: 'fuid',
      header: 'N° FUID',
      render: (caja: ModuloCaja) => <span>{caja.total_fuids ?? 0}</span>,
    },
    {
      key: 'estado_caja',
      header: 'Estado',
      render: (caja: ModuloCaja) => <EstadoBadge estado={caja.estado_caja} />,
    },
    {
      key: 'created_at',
      header: 'Creada',
      render: (caja: ModuloCaja) => (caja.created_at ? caja.created_at.slice(0, 19).replace('T', ' ') : '—'),
    },
    {
      key: 'updated_at',
      header: 'Actualizada',
      render: (caja: ModuloCaja) => (caja.updated_at ? caja.updated_at.slice(0, 19).replace('T', ' ') : '—'),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (caja: ModuloCaja) => (
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
        backTo="/clientes"
        backLabel="Módulos de Cliente"
        actions={
          isManager ? (
            <>
              <Button onClick={openNuevaCaja} disabled={!id} loading={createSerieMutation.isPending}>
                <Plus className="size-4" /> Nueva Caja
              </Button>
              <Button onClick={handleExportExcel} variant="ghost" loading={cajasQuery.isFetching}>
                <FileText className="size-4" /> Exportar Excel
              </Button>
            </>
          ) : undefined
        }
      />

      <Table
        columns={columns}
        data={cajasData}
        rowKey={(caja) => caja.id}
        loading={loadingCajas}
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
              disabled={createSerieMutation.isPending || updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="caja-form"
              loading={createSerieMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="caja-form" onSubmit={handleSubmit} autoComplete="off" className="grid gap-4 md:grid-cols-2">
          <Input
            label="Número Inicial (6 dígitos)"
            value={cajaForm.numero_inicial}
            onChange={(event) => setCajaForm({ ...cajaForm, numero_inicial: event.target.value })}
            error={cajaErrors.numero_inicial}
            placeholder="000001"
            maxLength={6}
          />
          <Input
            label="Número Final (6 dígitos)"
            value={cajaForm.numero_final}
            onChange={(event) => setCajaForm({ ...cajaForm, numero_final: event.target.value })}
            error={cajaErrors.numero_final}
            placeholder="000001"
            maxLength={6}
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
          <EditableInput
            label="Acta de Transferencia"
            value={cajaForm.acta_trans_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, acta_trans_caja: value })}
            error={cajaErrors.acta_trans_caja}
            placeholder={actaModulo || 'Ingrese el número de acta'}
            defaultUnlocked={false}
          />
          <EditableDatePicker
            label="Fecha de Transferencia"
            value={cajaForm.fecha_trans_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, fecha_trans_caja: value })}
            defaultUnlocked={false}
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
