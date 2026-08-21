import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Eye, FileText, PencilLine, Users, Wrench, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Input, LoadingState, Modal, PageHeader } from '@/components/ui';
import {
  asignacionCajaCalidadApi,
  asignacionCajaTecnicaApi,
  getApiErrorMessage,
  modulosCajaApi,
  usersApi,
  type AsignacionCajaInput,
  type AsignacionCajaRangoInput,
} from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { validCaja } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';

interface SeccionAsignacionCajaProps {
  cajaId: number;
  rol: 'TECNICA' | 'CALIDAD';
  label: string;
}

function SeccionAsignacionCaja({ cajaId, rol, label }: SeccionAsignacionCajaProps) {
  const queryClient = useQueryClient();
  const isCalidad = rol === 'CALIDAD';
  const currentUser = useAuthStore((state) => state.user);

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
    queryFn: () => usersApi.byRol(rol, { sede: currentUser?.sede }).then((res) => res.data),
    enabled: cajaId > 0,
  });

  // Para TÉCNICA: usuarios seleccionados para asignar
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Para CALIDAD: asignar por rango de cajas
  const [rangoInicio, setRangoInicio] = useState('');
  const [rangoFin, setRangoFin] = useState('');
  const [rangoUsuarios, setRangoUsuarios] = useState<Set<number>>(new Set());
  const [rangoError, setRangoError] = useState<string | null>(null);

  useEffect(() => {
    if (asignadosQuery.data) {
      setSelected(new Set(asignadosQuery.data.map((usuario) => usuario.id)));
    }
  }, [asignadosQuery.data]);

  const asignarMutation = useMutation({
    mutationFn: (data: AsignacionCajaInput) =>
      rol === 'TECNICA'
        ? asignacionCajaTecnicaApi.asignar(data)
        : asignacionCajaCalidadApi.asignar(data),
    onSuccess: () => {
      toast.success('Asignación guardada correctamente');
      setSelected(new Set());
      void invalidateDomain(queryClient, 'users');
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (usuarios: number[]) =>
      rol === 'TECNICA'
        ? asignacionCajaTecnicaApi.eliminar(cajaId, usuarios)
        : asignacionCajaCalidadApi.eliminar(cajaId, usuarios),
    onSuccess: () => {
      toast.success('Usuarios eliminados correctamente');
      void invalidateDomain(queryClient, 'users');
    },
  });

  const rangoMutation = useMutation({
    mutationFn: (data: AsignacionCajaRangoInput) => asignacionCajaCalidadApi.asignarRango(data),
    onSuccess: () => {
      toast.success('Rango asignado correctamente');
      setRangoInicio('');
      setRangoFin('');
      setRangoUsuarios(new Set());
      setRangoError(null);
      void invalidateDomain(queryClient, 'users');
    },
  });

  const asignadosIds = new Set((asignadosQuery.data ?? []).map((usuario) => usuario.id));
  const asignadosMap = new Map((asignadosQuery.data ?? []).map((usuario) => [usuario.id, usuario]));
  const usuarios = disponiblesQuery.data ?? [];
  const loading = asignadosQuery.isPending || disponiblesQuery.isPending;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
    if (selected.size === 0) {
      toast.error('Selecciona al menos un usuario para asignar');
      return;
    }
    const toAdd = usuarios
      .filter((usuario) => selected.has(usuario.id) && !asignadosIds.has(usuario.id))
      .map((usuario) => usuario.id);
    if (toAdd.length === 0) {
      toast.info('No hay usuarios nuevos por asignar');
      return;
    }
    asignarMutation.mutate({ modulo_id: cajaId, usuarios: toAdd });
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
    if (validCaja(rangoInicio) !== null || validCaja(rangoFin) !== null) {
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
        <h3 className="text-sm font-semibold text-silver-800">{label}</h3>
        <Badge color={isCalidad ? 'green' : 'blue'}>
          {asignadosQuery.data?.length ?? 0} asignados
        </Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <LoadingState message="Estamos consultando la información…" />
        </div>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
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
                {!isCalidad && isAssigned && asignadosMap.get(usuario.id)?.ultimo_upd && (
                  <p className="ml-7 mt-0.5 text-xs text-silver-500">
                    Último: {asignadosMap.get(usuario.id)?.ultimo_upd}
                  </p>
                )}
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
        <form onSubmit={handleAsignarRango} className="mt-4 space-y-3 border-t border-silver-100 pt-4">
          <h4 className="text-sm font-semibold text-silver-700">Asignar por rango</h4>
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
          <div className="max-h-40 overflow-y-auto rounded-lg border border-silver-200 p-2">
            {usuarios.map((usuario) => (
              <label
                key={usuario.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-silver-50"
              >
                <input
                  type="checkbox"
                  checked={rangoUsuarios.has(usuario.id)}
                  onChange={() => toggleRango(usuario.id)}
                />
                <span className="text-silver-700">{usuario.nombre}</span>
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

  // Usuarios asignados a la caja (para Mostrar Detalles)
  const usuariosAsignadosQuery = useQuery({
    queryKey: ['modulos-caja', 'usuarios', cajaId, 'all'],
    queryFn: async () => {
      if (!cajaId) return { tecnica: [], calidad: [] };
      const [tecnica, calidad] = await Promise.all([
        modulosCajaApi.usuariosTecnica(cajaId).then((r) => r.data),
        modulosCajaApi.usuariosCalidad(cajaId).then((r) => r.data),
      ]);
      return { tecnica, calidad };
    },
    enabled: Boolean(cajaId),
  });

  const [detallesOpen, setDetallesOpen] = useState(false);

  const cambiarEstadoMutation = useMutation({
    mutationFn: (estado: string) => modulosCajaApi.cambiarEstado(mid as string, estado),
    onSuccess: () => {
      toast.success('Estado de la caja actualizado');
      void invalidateDomain(queryClient, 'modulos-caja');
    },
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
        backTo={`/clientes/${id}/actas`}
        backLabel="Actas"
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
                  <Link to={`/cajas/${mid}/datos`} state={{ from: `/clientes/${id}/actas/${mid}/cajas` }}>
                    <Button>
                      <ClipboardList className="size-4" /> Ir a Digitación
                    </Button>
                  </Link>
                  <Link to={`/cajas/${mid}/revision`} state={{ from: `/clientes/${id}/actas/${mid}/cajas` }}>
                    <Button variant="secondary">
                      <Eye className="size-4" /> Ver Revisión
                    </Button>
                  </Link>
                </>
              )}
              {isManager && (
                <>
                  <Link to={`/cajas/${mid}/datos`} state={{ from: `/clientes/${id}/actas/${mid}/cajas` }}>
                    <Button variant="secondary">
                      <ClipboardList className="size-4" /> Ver FUIDs
                    </Button>
                  </Link>
                  <Link to={`/cajas/${mid}/revision`} state={{ from: `/clientes/${id}/actas/${mid}/cajas` }}>
                    <Button variant="secondary">
                      <Eye className="size-4" /> Ver Revisión
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => setDetallesOpen(true)}
                  >
                    <FileText className="size-4" /> Mostrar Detalles
                  </Button>
                </>
              )}
              {rol === 'CALIDAD' && (
                <>
                  <Link to={`/cajas/${mid}/datos`} state={{ from: `/clientes/${id}/actas/${mid}/cajas` }}>
                    <Button variant="secondary">
                      <ClipboardList className="size-4" /> Ver FUIDs
                    </Button>
                  </Link>
                  <Link to={`/cajas/${mid}/revision`} state={{ from: `/clientes/${id}/actas/${mid}/cajas` }}>
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
            <LoadingState message="Estamos consultando la información…" />
          </div>
        </Card>
      ) : (
        caja && (
          <Card>
            <dl className="grid gap-4 text-sm md:grid-cols-3">
              <div>
                <dt className="font-medium text-silver-500">Entidad Remitente</dt>
                <dd className="mt-0.5 text-silver-800">{caja.entidad_remitente_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Entidad Productora</dt>
                <dd className="mt-0.5 text-silver-800">{caja.entidad_productora_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Acta de Transferencia</dt>
                <dd className="mt-0.5 text-silver-800">{caja.acta_trans_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Unidad Administrativa</dt>
                <dd className="mt-0.5 text-silver-800">{caja.unidad_administrativa_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Oficina Productora</dt>
                <dd className="mt-0.5 text-silver-800">{caja.oficina_productora_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Fecha de Transferencia</dt>
                <dd className="mt-0.5 text-silver-800">
                  {caja.fecha_trans_caja ? caja.fecha_trans_caja.slice(0, 10) : '—'}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-medium text-silver-500">Objeto</dt>
                <dd className="mt-0.5 text-silver-800">{caja.objeto_caja}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Creada</dt>
                <dd className="mt-0.5 text-silver-800">{caja.created_at ? caja.created_at.slice(0, 19).replace('T', ' ') : '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-silver-500">Actualizada</dt>
                <dd className="mt-0.5 text-silver-800">{caja.updated_at ? caja.updated_at.slice(0, 19).replace('T', ' ') : '—'}</dd>
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

      {/* Modal Mostrar Detalles */}
      <Modal
        open={detallesOpen}
        onClose={() => setDetallesOpen(false)}
        title={`Detalles de Caja ${caja?.caja_modulo ?? ''}`}
        size="lg"
      >
        <div className="space-y-6 p-2">
          {/* Encabezado resumen */}
          <div className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary-700 uppercase tracking-wider">Caja</p>
                <p className="text-2xl font-bold text-silver-900 font-mono">{caja?.caja_modulo ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-silver-500 uppercase tracking-wider">Estado</p>
                <Badge color={estadoColor} className="text-sm px-3 py-1">{estado || '—'}</Badge>
              </div>
            </div>
          </div>

          {/* Información principal */}
          <Card className="border-silver-200 shadow-sm">
            <div className="px-4 py-3 border-b border-silver-100">
              <h3 className="text-sm font-semibold text-silver-800 flex items-center gap-2">
                <FileText className="size-4 text-primary-600" />
                Información de la Caja
              </h3>
            </div>
            <div className="p-4">
              <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Entidad Remitente</dt>
                  <dd className="mt-0.5 text-silver-800 font-medium">{caja?.entidad_remitente_caja ?? '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Entidad Productora</dt>
                  <dd className="mt-0.5 text-silver-800 font-medium">{caja?.entidad_productora_caja ?? '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Unidad Administrativa</dt>
                  <dd className="mt-0.5 text-silver-800 font-medium">{caja?.unidad_administrativa_caja ?? '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Oficina Productora</dt>
                  <dd className="mt-0.5 text-silver-800 font-medium">{caja?.oficina_productora_caja ?? '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Fecha Transferencia</dt>
                  <dd className="mt-0.5 text-silver-800 font-medium">{caja?.fecha_trans_caja ? caja.fecha_trans_caja.slice(0, 10) : '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Acta de Transferencia</dt>
                  <dd className="mt-0.5 text-silver-800 font-medium font-mono">{caja?.acta_trans_caja ?? '—'}</dd>
                </div>
                <div className="md:col-span-2 lg:col-span-3 flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Objeto</dt>
                  <dd className="mt-0.5 text-silver-800">{caja?.objeto_caja ?? '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Creada</dt>
                  <dd className="mt-0.5 text-silver-800 font-mono text-sm">{caja?.created_at ? caja.created_at.slice(0, 19).replace('T', ' ') : '—'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs font-medium text-silver-500 uppercase tracking-wider">Actualizada</dt>
                  <dd className="mt-0.5 text-silver-800 font-mono text-sm">{caja?.updated_at ? caja.updated_at.slice(0, 19).replace('T', ' ') : '—'}</dd>
                </div>
              </dl>
            </div>
          </Card>

          {/* Roles asignados */}
          <Card className="border-silver-200 shadow-sm">
            <div className="px-4 py-3 border-b border-silver-100">
              <h3 className="text-sm font-semibold text-silver-800 flex items-center gap-2">
                <Users className="size-4 text-primary-600" />
                Roles Asignados
              </h3>
            </div>
            <div className="p-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Técnicos */}
                <div className="bg-silver-50 rounded-lg p-4 border border-silver-100">
                  <h4 className="font-medium text-silver-700 mb-3 flex items-center gap-2">
                    <Wrench className="size-4 text-blue-600" />
                    Técnicos
                  </h4>
                  {usuariosAsignadosQuery.data?.tecnica.length === 0 ? (
                    <p className="text-sm text-silver-500">Sin técnicos asignados</p>
                  ) : (
                    <ul className="space-y-2">
                      {usuariosAsignadosQuery.data?.tecnica.map((u) => (
                        <li key={u.id} className="flex flex-col gap-1 text-sm text-silver-700 bg-white px-3 py-2 rounded-lg border border-silver-200">
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-silver-400" />
                            <span>{u.nombre}</span>
                            <span className="text-xs text-silver-400 px-2 py-0.5 rounded-full bg-silver-100">{u.sede}</span>
                          </div>
                          {u.ultimo_upd ? (
                            <span className="text-xs text-silver-500 font-mono">Último UPD: {u.ultimo_upd}</span>
                          ) : (
                            <span className="text-xs text-silver-400">Sin registros aún</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Calidad */}
                <div className="bg-silver-50 rounded-lg p-4 border border-silver-100">
                  <h4 className="font-medium text-silver-700 mb-3 flex items-center gap-2">
                    <ShieldCheck className="size-4 text-green-600" />
                    Calidad
                  </h4>
                  {usuariosAsignadosQuery.data?.calidad.length === 0 ? (
                    <p className="text-sm text-silver-500">Sin usuarios de calidad asignados</p>
                  ) : (
                    <ul className="space-y-2">
                      {usuariosAsignadosQuery.data?.calidad.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 text-sm text-silver-700 bg-white px-3 py-2 rounded-lg border border-silver-200">
                          <User className="size-4 text-silver-400" />
                          <span>{u.nombre}</span>
                          <span className="text-xs text-silver-400 px-2 py-0.5 rounded-full bg-silver-100">{u.sede}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </Modal>
    </div>
  );
}
