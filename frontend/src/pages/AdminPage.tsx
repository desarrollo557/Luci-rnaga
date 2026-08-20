import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Building2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
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
  Modal,
  PageHeader,
  Select,
  Table,
  type BadgeColor,
  type Column,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { usersApi, type UserInput } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { createValidator, minLength, onlyDigits } from '@/lib/validation';
import type { Role, User } from '@/types';
import { ROLES } from '@/types';

const ROLE_BADGE: Record<Role, BadgeColor> = {
  ADMIN: 'red',
  LIDER: 'red',
  TECNICA: 'gray',
  CALIDAD: 'green',
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  LIDER: 'Líder',
  TECNICA: 'Técnica',
  CALIDAD: 'Calidad',
};

const ROLE_AVATAR: Record<Role, string> = {
  ADMIN: 'bg-red-600',
  LIDER: 'bg-amber-500',
  TECNICA: 'bg-silver-500',
  CALIDAD: 'bg-emerald-600',
};

const SEDES = ['Barranquilla', 'Bogotá', 'Medellín', 'Cali'];

const EMPTY_FORM: UserInput = {
  cc: '',
  nombre: '',
  contrasena: '',
  rol: 'TECNICA',
  sede: '',
};

const validateCc = createValidator(
  (value) => (value.trim() === '' ? 'La cédula es requerida' : null),
  onlyDigits,
);

const validateNombre = createValidator(
  (value) => (value.trim() === '' ? 'El nombre es requerido' : null),
  (value) => minLength(value, 3, 'El nombre'),
);

const validateContrasena = createValidator(
  (value) => (value.trim() === '' ? 'La contraseña es requerida' : null),
  (value) => minLength(value, 4, 'La contraseña'),
);

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserInput>(() => ({ ...EMPTY_FORM }));
  const [errors, setErrors] = useState<Partial<Record<keyof UserInput, string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [suspendFecha, setSuspendFecha] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sedeFilter, setSedeFilter] = useState('');

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: UserInput) => usersApi.create(data),
    onSuccess: () => {
      toast.success('Usuario creado');
      setFormOpen(false);
      void invalidateDomain(queryClient, 'users');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserInput }) => usersApi.update(id, data),
    onSuccess: () => {
      toast.success('Usuario actualizado');
      setFormOpen(false);
      void invalidateDomain(queryClient, 'users');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (user: User) => usersApi.remove(user.id),
    onSuccess: () => {
      toast.success('Usuario eliminado');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'users');
    },
  });

  const suspensionMutation = useMutation({
    mutationFn: () => usersApi.suspender(suspendTarget!.id, suspendFecha || null),
    onSuccess: () => {
      if (suspendTarget) {
        toast.success(suspendFecha ? 'Usuario suspendido' : 'Usuario reactivado');
      }
      setSuspendTarget(null);
      setSuspendFecha('');
      void invalidateDomain(queryClient, 'users');
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const users = usersQuery.data ?? [];

  const stats = useMemo(
    () => ({
      total: users.length,
      tecnicas: users.filter((user) => user.rol === 'TECNICA').length,
      calidad: users.filter((user) => user.rol === 'CALIDAD').length,
      lideresAdmin: users.filter((user) => user.rol === 'LIDER' || user.rol === 'ADMIN').length,
    }),
    [users],
  );

  const sedes = useMemo(
    () =>
      Array.from(new Set(users.map((user) => user.sede).filter((sede): sede is string => Boolean(sede)))).sort(),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesTerm =
        term === '' ||
        user.nombre.toLowerCase().includes(term) ||
        user.cc.toLowerCase().includes(term);
      const matchesRole = roleFilter === '' || user.rol === roleFilter;
      const matchesSede = sedeFilter === '' || (user.sede ?? '') === sedeFilter;
      return matchesTerm && matchesRole && matchesSede;
    });
  }, [users, searchTerm, roleFilter, sedeFilter]);

  const hasActiveFilters = searchTerm.trim() !== '' || roleFilter !== '' || sedeFilter !== '';

  const statCards: { label: string; icon: LucideIcon; value: number; iconClass: string }[] = [
    { label: 'Total Usuarios', icon: Users, value: stats.total, iconClass: 'bg-primary-50 text-primary-600' },
    { label: 'Técnicas', icon: UserCheck, value: stats.tecnicas, iconClass: 'bg-silver-100 text-silver-600' },
    { label: 'Calidad', icon: ShieldCheck, value: stats.calidad, iconClass: 'bg-emerald-50 text-emerald-600' },
    { label: 'Líderes y Administradores', icon: Building2, value: stats.lideresAdmin, iconClass: 'bg-red-50 text-red-600' },
  ];

  const handleNew = () => {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setFormOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setForm({ cc: user.cc, nombre: user.nombre, contrasena: '', rol: user.rol, sede: user.sede ?? '' });
    setErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof UserInput, string>> = {};

    const ccError = validateCc(form.cc, 'La cédula');
    if (ccError) nextErrors.cc = ccError;

    const nombreError = validateNombre(form.nombre, 'El nombre');
    if (nombreError) nextErrors.nombre = nombreError;

    const contrasenaNeeded = !editingUser || (form.contrasena ?? '') !== '';
    if (contrasenaNeeded) {
      const contrasenaError = validateContrasena(form.contrasena ?? '', 'La contraseña');
      if (contrasenaError) nextErrors.contrasena = contrasenaError;
    }

    if (!form.rol) nextErrors.rol = 'El rol es requerido';
    if (!form.sede.trim()) nextErrors.sede = 'La sede es requerida';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        data: {
          cc: form.cc,
          nombre: form.nombre,
          contrasena: form.contrasena || undefined,
          rol: form.rol,
          sede: form.sede,
        },
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSuspendido = (user: User): boolean => {
    if (!user.suspendido_hasta) return false;
    const today = new Date().toISOString().slice(0, 10);
    return user.suspendido_hasta >= today;
  };

  const formatDisplayDate = (iso: string): string => {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  };

  const columns: Column<User>[] = [
    {
      key: 'usuario',
      header: 'Usuario',
      render: (user) => (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
              ROLE_AVATAR[user.rol],
            )}
          >
            {getInitials(user.nombre)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-silver-900">{user.nombre}</p>
            <p className="text-xs text-silver-500">{user.cc}</p>
            {isSuspendido(user) && (
              <Badge color="amber" className="mt-1">
                Suspendido hasta {formatDisplayDate(user.suspendido_hasta!)}
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'rol',
      header: 'Rol',
      render: (user) => <Badge color={ROLE_BADGE[user.rol]}>{ROLE_LABEL[user.rol]}</Badge>,
    },
    {
      key: 'sede',
      header: 'Sede',
      render: (user) => (
        <div className="flex items-center gap-1.5">
          <Building2 className="size-4 shrink-0 text-silver-400" />
          <span>{user.sede ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Creado',
      render: (user) => (user.created_at ? user.created_at.slice(0, 19).replace('T', ' ') : '—'),
    },
    {
      key: 'updated_at',
      header: 'Actualizado',
      render: (user) => (user.updated_at ? user.updated_at.slice(0, 19).replace('T', ' ') : '—'),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (user) => (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(user)}>
            <Pencil className="size-4" /> Editar
          </Button>
          {isSuspendido(user) ? (
            <Button variant="primary" size="sm" onClick={() => { setSuspendTarget(user); setSuspendFecha(''); }}>
              <UserCheck className="size-4" /> Reactivar
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => { setSuspendTarget(user); setSuspendFecha(''); }}>
              <Ban className="size-4" /> Suspender
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(user)}>
            <Trash2 className="size-4" /> Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestión de Usuarios"
        description="Administra los usuarios y sus roles en el sistema"
        actions={
          <Button onClick={handleNew}>
            <Plus className="size-4" /> Nuevo Usuario
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, icon: Icon, value, iconClass }) => (
          <Card key={label} className="flex items-center gap-4">
            <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
              <Icon className="size-6" />
            </span>
            <div>
              <p className="text-3xl font-bold text-silver-900">{value}</p>
              <p className="text-sm text-silver-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-silver-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre o cédula…"
            className="pl-9"
            aria-label="Buscar usuarios"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:w-96">
          <Select
            label="Rol"
            options={[{ value: '', label: 'Todos los roles' }, ...ROLES.map((rol) => ({ value: rol, label: ROLE_LABEL[rol] }))]}
            value={roleFilter}
            onChange={setRoleFilter}
          />
          <Select
            label="Sede"
            options={[{ value: '', label: 'Todas las sedes' }, ...sedes.map((sede) => ({ value: sede, label: sede }))]}
            value={sedeFilter}
            onChange={setSedeFilter}
          />
        </div>
      </div>

      {hasActiveFilters && (
        <p className="text-right text-xs text-silver-500">
          Mostrando {filteredUsers.length} de {users.length} usuarios
        </p>
      )}

      <Table
        columns={columns}
        data={filteredUsers}
        rowKey={(user) => user.id}
        loading={usersQuery.isPending}
        emptyMessage={hasActiveFilters ? 'No hay usuarios que coincidan con los filtros' : 'No hay usuarios registrados'}
      />

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="user-form" loading={saving}>
              Guardar
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Cédula"
            value={form.cc}
            onChange={(event) => setForm({ ...form, cc: event.target.value })}
            error={errors.cc}
            disabled={editingUser !== null}
            placeholder="Número de cédula"
            inputMode="numeric"
          />
          <Input
            label="Nombre"
            value={form.nombre}
            onChange={(event) => setForm({ ...form, nombre: event.target.value })}
            error={errors.nombre}
            placeholder="Nombre completo"
          />
          <Input
            label="Contraseña"
            type="password"
            value={form.contrasena}
            onChange={(event) => setForm({ ...form, contrasena: event.target.value })}
            error={errors.contrasena}
            placeholder={editingUser ? 'Dejar vacío no cambia la contraseña' : undefined}
            autoComplete="new-password"
          />
          <Select
            label="Rol"
            options={ROLES.map((rol) => ({ value: rol, label: ROLE_LABEL[rol] }))}
            value={form.rol}
            onChange={(value) => setForm({ ...form, rol: value as Role })}
            error={errors.rol}
          />
          <Select
            label="Sede"
            options={SEDES.map((sede) => ({ value: sede, label: sede }))}
            value={form.sede}
            onChange={(value) => setForm({ ...form, sede: value })}
            placeholder="Seleccione una sede"
            error={errors.sede}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar usuario"
        description={`¿Estás seguro de que deseas eliminar a ${deleteTarget?.nombre ?? ''}?`}
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        open={suspendTarget !== null}
        onClose={() => { setSuspendTarget(null); setSuspendFecha(''); }}
        title={suspendTarget && isSuspendido(suspendTarget) ? 'Reactivar usuario' : 'Suspender usuario'}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setSuspendTarget(null); setSuspendFecha(''); }} disabled={suspensionMutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="suspension-form" loading={suspensionMutation.isPending}>
              {suspendTarget && isSuspendido(suspendTarget) ? 'Reactivar' : 'Suspender'}
            </Button>
          </>
        }
      >
        <form id="suspension-form" onSubmit={(e) => { e.preventDefault(); suspensionMutation.mutate(); }} className="space-y-4">
          <p className="text-silver-700">
            {suspendTarget && isSuspendido(suspendTarget)
              ? `¿Reactivar a ${suspendTarget.nombre}? El usuario podrá iniciar sesión nuevamente de inmediato.`
              : suspendTarget
              ? `¿Suspender a ${suspendTarget.nombre}? Seleccione la fecha hasta la cual permanecerá suspendido.`
              : ''}
          </p>
          {!suspendTarget?.suspendido_hasta || !isSuspendido(suspendTarget) ? (
            <DatePicker
              label="Fecha de suspensión"
              value={suspendFecha}
              onChange={setSuspendFecha}
              min={new Date().toISOString().slice(0, 10)}
              placeholder="Seleccione una fecha"
              required
            />
          ) : (
            <p className="text-sm text-silver-600">
              Usuario suspendido hasta el {suspendTarget && suspendTarget.suspendido_hasta ? formatDisplayDate(suspendTarget.suspendido_hasta) : '—'}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}