import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ClipboardList, Eye, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Input, PageHeader, Spinner } from '@/components/ui';
import {
  asignacionCajaCalidadApi,
  asignacionCajaTecnicaApi,
  modulosCajaApi,
  usersApi,
  type AsignacionCajaInput,
  type AsignacionCajaRangoInput,
} from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const RANGO_REGEX = /^\d{3}C\d{6}$/;

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Error en el servidor';
  }
  return 'Error en el servidor';
}

interface SeccionAsignacionCajaProps {
  cajaId: number;
  rol: 'TECNICA' | 'CALIDAD';
  label: string;
}

function SeccionAsignacionCaja({ cajaId, rol, label }: SeccionAsignacionCajaProps) {
  const queryClient = useQueryClient();
  const isCalidad = rol === 'CALIDAD';

  const asignadosQuery = useQuery({
    queryKey: ['modulos-caja', 'usuarios', cajaId, rol],
    queryFn: () =>
      (rol === 'TECNICA'
        ? modulosCajaApi.usuariosTecnica(cajaId)
        : modulosCajaApi.usuariosCalidad(cajaId)
      ).then((res) => res.data),
    enabled: cajaId > 0,
  });

  const disponiblesQuery = useQuery({
    queryKey: ['users', 'rol', rol],
    queryFn: () => usersApi.byRol(rol).then((res) => res.data),
    enabled: cajaId > 0,
  });

  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (asignadosQuery.data) {
      setSelected(new Set(asignadosQuery.data.map((usuario) => usuario.id)));
    }
  }, [asignadosQuery.data]);

  const [rangoInicio, setRangoInicio] = useState('');
  const [rangoFin, setRangoFin] = useState('');
  const [rangoUsuarios, setRangoUsuarios] = useState<Set<number>>(new Set());
  const [rangoError, setRangoError] = useState<string | null>(null);

  const asignarMutation = useMutation({
    mutationFn: (usuarios: number[]) => {
      const data: AsignacionCajaInput = { modulo_id: cajaId, usuarios };
      return rol === 'TECNICA'
        ? asignacionCajaTecnicaApi.asignar(data)
        : asignacionCajaCalidadApi.asignar(data);
    },
    onSuccess: () => {
      toast.success('Asignación guardada correctamente');
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'usuarios', cajaId, rol] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const eliminarMutation = useMutation({
    mutationFn: (usuarios: number[]) =>
      rol === 'TECNICA'
        ? asignacionCajaTecnicaApi.eliminar(cajaId, usuarios)
        : asignacionCajaCalidadApi.eliminar(cajaId, usuarios),
    onSuccess: () => {
      toast.success('Usuarios eliminados correctamente');
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'usuarios', cajaId, rol] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rangoMutation = useMutation({
    mutationFn: (data: AsignacionCajaRangoInput) => asignacionCajaCalidadApi.asignarRango(data),
    onSuccess: () => {
      toast.success('Rango asignado correctamente');
      setRangoInicio('');
      setRangoFin('');
      setRangoUsuarios(new Set());
      setRangoError(null);
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'usuarios', cajaId, rol] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
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

  const toggleRango = (id: number) => {
    setRangoUsuarios((prev) => {
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
    asignarMutation.mutate(toAdd);
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

  const handleAsignarRango = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!RANGO_REGEX.test(rangoInicio) || !RANGO_REGEX.test(rangoFin)) {
      setRangoError('El rango debe tener el formato 000C000000');
      return;
    }
    if (rangoUsuarios.size === 0) {
      setRangoError('Selecciona al menos un usuario de calidad');
      return;
    }
    setRangoError(null);
    rangoMutation.mutate({
      modulo_id: cajaId,
      usuarios: [...rangoUsuarios],
      rango_inicio: rangoInicio,
      rango_fin: rangoFin,
    });
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <Badge color={isCalidad ? 'green' : 'blue'}>
          {asignadosQuery.data?.length ?? 0} asignados
        </Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-6 text-primary-600" />
        </div>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {usuarios.length === 0 && (
            <li className="text-sm text-slate-500">No hay usuarios de este rol</li>
          )}
          {usuarios.map((usuario) => {
            const isAssigned = asignadosIds.has(usuario.id);
            return (
              <li key={usuario.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(usuario.id)}
                    onChange={() => toggle(usuario.id)}
                  />
                  <span className="flex-1 text-slate-700">{usuario.nombre}</span>
                  {isAssigned && <Badge color="gray">Asignado</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={handleGuardar} loading={asignarMutation.isPending} disabled={loading}>
          Guardar asignación
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

      {isCalidad && (
        <form onSubmit={handleAsignarRango} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-sm font-semibold text-slate-700">Asignar por rango</h4>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Rango inicio"
              value={rangoInicio}
              onChange={(event) => setRangoInicio(event.target.value)}
              placeholder="000C000000"
            />
            <Input
              label="Rango fin"
              value={rangoFin}
              onChange={(event) => setRangoFin(event.target.value)}
              placeholder="000C000000"
            />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {usuarios.map((usuario) => (
              <label
                key={usuario.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={rangoUsuarios.has(usuario.id)}
                  onChange={() => toggleRango(usuario.id)}
                />
                <span className="text-slate-700">{usuario.nombre}</span>
              </label>
            ))}
          </div>
          {rangoError && <p className="text-xs text-red-600">{rangoError}</p>}
          <Button type="submit" size="sm" loading={rangoMutation.isPending}>
            Asignar rango
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function CajasPage() {
  const queryClient = useQueryClient();
  const { id, mid } = useParams<{ id: string; mid: string }>();
  const user = useAuthStore((state) => state.user);
  const rol = user?.rol;
  const isManager = rol === 'LIDER' || rol === 'ADMIN';
  const cajaId = mid ? Number(mid) : null;

  const cajaQuery = useQuery({
    queryKey: ['modulos-caja', 'detalle', mid],
    queryFn: () => modulosCajaApi.get(mid as string).then((res) => res.data),
    enabled: Boolean(mid),
  });

  const cambiarEstadoMutation = useMutation({
    mutationFn: (estado: string) => modulosCajaApi.cambiarEstado(mid as string, estado),
    onSuccess: () => {
      toast.success('Estado de la caja actualizado');
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'detalle', mid] });
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'list', id] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const caja = cajaQuery.data;
  const estado = caja?.estado_caja;
  const targetEstado = estado === 'FINALIZADO' ? 'EN PROCESO' : 'FINALIZADO';
  const estadoColor = estado === 'FINALIZADO' ? 'green' : estado === 'EN PROCESO' ? 'amber' : 'gray';

  const handleCambiarEstado = () => {
    if (!mid) return;
    cambiarEstadoMutation.mutate(targetEstado);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={caja ? `Caja ${caja.caja_modulo}` : 'Caja'}
        description="Clientes / Actas / Caja"
        actions={
          caja && (
            <>
              <Badge color={estadoColor}>{estado || '—'}</Badge>
              {rol === 'TECNICA' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleCambiarEstado}
                    loading={cambiarEstadoMutation.isPending}
                  >
                    <PencilLine className="size-4" /> Cambiar Estado
                  </Button>
                  <Link to={`/cajas/${mid}/datos`}>
                    <Button>
                      <ClipboardList className="size-4" /> Ir a Digitación
                    </Button>
                  </Link>
                  <Link to={`/cajas/${mid}/revision`}>
                    <Button variant="secondary">
                      <Eye className="size-4" /> Ver Revisión
                    </Button>
                  </Link>
                </>
              )}
              {isManager && (
                <>
                  <Link to={`/cajas/${mid}/datos`}>
                    <Button variant="secondary">
                      <ClipboardList className="size-4" /> Ver FUIDs
                    </Button>
                  </Link>
                  <Link to={`/cajas/${mid}/revision`}>
                    <Button variant="secondary">
                      <Eye className="size-4" /> Ver Revisión
                    </Button>
                  </Link>
                </>
              )}
            </>
          )
        }
      />

      {cajaQuery.isPending ? (
        <Card>
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-primary-600" />
          </div>
        </Card>
      ) : (
        caja && (
          <Card>
            <dl className="grid gap-4 text-sm md:grid-cols-3">
              <div>
                <dt className="font-medium text-slate-500">Entidad Remitente</dt>
                <dd className="mt-0.5 text-slate-800">{caja.entidad_remitente_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Entidad Productora</dt>
                <dd className="mt-0.5 text-slate-800">{caja.entidad_productora_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Acta de Transferencia</dt>
                <dd className="mt-0.5 text-slate-800">{caja.acta_trans_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Unidad Administrativa</dt>
                <dd className="mt-0.5 text-slate-800">{caja.unidad_administrativa_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Oficina Productora</dt>
                <dd className="mt-0.5 text-slate-800">{caja.oficina_productora_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Fecha de Transferencia</dt>
                <dd className="mt-0.5 text-slate-800">
                  {caja.fecha_trans_caja ? caja.fecha_trans_caja.slice(0, 10) : '—'}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-medium text-slate-500">Objeto</dt>
                <dd className="mt-0.5 text-slate-800">{caja.objeto_caja}</dd>
              </div>
            </dl>
          </Card>
        )
      )}

      {isManager && cajaId !== null && (
        <div className="grid gap-4 md:grid-cols-2">
          <SeccionAsignacionCaja cajaId={cajaId} rol="TECNICA" label="Técnicos" />
          <SeccionAsignacionCaja cajaId={cajaId} rol="CALIDAD" label="Calidad" />
        </div>
      )}
    </div>
  );
}
