import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  type BadgeColor,
  type Column,
} from '@/components/ui';
import { usersApi, type UserInput } from '@/lib/api';
import type { Role, User } from '@/types';
import { ROLES } from '@/types';

const ROLE_BADGE: Record<Role, BadgeColor> = {
  ADMIN: 'red',
  LIDER: 'amber',
  TECNICA: 'blue',
  CALIDAD: 'green',
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  LIDER: 'Líder',
  TECNICA: 'Técnica',
  CALIDAD: 'Calidad',
};

const SEDES = ['Barranquilla', 'Bogotá', 'Medellín', 'Cali'];

const EMPTY_FORM: UserInput = {
  cc: '',
  nombre: '',
  contrasena: '',
  rol: 'TECNICA',
  sede: '',
};

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Error en el servidor';
  }
  return 'Error en el servidor';
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserInput>(() => ({ ...EMPTY_FORM }));
  const [errors, setErrors] = useState<Partial<Record<keyof UserInput, string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: UserInput) => usersApi.create(data),
    onSuccess: () => {
      toast.success('Usuario creado');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ cc, data }: { cc: string; data: UserInput }) => usersApi.update(cc, data),
    onSuccess: () => {
      toast.success('Usuario actualizado');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (user: User) => usersApi.remove(user.cc),
    onSuccess: () => {
      toast.success('Usuario eliminado');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

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
    if (!form.cc.trim()) nextErrors.cc = 'La cédula es obligatoria';
    if (!form.nombre.trim()) nextErrors.nombre = 'El nombre es obligatorio';
    if (!editingUser && !form.contrasena) nextErrors.contrasena = 'La contraseña es obligatoria';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (editingUser) {
      updateMutation.mutate({
        cc: editingUser.cc,
        data: {
          cc: form.cc,
          nombre: form.nombre,
          contrasena: form.contrasena || editingUser.contrasena,
          rol: form.rol,
          sede: form.sede,
        },
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const columns: Column<User>[] = [
    { key: 'cc', header: 'Cédula' },
    { key: 'nombre', header: 'Nombre' },
    {
      key: 'rol',
      header: 'Rol',
      render: (user) => <Badge color={ROLE_BADGE[user.rol]}>{ROLE_LABEL[user.rol]}</Badge>,
    },
    {
      key: 'sede',
      header: 'Sede',
      render: (user) => user.sede ?? '—',
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (user) => (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(user)}>
            <Pencil className="size-4" /> Editar
          </Button>
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

      <Table
        columns={columns}
        data={usersQuery.data ?? []}
        rowKey={(user) => user.id}
        loading={usersQuery.isPending}
        emptyMessage="No hay usuarios registrados"
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
            onChange={(event) => setForm({ ...form, rol: event.target.value as Role })}
          />
          <Select
            label="Sede"
            options={SEDES.map((sede) => ({ value: sede, label: sede }))}
            value={form.sede}
            onChange={(event) => setForm({ ...form, sede: event.target.value })}
            placeholder="Seleccione una sede"
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
    </div>
  );
}
