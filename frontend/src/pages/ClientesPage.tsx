import { useEffect, useState, type FormEvent } from 'react';
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
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DatePicker,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import {
  modulosClienteApi,
  subModulosApi,
  usersApi,
  type ModuloClienteInput,
  type RolAsignacion,
  type SubModuloInput,
} from '@/lib/api';
import { toastApiError } from '@/lib/feedback';
import { invalidateDomain } from '@/lib/queryInvalidation';
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

function SeccionAsignacion({
  moduloId,
  rol,
  label,
}: {
  moduloId: number;
  rol: RolAsignacion;
  label: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['modulos-cliente', 'usuarios', moduloId, rol];
  const currentUser = useAuthStore((state) => state.user);

  const asignadosQuery = useQuery({
    queryKey,
    queryFn: () => modulosClienteApi.usuarios(moduloId, rol).then((res) => res.data),
    enabled: moduloId > 0,
  });

  const disponiblesQuery = useQuery({
    queryKey: ['users', 'rol', rol.toUpperCase()],
    queryFn: () =>
      usersApi.byRol(rol.toUpperCase() as Role, { sede: currentUser?.sede }).then((res) => res.data),
    enabled: moduloId > 0,
  });

  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (asignadosQuery.data) {
      setSelected(new Set(asignadosQuery.data.map((usuario) => usuario.id)));
    }
  }, [asignadosQuery.data]);

  const agregarMutation = useMutation({
    mutationFn: (usuarios: number[]) => modulosClienteApi.agregarUsuarios(moduloId, rol, { usuarios }),
    onSuccess: () => {
      toast.success('Usuarios asignados correctamente');
      void invalidateDomain(queryClient, 'users');
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (usuarios: number[]) =>
      modulosClienteApi.eliminarUsuarios(moduloId, rol, { usuarios }),
    onSuccess: () => {
      toast.success('Usuarios eliminados correctamente');
      void invalidateDomain(queryClient, 'users');
    },
  });

  const asignadosIds = new Set((asignadosQuery.data ?? []).map((usuario) => usuario.id));
  const usuarios = disponiblesQuery.data ?? [];
  const loading = asignadosQuery.isPending || disponiblesQuery.isPending;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGuardar = () => {
    const toAdd = usuarios
      .filter((usuario) => selected.has(usuario.id) && !asignadosIds.has(usuario.id))
      .map((usuario) => usuario.id);
    if (toAdd.length === 0) {
      toast.info('No hay usuarios nuevos por asignar');
      return;
    }
    agregarMutation.mutate(toAdd);
  };

  const handleEliminar = () => {
    const toRemove = usuarios
      .filter((usuario) => selected.has(usuario.id) && asignadosIds.has(usuario.id))
      .map((usuario) => usuario.id);
    if (toRemove.length === 0) {
      toast.info('Selecciona usuarios ya asignados para eliminarlos');
      return;
    }
    eliminarMutation.mutate(toRemove);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-silver-800">{label}</h3>
        <Badge color={rol === 'tecnica' ? 'blue' : 'green'}>
          {asignadosQuery.data?.length ?? 0} asignados
        </Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <LoadingState message="Estamos consultando la información…" />
        </div>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {usuarios.length === 0 && (
            <li className="text-sm text-silver-500">No hay usuarios de este rol</li>
          )}
          {usuarios.map((usuario) => {
            const isAssigned = asignadosIds.has(usuario.id);
            return (
              <li key={usuario.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-silver-50">
                  <input
                    type="checkbox"
                    checked={selected.has(usuario.id)}
                    onChange={() => toggle(usuario.id)}
                  />
                  <span className="flex-1 text-silver-700">{usuario.nombre}</span>
                  {isAssigned && <Badge color="gray">Asignado</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleGuardar} loading={agregarMutation.isPending} disabled={loading}>
          Guardar
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={handleEliminar}
          loading={eliminarMutation.isPending}
          disabled={loading}
        >
          Eliminar seleccionados
        </Button>
      </div>
    </Card>
  );
}

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isManager = user?.rol === 'ADMIN' || user?.rol === 'LIDER';

  const [subModuloId, setSubModuloId] = useState<number | null>(null);
  const [subModuloModalOpen, setSubModuloModalOpen] = useState(false);
  const [editingSubModulo, setEditingSubModulo] = useState<SubModulo | null>(null);
  const [subModuloDeleteTarget, setSubModuloDeleteTarget] = useState<SubModulo | null>(null);
  const [moduloModalOpen, setModuloModalOpen] = useState(false);
  const [editingModulo, setEditingModulo] = useState<ModuloCliente | null>(null);
  const [asignarModulo, setAsignarModulo] = useState<ModuloCliente | null>(null);
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

  const modulosQuery = useQuery({
    queryKey: ['modulos-cliente', subModuloId],
    queryFn: () => modulosClienteApi.list(subModuloId ?? undefined).then((res) => res.data),
    enabled: isManager ? subModuloId !== null : true,
  });

  const createSubModuloMutation = useMutation({
    mutationFn: (data: SubModuloInput) => subModulosApi.create(data),
    onSuccess: () => {
      toast.success('Sub-módulo creado');
      setSubModuloModalOpen(false);
      void invalidateDomain(queryClient, 'sub-modulos');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo crear el sub-módulo:' });
    },
  });

  const updateSubModuloMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SubModuloInput }) => subModulosApi.update(id, data),
    onSuccess: () => {
      toast.success('Sub-módulo actualizado');
      setSubModuloModalOpen(false);
      setEditingSubModulo(null);
      void invalidateDomain(queryClient, 'sub-modulos');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo actualizar el sub-módulo:' });
    },
  });

  const deleteSubModuloMutation = useMutation({
    mutationFn: (id: number) => subModulosApi.remove(id),
    onSuccess: () => {
      toast.success('Sub-módulo eliminado');
      setSubModuloDeleteTarget(null);
      setSubModuloId(null);
      void invalidateDomain(queryClient, 'sub-modulos');
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo eliminar el sub-módulo:' });
    },
  });

  const createModuloMutation = useMutation({
    mutationFn: (data: ModuloClienteInput) => modulosClienteApi.create(data),
    onSuccess: () => {
      toast.success('Módulo cliente creado');
      setModuloModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo crear el módulo cliente:' });
    },
  });

  const updateModuloMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ModuloClienteInput }) =>
      modulosClienteApi.update(id, data),
    onSuccess: () => {
      toast.success('Módulo cliente actualizado');
      setModuloModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo actualizar el módulo cliente:' });
    },
  });

  const deleteModuloMutation = useMutation({
    mutationFn: (id: number) => modulosClienteApi.remove(id),
    onSuccess: () => {
      toast.success('Módulo cliente eliminado');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'modulos-cliente');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo eliminar el módulo cliente:' });
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
    if (!moduloForm.codigo.trim()) nextErrors.codigo = 'El código es requerido';
    if (!moduloForm.entidad_remitente.trim())
      nextErrors.entidad_remitente = 'La entidad remitente es requerida';
    if (!moduloForm.acta_transferencia_modulo.trim())
      nextErrors.acta_transferencia_modulo = 'El acta de transferencia es requerida';
    setModuloErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const idSubmodulo = editingModulo?.id_submodulo ?? subModuloId;
    if (idSubmodulo === null) {
      toast.error('Seleccione un sub-módulo primero');
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
    setSubModuloForm({ ...EMPTY_SUB_MODULO_FORM });
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
    setSubModuloDeleteTarget(subModulo);
  };

  const openNuevoModulo = () => {
    setEditingModulo(null);
    // Autocompletar desde el sub-módulo seleccionado: el código y la entidad
    // remitente ya existen lógicamente en la jerarquía (sub_módulo → módulo).
    const subModulo = (subModulosQuery.data ?? []).find((sm) => sm.id === subModuloId);
    setModuloForm({
      ...EMPTY_MODULO_FORM,
      codigo: subModulo?.codigo ?? '',
      entidad_remitente: subModulo?.entidad_remitente ?? '',
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
              <FileText className="size-4" /> Ver Actas
            </Button>
          </Link>
          {isManager && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setAsignarModulo(modulo)}>
                <Users className="size-4" /> Asignar Usuarios
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleEditarModulo(modulo)}>
                <Pencil className="size-4" /> Editar
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteTarget(modulo)}>
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
        title="Módulos de Cliente"
        description="Seleccione un sub-módulo para ver sus módulos cliente"
        actions={
          isManager ? (
            <>
              <Button variant="secondary" onClick={openNuevoSubModulo}>
                <Plus className="size-4" /> Nuevo Sub-Módulo
              </Button>
              <Button onClick={openNuevoModulo} disabled={subModuloId === null}>
                <Plus className="size-4" /> Nuevo Módulo Cliente
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
            <h3 className="font-semibold text-silver-800">Sub-módulo</h3>
            <p className="text-xs text-silver-500">Seleccione un sub-módulo para ver sus módulos cliente</p>
          </div>
        </div>
        <Select
          label="Sub-módulo"
          placeholder="Seleccione un sub-módulo"
          options={(subModulosQuery.data ?? []).map((sm) => ({
            value: String(sm.id),
            label: `${sm.codigo} — ${sm.entidad_remitente}`,
          }))}
          value={subModuloId === null ? '' : String(subModuloId)}
          onChange={(value) => setSubModuloId(value ? Number(value) : null)}
          className="h-12 text-base"
        />
      </Card>

      {isManager && subModuloId !== null && (() => {
        const seleccionado = (subModulosQuery.data ?? []).find((sm) => sm.id === subModuloId);
        if (!seleccionado) return null;
        return (
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Building2 className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-silver-800">Sub-módulo seleccionado</h3>
                <p className="text-xs text-silver-500">
                  {seleccionado.codigo} — {seleccionado.entidad_remitente} · {seleccionado.sede_submodulos}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => openEditarSubModulo(seleccionado)}>
                <Pencil className="size-4" /> Editar Sub-módulo
              </Button>
              <Button
                variant="danger"
                onClick={() => handleEliminarSubModulo(seleccionado)}
                loading={deleteSubModuloMutation.isPending && subModuloDeleteTarget?.id === seleccionado.id}
              >
                <Trash2 className="size-4" /> Eliminar Sub-módulo
              </Button>
            </div>
          </Card>
        );
      })()}

      {isManager && subModuloId === null ? (
        <Card>
          <p className="text-sm text-silver-500">
            Seleccione un sub-módulo para ver sus módulos cliente.
          </p>
        </Card>
      ) : (
        <div key={`modulos-${subModuloId ?? 'todos'}`} className="form-fill-anim">
          <Table
            columns={columns}
            data={modulosQuery.data ?? []}
            rowKey={(modulo) => modulo.id}
            loading={modulosQuery.isPending}
            emptyMessage={
              isManager
                ? 'No hay módulos cliente en este sub-módulo'
                : 'No tiene módulos asignados. Contacte al administrador.'
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
        title={editingSubModulo ? 'Editar Sub-Módulo' : 'Nuevo Sub-Módulo'}
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
              {editingSubModulo ? 'Guardar' : 'Crear'}
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
            placeholder="Código del sub-módulo"
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
          <Input
            label="Sede"
            value={subModuloForm.sede_submodulos}
            onChange={(event) =>
              setSubModuloForm({ ...subModuloForm, sede_submodulos: event.target.value })
            }
            error={subModuloErrors.sede_submodulos}
            placeholder="Sede del sub-módulo"
          />
        </form>
      </Modal>

      <Modal
        open={moduloModalOpen}
        onClose={() => setModuloModalOpen(false)}
        title={editingModulo ? 'Editar Módulo Cliente' : 'Nuevo Módulo Cliente'}
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
          <Input
            label="Código"
            value={moduloForm.codigo}
            onChange={(event) => setModuloForm({ ...moduloForm, codigo: event.target.value })}
            error={moduloErrors.codigo}
            placeholder="Código del módulo cliente"
          />
          <Input
            label="Entidad Remitente"
            value={moduloForm.entidad_remitente}
            onChange={(event) =>
              setModuloForm({ ...moduloForm, entidad_remitente: event.target.value })
            }
            error={moduloErrors.entidad_remitente}
            placeholder="Entidad remitente"
          />
          <Input
            label="Acta de Transferencia"
            value={moduloForm.acta_transferencia_modulo}
            onChange={(event) =>
              setModuloForm({ ...moduloForm, acta_transferencia_modulo: event.target.value })
            }
            error={moduloErrors.acta_transferencia_modulo}
            placeholder="Acta de transferencia"
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

      <Modal
        open={asignarModulo !== null}
        onClose={() => setAsignarModulo(null)}
        title={`Asignar Usuarios · ${asignarModulo?.codigo ?? ''}`}
        size="lg"
      >
        {asignarModulo && (
          <div className="grid gap-4 md:grid-cols-2">
            <SeccionAsignacion moduloId={asignarModulo.id} rol="tecnica" label="Técnicos" />
            <SeccionAsignacion moduloId={asignarModulo.id} rol="calidad" label="Calidad" />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar módulo cliente"
        description={`¿Estás seguro de que deseas eliminar el módulo ${deleteTarget?.codigo ?? ''}? Esta acción no se puede deshacer.`}
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
        title="Eliminar sub-módulo"
        description={`¿Estás seguro de que deseas eliminar el sub-módulo ${subModuloDeleteTarget?.codigo ?? ''} — ${subModuloDeleteTarget?.entidad_remitente ?? ''}? Esta acción no se puede deshacer.`}
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
