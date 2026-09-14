import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DatePicker,
  EditableInput,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import {
  modulosClienteApi,
  subModulosApi,
  type ModuloClienteInput,
  type SubModuloInput,
} from '@/lib/api';
import { toastApiError } from '@/lib/feedback';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { sedeOptionsCon } from '@/lib/sedes';
import { fechaHoyISO } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/cn';
import type { ModuloCliente, Role, SubModulo } from '@/types';

interface SubModuloForm {
  codigo: string;
  entidad_remitente: string;
  sede_submodulos: string;
}

interface ModuloClienteForm {
  codigo: string;
  entidad_remitente: string;
  acta_transferencia_modulo: string;
  fecha_trans_modulo: string;
}

const EMPTY_SUB_MODULO_FORM: SubModuloForm = {
  codigo: '',
  entidad_remitente: '',
  sede_submodulos: '',
};

const EMPTY_MODULO_FORM: ModuloClienteForm = {
  codigo: '',
  entidad_remitente: '',
  acta_transferencia_modulo: '',
  fecha_trans_modulo: '',
};

interface ProcesoAtajo {
  label: string;
  desc: string;
  icon: LucideIcon;
  to: string;
  roles: Role[];
  accent: string;
}

const PROCESOS_ATAJOS: ProcesoAtajo[] = [
  {
    label: 'Producción',
    desc: 'Avance de digitación y revisión',
    icon: Factory,
    to: '/produccion',
    roles: ['LIDER', 'CALIDAD'],
    accent: 'bg-primary-50 text-primary-600',
  },
  {
    label: 'Inventario',
    desc: 'Control de inventario de cajas',
    icon: Package,
    to: '/inventario',
    roles: ['LIDER'],
    accent: 'bg-silver-100 text-silver-600',
  },
  {
    label: 'Historial',
    desc: 'Registro de operaciones',
    icon: History,
    to: '/historial',
    roles: ['LIDER'],
    accent: 'bg-amber-50 text-amber-600',
  },
  {
    label: 'Administración',
    desc: 'Usuarios, permisos y roles',
    icon: LayoutDashboard,
    to: '/admin',
    roles: ['ADMIN'],
    accent: 'bg-primary-50 text-primary-600',
  },
];

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isManager = user?.rol === 'ADMIN' || user?.rol === 'LIDER';

  const [subModuloId, setSubModuloId] = useState<number | null>(null);
  // Cliente recién creado: se selecciona automáticamente cuando la lista se
  // refresca, para que "Nueva acta" quede habilitado sin pasos intermedios.
  const [clientePendiente, setClientePendiente] = useState<(SubModuloInput & { desde: number }) | null>(
    null,
  );
  const [filtroActas, setFiltroActas] = useState('');
  const [subModuloModalOpen, setSubModuloModalOpen] = useState(false);
  const [editingSubModulo, setEditingSubModulo] = useState<SubModulo | null>(null);
  const [subModuloDeleteTarget, setSubModuloDeleteTarget] = useState<SubModulo | null>(null);
  const [moduloModalOpen, setModuloModalOpen] = useState(false);
  const [editingModulo, setEditingModulo] = useState<ModuloCliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuloCliente | null>(null);
  const [subModuloForm, setSubModuloForm] = useState<SubModuloForm>(() => ({
    ...EMPTY_SUB_MODULO_FORM,
  }));
  const [moduloForm, setModuloForm] = useState<ModuloClienteForm>(() => ({ ...EMPTY_MODULO_FORM }));
  const [subModuloErrors, setSubModuloErrors] = useState<Partial<Record<keyof SubModuloForm, string>>>({});
  const [moduloErrors, setModuloErrors] = useState<Partial<Record<keyof ModuloClienteForm, string>>>({});

  const subModulosQuery = useQuery({
    queryKey: ['sub-modulos'],
    queryFn: () => subModulosApi.list().then((res) => res.data),
  });

  // Ordenados por código (comparación numérica: 007C antes que 015C) para que
  // el selector sea predecible.
  const clientes = useMemo(
    () =>
      [...(subModulosQuery.data ?? [])].sort((a, b) =>
        a.codigo.localeCompare(b.codigo, 'es', { numeric: true, sensitivity: 'base' }),
      ),
    [subModulosQuery.data],
  );
  const clienteSeleccionado = clientes.find((sm) => sm.id === subModuloId) ?? null;

  useEffect(() => {
    // Solo se acepta una lista obtenida después de crear el cliente; así no se
    // selecciona por error un registro previo con el mismo código.
    if (!clientePendiente || !subModulosQuery.data) return;
    if (subModulosQuery.dataUpdatedAt < clientePendiente.desde) return;
    const creado = subModulosQuery.data
      .filter(
        (sm) =>
          sm.codigo === clientePendiente.codigo &&
          sm.entidad_remitente === clientePendiente.entidad_remitente,
      )
      .sort((a, b) => b.id - a.id)[0];
    if (creado) setSubModuloId(creado.id);
    setClientePendiente(null);
  }, [clientePendiente, subModulosQuery.data, subModulosQuery.dataUpdatedAt]);

  const modulosQuery = useQuery({
    queryKey: ['modulos-cliente', subModuloId],
    queryFn: () => modulosClienteApi.list(subModuloId ?? undefined).then((res) => res.data),
    enabled: isManager ? subModuloId !== null : true,
  });
  const actasDelCliente = modulosQuery.data ?? [];
  const terminoActas = filtroActas.trim().toLowerCase();
  const actasFiltradas = terminoActas
    ? actasDelCliente.filter((acta) =>
        [
          acta.codigo,
          acta.entidad_remitente,
          acta.acta_transferencia_modulo,
          acta.fecha_trans_modulo?.slice(0, 10) ?? '',
        ].some((campo) => campo.toLowerCase().includes(terminoActas)),
      )
    : actasDelCliente;

  const createSubModuloMutation = useMutation({
    mutationFn: (data: SubModuloInput) => subModulosApi.create(data),
    onSuccess: (_res, variables) => {
      toast.success('Cliente creado');
      setSubModuloModalOpen(false);
      setClientePendiente({ ...variables, desde: Date.now() });
      void invalidateDomain(queryClient, 'sub-modulos');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo crear el cliente:' });
    },
  });

  const updateSubModuloMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SubModuloInput }) => subModulosApi.update(id, data),
    onSuccess: () => {
      toast.success('Cliente actualizado');
      setSubModuloModalOpen(false);
      setEditingSubModulo(null);
      void invalidateDomain(queryClient, 'sub-modulos');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo actualizar el cliente:' });
    },
  });

  const deleteSubModuloMutation = useMutation({
    mutationFn: (id: number) => subModulosApi.remove(id),
    onSuccess: () => {
      toast.success('Cliente eliminado');
      setSubModuloDeleteTarget(null);
      setSubModuloId(null);
      void invalidateDomain(queryClient, 'sub-modulos');
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo eliminar el cliente:' });
    },
  });

  const createModuloMutation = useMutation({
    mutationFn: (data: ModuloClienteInput) => modulosClienteApi.create(data),
    onSuccess: () => {
      toast.success('Acta creada');
      setModuloModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo crear el acta:' });
    },
  });

  const updateModuloMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ModuloClienteInput }) =>
      modulosClienteApi.update(id, data),
    onSuccess: () => {
      toast.success('Acta actualizada');
      setModuloModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo actualizar el acta:' });
    },
  });

  const deleteModuloMutation = useMutation({
    mutationFn: (id: number) => modulosClienteApi.remove(id),
    onSuccess: () => {
      toast.success('Acta eliminada');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo eliminar el acta:' });
    },
  });

  const handleSubModuloSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof SubModuloForm, string>> = {};
    if (!subModuloForm.codigo.trim()) nextErrors.codigo = 'El código es requerido';
    if (!subModuloForm.entidad_remitente.trim())
      nextErrors.entidad_remitente = 'La entidad remitente es requerida';
    if (!subModuloForm.sede_submodulos.trim()) nextErrors.sede_submodulos = 'La sede es requerida';
    setSubModuloErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: SubModuloInput = {
      codigo: subModuloForm.codigo.trim(),
      entidad_remitente: subModuloForm.entidad_remitente.trim(),
      sede_submodulos: subModuloForm.sede_submodulos.trim(),
    };
    if (editingSubModulo) {
      updateSubModuloMutation.mutate({ id: editingSubModulo.id, data: payload });
    } else {
      createSubModuloMutation.mutate(payload);
    }
  };

  const handleModuloSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof ModuloClienteForm, string>> = {};
    // El código y la entidad remitente del acta se pueden dejar en blanco: son
    // copias descriptivas de los del cliente y el servidor los guarda como N/A.
    // El número de acta sí se pide: es lo que distingue un acta de otra.
    if (!moduloForm.acta_transferencia_modulo.trim())
      nextErrors.acta_transferencia_modulo = 'El acta de transferencia es requerida';
    setModuloErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const idSubmodulo = editingModulo?.id_submodulo ?? subModuloId;
    if (idSubmodulo === null) {
      toast.error('Seleccione un cliente primero');
      return;
    }

    const payload: ModuloClienteInput = {
      codigo: moduloForm.codigo.trim(),
      entidad_remitente: moduloForm.entidad_remitente.trim(),
      acta_transferencia_modulo: moduloForm.acta_transferencia_modulo.trim(),
      fecha_trans_modulo: moduloForm.fecha_trans_modulo || null,
      id_submodulo: idSubmodulo,
    };

    if (editingModulo) {
      updateModuloMutation.mutate({ id: editingModulo.id, data: payload });
    } else {
      createModuloMutation.mutate(payload);
    }
  };

  const openNuevoSubModulo = () => {
    setEditingSubModulo(null);
    // Igual que en la versión anterior: el cliente se registra en la sede del
    // usuario que lo crea (el backend usa la sede de la sesión).
    setSubModuloForm({ ...EMPTY_SUB_MODULO_FORM, sede_submodulos: user?.sede ?? '' });
    setSubModuloErrors({});
    setSubModuloModalOpen(true);
  };

  const openEditarSubModulo = (subModulo: SubModulo) => {
    setEditingSubModulo(subModulo);
    setSubModuloForm({
      codigo: subModulo.codigo,
      entidad_remitente: subModulo.entidad_remitente,
      sede_submodulos: subModulo.sede_submodulos,
    });
    setSubModuloErrors({});
    setSubModuloModalOpen(true);
  };

  const handleEliminarSubModulo = (subModulo: SubModulo) => {
    // El backend rechaza borrar un cliente con actas (FK); se avisa antes de
    // pedir la confirmación con cédula.
    if (actasDelCliente.length > 0) {
      toast.error(
        `El cliente ${subModulo.codigo} tiene ${actasDelCliente.length} acta(s) registrada(s). Elimine primero sus actas.`,
      );
      return;
    }
    setSubModuloDeleteTarget(subModulo);
  };

  const handleEliminarModulo = (modulo: ModuloCliente) => {
    const cajas = modulo.total_cajas ?? 0;
    if (cajas > 0) {
      toast.error(
        `El acta ${modulo.acta_transferencia_modulo} tiene ${cajas} caja(s) registrada(s). Elimine primero sus cajas.`,
      );
      return;
    }
    setDeleteTarget(modulo);
  };

  const openNuevoModulo = () => {
    setEditingModulo(null);
    // El acta hereda el código y la entidad remitente del cliente seleccionado
    // (jerarquía sub_modulos → moduloscliente); quedan bloqueados pero editables.
    setModuloForm({
      ...EMPTY_MODULO_FORM,
      codigo: clienteSeleccionado?.codigo ?? '',
      entidad_remitente: clienteSeleccionado?.entidad_remitente ?? '',
      // Un acta se registra el día en que se recibe la transferencia, así que
      // hoy es el valor correcto en la enorme mayoría de los casos; queda
      // editable para cargar actas atrasadas.
      fecha_trans_modulo: fechaHoyISO(),
    });
    setModuloErrors({});
    setModuloModalOpen(true);
  };

  const handleEditarModulo = (modulo: ModuloCliente) => {
    setEditingModulo(modulo);
    setModuloForm({
      codigo: modulo.codigo,
      entidad_remitente: modulo.entidad_remitente,
      acta_transferencia_modulo: modulo.acta_transferencia_modulo,
      fecha_trans_modulo: modulo.fecha_trans_modulo?.slice(0, 10) ?? '',
    });
    setModuloErrors({});
    setModuloModalOpen(true);
  };

  const columns: Column<ModuloCliente>[] = [
    { key: 'codigo', header: 'Código' },
    { key: 'entidad_remitente', header: 'Entidad Remitente' },
    { key: 'acta_transferencia_modulo', header: 'Acta Transferencia' },
    {
      key: 'fecha_trans_modulo',
      header: 'Fecha Transferencia',
      render: (modulo) => (modulo.fecha_trans_modulo ? modulo.fecha_trans_modulo.slice(0, 10) : '—'),
    },
    {
      key: 'cajas',
      header: 'N° Cajas',
      render: (modulo) => <span>{modulo.total_cajas ?? 0}</span>,
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (modulo) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/clientes/${modulo.id}/actas`}>
            <Button variant="secondary" size="sm">
              <FileText className="size-4" /> Ver cajas
            </Button>
          </Link>
          {isManager && (
            <>
              <Button variant="secondary" size="sm" onClick={() => handleEditarModulo(modulo)}>
                <Pencil className="size-4" /> Editar
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleEliminarModulo(modulo)}>
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
        title="Clientes"
        description={
          isManager
            ? 'Seleccione un cliente para consultar y registrar sus actas de transferencia'
            : 'Actas con cajas asignadas a su usuario'
        }
        actions={
          isManager ? (
            <>
              <Button variant="secondary" onClick={openNuevoSubModulo}>
                <Plus className="size-4" /> Nuevo cliente
              </Button>
              <Button
                onClick={openNuevoModulo}
                disabled={clienteSeleccionado === null}
                title={clienteSeleccionado === null ? 'Seleccione un cliente para registrar un acta' : undefined}
              >
                <Plus className="size-4" /> Nueva acta
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROCESOS_ATAJOS.filter((atajo) => user?.rol && atajo.roles.includes(user.rol)).map((atajo) => {
          const Icon = atajo.icon;
          return (
            <Link key={atajo.to} to={atajo.to}>
              <Card className="group flex h-full flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md">
                <div className={cn('flex size-11 items-center justify-center rounded-xl', atajo.accent)}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-silver-800 group-hover:text-primary-700">{atajo.label}</p>
                  <p className="mt-0.5 text-xs text-silver-500">{atajo.desc}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Building2 className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-silver-800">Cliente</h3>
            <p className="text-xs text-silver-500">Seleccione un cliente para ver sus actas de transferencia</p>
          </div>
        </div>
        <Select
          label="Cliente"
          placeholder="Seleccione un cliente"
          options={clientes.map((sm) => ({
            value: String(sm.id),
            label: `${sm.codigo} — ${sm.entidad_remitente}`,
          }))}
          value={subModuloId === null ? '' : String(subModuloId)}
          onChange={(value) => {
            setSubModuloId(value ? Number(value) : null);
            setFiltroActas('');
          }}
          className="h-12 text-base"
        />
      </Card>

      {isManager && clienteSeleccionado && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Building2 className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-silver-800">Cliente seleccionado</h3>
                <p className="text-xs text-silver-500">
                  {clienteSeleccionado.codigo} — {clienteSeleccionado.entidad_remitente} ·{' '}
                  {clienteSeleccionado.sede_submodulos}
                </p>
              </div>
            </div>
            <Badge color="blue">
              {actasDelCliente.length} {actasDelCliente.length === 1 ? 'acta' : 'actas'}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => openEditarSubModulo(clienteSeleccionado)}>
              <Pencil className="size-4" /> Editar cliente
            </Button>
            <Button
              variant="danger"
              onClick={() => handleEliminarSubModulo(clienteSeleccionado)}
              loading={
                deleteSubModuloMutation.isPending && subModuloDeleteTarget?.id === clienteSeleccionado.id
              }
            >
              <Trash2 className="size-4" /> Eliminar cliente
            </Button>
          </div>
        </Card>
      )}

      {isManager && subModuloId === null ? (
        <Card>
          <p className="text-sm text-silver-500">
            Seleccione un cliente para ver sus actas de transferencia.
          </p>
        </Card>
      ) : (
        <div key={`modulos-${subModuloId ?? 'todos'}`} className="form-fill-anim space-y-4">
          <Card className="p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
              <Input
                value={filtroActas}
                onChange={(event) => setFiltroActas(event.target.value)}
                placeholder="Buscar acta por número, código, entidad o fecha…"
                className="pl-9"
                aria-label="Buscar actas"
              />
            </div>
          </Card>
          <Table
            columns={columns}
            data={actasFiltradas}
            rowKey={(modulo) => modulo.id}
            loading={modulosQuery.isPending}
            emptyMessage={
              terminoActas
                ? 'Ninguna acta coincide con la búsqueda'
                : isManager
                  ? 'Este cliente aún no tiene actas registradas'
                  : 'Aún no tiene cajas asignadas. Solicite la asignación a su líder.'
            }
          />
        </div>
      )}

      <Modal
        open={subModuloModalOpen}
        onClose={() => {
          setSubModuloModalOpen(false);
          setEditingSubModulo(null);
        }}
        title={editingSubModulo ? 'Editar cliente' : 'Nuevo cliente'}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setSubModuloModalOpen(false);
                setEditingSubModulo(null);
              }}
              disabled={createSubModuloMutation.isPending || updateSubModuloMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="submodulo-form"
              loading={createSubModuloMutation.isPending || updateSubModuloMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="submodulo-form" onSubmit={handleSubModuloSubmit} className="space-y-4">
          <Input
            label="Código"
            value={subModuloForm.codigo}
            onChange={(event) => setSubModuloForm({ ...subModuloForm, codigo: event.target.value })}
            error={subModuloErrors.codigo}
            placeholder="Código del cliente"
          />
          <Input
            label="Entidad Remitente"
            value={subModuloForm.entidad_remitente}
            onChange={(event) =>
              setSubModuloForm({ ...subModuloForm, entidad_remitente: event.target.value })
            }
            error={subModuloErrors.entidad_remitente}
            placeholder="Entidad remitente"
          />
          <Select
            label="Sede"
            options={sedeOptionsCon(subModuloForm.sede_submodulos)}
            value={subModuloForm.sede_submodulos}
            onChange={(value) =>
              setSubModuloForm({ ...subModuloForm, sede_submodulos: value })
            }
            error={subModuloErrors.sede_submodulos}
            placeholder="Seleccione una sede"
            disabled
            hint="Se registra con la sede del usuario que crea el cliente"
          />
        </form>
      </Modal>

      <Modal
        open={moduloModalOpen}
        onClose={() => setModuloModalOpen(false)}
        title={
          editingModulo
            ? `Editar acta · ${editingModulo.acta_transferencia_modulo}`
            : `Nueva acta · ${clienteSeleccionado?.codigo ?? ''}`
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setModuloModalOpen(false)}
              disabled={createModuloMutation.isPending || updateModuloMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="modulo-form"
              loading={createModuloMutation.isPending || updateModuloMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="modulo-form" onSubmit={handleModuloSubmit} className="space-y-4">
          <EditableInput
            label="Código"
            value={moduloForm.codigo}
            onChange={(value) => setModuloForm({ ...moduloForm, codigo: value })}
            error={moduloErrors.codigo}
            placeholder="Código del cliente"
            defaultUnlocked={false}
          />
          <EditableInput
            label="Entidad Remitente"
            value={moduloForm.entidad_remitente}
            onChange={(value) => setModuloForm({ ...moduloForm, entidad_remitente: value })}
            error={moduloErrors.entidad_remitente}
            placeholder="Entidad remitente"
            defaultUnlocked={false}
          />
          <Input
            label="Acta de Transferencia"
            value={moduloForm.acta_transferencia_modulo}
            onChange={(event) =>
              setModuloForm({ ...moduloForm, acta_transferencia_modulo: event.target.value })
            }
            error={moduloErrors.acta_transferencia_modulo}
            placeholder="Número del acta de transferencia"
          />
          <DatePicker
            label="Fecha de Transferencia"
            value={moduloForm.fecha_trans_modulo}
            onChange={(value) =>
              setModuloForm({ ...moduloForm, fecha_trans_modulo: value })
            }
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar acta"
        description={`¿Estás seguro de que deseas eliminar el acta ${deleteTarget?.acta_transferencia_modulo ?? ''} del cliente ${deleteTarget?.codigo ?? ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleteModuloMutation.isPending}
        requireCc
        userCc={user?.cc ?? ''}
        onConfirm={() => {
          if (deleteTarget) deleteModuloMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={subModuloDeleteTarget !== null}
        title="Eliminar cliente"
        description={`¿Estás seguro de que deseas eliminar el cliente ${subModuloDeleteTarget?.codigo ?? ''} — ${subModuloDeleteTarget?.entidad_remitente ?? ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleteSubModuloMutation.isPending}
        requireCc
        userCc={user?.cc ?? ''}
        onConfirm={() => {
          if (subModuloDeleteTarget) deleteSubModuloMutation.mutate(subModuloDeleteTarget.id);
        }}
        onCancel={() => setSubModuloDeleteTarget(null)}
      />
    </div>
  );
}
