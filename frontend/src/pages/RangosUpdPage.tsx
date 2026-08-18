import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, CheckCircle2, Hash, List } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  PageHeader,
  Select,
  Table,
  type BadgeColor,
  type Column,
} from '@/components/ui';
import { rangosUpdApi, subModulosApi, usersApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import type { AvanceRow, AssignRangePayload, RangoUpdEstado, RangoUpdListRow } from '@/types';

/** Formato del UPD: UPD + exactamente 7 dígitos (mismo contrato que el backend). */
const UPD_REGEX = /^UPD\d{7}$/;

function normalizeUpd(value: string): string {
  return value.trim().toUpperCase();
}

function validUpd(value: string): string | null {
  if (value.trim() === '') return 'El UPD es requerido';
  return UPD_REGEX.test(normalizeUpd(value))
    ? null
    : 'Formato inválido: debe ser UPD + 7 dígitos (ej. UPD2950001)';
}

function updToNumber(value: string): number {
  return Number(normalizeUpd(value).slice(3));
}

/** Barra de progreso compacta (mismo patrón visual que ProduccionPage). */
function Barra({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-silver-100">
      <div className={cn('h-full rounded-full transition-all', 'bg-primary-600')} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

/** Badge de estado de rango: activo = verde, agotado = amarillo, revocado = rojo. */
const ESTADO_BADGE: Record<RangoUpdEstado, { color: BadgeColor; label: string }> = {
  activo: { color: 'green', label: 'Activo' },
  agotado: { color: 'amber', label: 'Agotado' },
  revocado: { color: 'red', label: 'Revocado' },
};

export default function RangosUpdPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  // Formulario de asignación (Selects trabajan con string; el payload espera number).
  const [usuarioId, setUsuarioId] = useState('');
  const [subModuloId, setSubModuloId] = useState('');
  const [updInicio, setUpdInicio] = useState('');
  const [updFin, setUpdFin] = useState('');

  // Filtro opcional del avance por sub-módulo ('' = todos).
  const [avanceSubModulo, setAvanceSubModulo] = useState('');

  // Filtro opcional del listado por estado ('' = todos).
  const [listEstado, setListEstado] = useState('');
  // Rango candidato a revocar (ConfirmDialog).
  const [revocarTarget, setRevocarTarget] = useState<RangoUpdListRow | null>(null);

  // Técnicos de la sede del líder logueado: GET /api/usuarios/TECNICA?sede=...
  // (mismo patrón que CajasPage.SeccionAsignacionCaja).
  const tecnicosQuery = useQuery({
    queryKey: ['users', 'rol', 'TECNICA', user?.sede],
    queryFn: () => usersApi.byRol('TECNICA', { sede: user?.sede }).then((res) => res.data),
  });

  // Sub-módulos disponibles: GET /api/sub_modulos (mismo patrón que ClientesPage).
  const subModulosQuery = useQuery({
    queryKey: ['sub-modulos'],
    queryFn: () => subModulosApi.list().then((res) => res.data),
  });

  const avanceQuery = useQuery({
    queryKey: ['rangos-upd', 'avance', avanceSubModulo || undefined],
    queryFn: () =>
      rangosUpdApi
        .avanceRangosUpd(avanceSubModulo ? Number(avanceSubModulo) : undefined)
        .then((res) => res.data),
  });

  // Lista de rangos asignados (GET /api/rangos-upd), con filtro opcional por estado.
  // El backend aplica el scoping por rol: LIDER ve solo sus asignaciones, ADMIN todas.
  const listaQuery = useQuery({
    queryKey: ['rangos-upd', 'list', listEstado || undefined],
    queryFn: () =>
      rangosUpdApi
        .listarRangos(listEstado ? { estado: listEstado as RangoUpdEstado | 'all' } : undefined)
        .then((res) => res.data),
  });

  const revocarMutation = useMutation({
    mutationFn: (id: number) => rangosUpdApi.revocarRango(id),
    onSuccess: () => {
      toast.success('Rango revocado correctamente');
      setRevocarTarget(null);
      // El listado cambia de estado y el avance excluye revocados: invalidar ambos.
      void queryClient.invalidateQueries({ queryKey: ['rangos-upd', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['rangos-upd', 'avance'] });
    },
  });

  // ── Pre-check del rango candidato (GET /api/rangos-upd/check) ──────────────
  // Se dispara automáticamente cuando el formulario está completo y válido.
  // Regla de producto: usado[] o overlap => rechazo duro, no se puede asignar.
  const updInicioNormalized = normalizeUpd(updInicio);
  const updFinNormalized = normalizeUpd(updFin);
  const inicioValido = validUpd(updInicio) === null;
  const finValido = validUpd(updFin) === null;
  const ordenValido = inicioValido && finValido && updToNumber(updInicio) <= updToNumber(updFin);
  const formCompleto = usuarioId !== '' && subModuloId !== '';
  const canCheck = formCompleto && inicioValido && finValido && ordenValido;

  const checkQuery = useQuery({
    queryKey: ['rangos-upd', 'check', usuarioId, subModuloId, updInicioNormalized, updFinNormalized],
    queryFn: () =>
      rangosUpdApi
        .checkRango({
          usuario_id: Number(usuarioId),
          sub_modulo_id: Number(subModuloId),
          upd_inicio: updInicioNormalized,
          upd_fin: updFinNormalized,
        })
        .then((res) => res.data),
    enabled: canCheck,
    retry: false,
  });

  const checkData = checkQuery.data;
  const checkBlocked = checkData ? checkData.used.length > 0 || checkData.overlap.length > 0 : false;
  // Asignar solo se habilita con un pre-check exitoso y vigente.
  const asignarDisabled = !canCheck || checkQuery.isFetching || !checkData || checkBlocked;

  const asignarMutation = useMutation({
    mutationFn: (payload: AssignRangePayload) => rangosUpdApi.asignarRango(payload),
    onSuccess: () => {
      toast.success('Rango asignado correctamente');
      setUpdInicio('');
      setUpdFin('');
      setFormCompletoReset();
      void queryClient.invalidateQueries({ queryKey: ['rangos-upd', 'avance'] });
    },
  });

  function setFormCompletoReset() {
    setUsuarioId('');
    setSubModuloId('');
  }

  const liveInicioError = updInicio.trim() === '' ? undefined : validUpd(updInicio) ?? undefined;
  const liveFinError = updFin.trim() === '' ? undefined : validUpd(updFin) ?? undefined;
  const ordenError =
    inicioValido && finValido && updToNumber(updInicio) > updToNumber(updFin)
      ? 'upd_fin no puede ser menor que upd_inicio'
      : undefined;

  const handleAsignar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (asignarDisabled) return;
    if (usuarioId === '') {
      toast.error('Selecciona un técnico');
      return;
    }
    if (subModuloId === '') {
      toast.error('Selecciona un sub-módulo');
      return;
    }
    if (liveInicioError || liveFinError || ordenError) return;
    asignarMutation.mutate({
      usuario_id: Number(usuarioId),
      sub_modulo_id: Number(subModuloId),
      upd_inicio: updInicioNormalized,
      upd_fin: updFinNormalized,
    });
  };

  const avanceColumns: Column<AvanceRow>[] = [
    { key: 'nombre', header: 'Técnico' },
    {
      key: 'total_asignadas',
      header: 'Total asignadas',
      render: (row) => row.total_asignadas.toLocaleString('es-CO'),
    },
    {
      key: 'finalizadas',
      header: 'Finalizadas',
      render: (row) => row.finalizadas.toLocaleString('es-CO'),
    },
    {
      key: 'pendientes',
      header: 'Por finalizar',
      render: (row) => (
        <Badge color={row.pendientes > 0 ? 'amber' : 'green'}>
          {row.pendientes.toLocaleString('es-CO')}
        </Badge>
      ),
    },
    {
      key: 'porcentaje',
      header: 'Avance',
      render: (row) => (
        <div className="flex min-w-40 items-center gap-2">
          <div className="flex-1">
            <Barra valor={row.finalizadas} max={row.total_asignadas} />
          </div>
          <span className="w-10 shrink-0 text-right font-semibold text-silver-800">{row.porcentaje}%</span>
        </div>
      ),
    },
  ];

  const tecnicosPlaceholder = tecnicosQuery.isPending ? 'Cargando técnicos…' : 'Seleccione un técnico';
  const subModulosPlaceholder = subModulosQuery.isPending ? 'Cargando sub-módulos…' : 'Seleccione un sub-módulo';

  const listaColumns: Column<RangoUpdListRow>[] = [
    { key: 'tecnico_nombre', header: 'Técnico' },
    {
      key: 'sub_modulo',
      header: 'Sub-módulo',
      render: (row) => `${row.sub_modulo_codigo} — ${row.sub_modulo_entidad}`,
    },
    {
      key: 'rango',
      header: 'Rango',
      render: (row) => (
        <span className="font-mono text-xs">
          {row.upd_inicio} — {row.upd_fin}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (row) => {
        const badge = ESTADO_BADGE[row.estado];
        return <Badge color={badge.color}>{badge.label}</Badge>;
      },
    },
    {
      key: 'fecha_asignacion',
      header: 'Fecha asignación',
      render: (row) => (row.fecha_asignacion ? row.fecha_asignacion.slice(0, 10) : '—'),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (row) =>
        row.estado === 'activo' ? (
          <Button variant="danger" size="sm" onClick={() => setRevocarTarget(row)}>
            Revocar
          </Button>
        ) : (
          <span className="text-silver-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rangos UPD"
        description="Asignación de rangos de UPD por técnico y sub-módulo, con avance de consumo por técnico"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Asignar rango */}
        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-silver-800">
            <Hash className="size-4 text-primary-600" /> Asignar rango
          </h3>
          <p className="mb-4 text-sm text-silver-500">
            El rango se rechaza si contiene UPDs ya usadas o se solapa con otro rango activo del mismo
            técnico y sub-módulo.
          </p>

          <form onSubmit={handleAsignar} className="space-y-4">
            <Select
              label="Técnico"
              placeholder={tecnicosPlaceholder}
              options={(tecnicosQuery.data ?? []).map((tecnico) => ({
                value: String(tecnico.id),
                label: tecnico.nombre,
              }))}
              value={usuarioId}
              onChange={setUsuarioId}
              required
            />

            <Select
              label="Sub-módulo"
              placeholder={subModulosPlaceholder}
              options={(subModulosQuery.data ?? []).map((sm) => ({
                value: String(sm.id),
                label: `${sm.codigo} — ${sm.entidad_remitente}`,
              }))}
              value={subModuloId}
              onChange={setSubModuloId}
              required
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="UPD inicio"
                value={updInicio}
                onChange={(event) => setUpdInicio(event.target.value)}
                placeholder="UPD2950001"
                error={liveInicioError}
              />
              <Input
                label="UPD fin"
                value={updFin}
                onChange={(event) => setUpdFin(event.target.value)}
                placeholder="UPD2950500"
                error={liveFinError ?? ordenError}
              />
            </div>

            {canCheck && checkQuery.isFetching && (
              <p className="text-sm text-silver-500">Verificando rango…</p>
            )}

            {canCheck && checkData && checkBlocked && (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                {checkData.used.length > 0 && (
                  <p className="flex items-start gap-2 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Este rango contiene UPDs ya usadas: {checkData.used.join(', ')}. Debes elegir otro
                      rollo.
                    </span>
                  </p>
                )}
                {checkData.overlap.length > 0 && (
                  <p className="flex items-start gap-2 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      El rango se solapa con un rango ya asignado al técnico y sub-módulo seleccionados.
                    </span>
                  </p>
                )}
              </div>
            )}

            {canCheck && checkData && !checkBlocked && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>El rango está libre y puede asignarse.</span>
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void checkQuery.refetch()}
                disabled={!canCheck || checkQuery.isFetching}
              >
                Verificar rango
              </Button>
              <Button type="submit" loading={asignarMutation.isPending} disabled={asignarDisabled}>
                Asignar rango
              </Button>
            </div>
          </form>
        </Card>

        {/* Avance por técnico */}
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-silver-800">
              <BarChart3 className="size-4 text-primary-600" /> Avance por técnico
            </h3>
            <Select
              className="w-56"
              placeholder="Todos los sub-módulos"
              options={(subModulosQuery.data ?? []).map((sm) => ({
                value: String(sm.id),
                label: `${sm.codigo} — ${sm.entidad_remitente}`,
              }))}
              value={avanceSubModulo}
              onChange={setAvanceSubModulo}
            />
          </div>
          <Table
            columns={avanceColumns}
            data={avanceQuery.data?.por_tecnico ?? []}
            rowKey={(row) => row.usuario_id}
            loading={avanceQuery.isPending}
            emptyMessage="Aún no hay rangos asignados para mostrar."
          />
        </Card>
      </div>

      {/* Lista de rangos asignados (con revocación) */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-silver-800">
            <List className="size-4 text-primary-600" /> Lista de rangos
          </h3>
          <Select
            className="w-56"
            placeholder="Todos los estados"
            options={[
              { value: 'activo', label: 'Activos' },
              { value: 'agotado', label: 'Agotados' },
              { value: 'revocado', label: 'Revocados' },
            ]}
            value={listEstado}
            onChange={setListEstado}
          />
        </div>
        <Table
          columns={listaColumns}
          data={listaQuery.data?.rangos ?? []}
          rowKey={(row) => row.id}
          loading={listaQuery.isPending}
          emptyMessage="No hay rangos asignados."
        />
      </Card>

      <ConfirmDialog
        open={revocarTarget !== null}
        title="Revocar rango"
        description={
          revocarTarget
            ? `¿Estás seguro de que deseas revocar el rango ${revocarTarget.upd_inicio} — ${revocarTarget.upd_fin} de ${revocarTarget.tecnico_nombre}? Dejará de usarse para asignar y validar UPDs.`
            : undefined
        }
        confirmLabel="Revocar"
        loading={revocarMutation.isPending}
        onConfirm={() => {
          if (revocarTarget) revocarMutation.mutate(revocarTarget.id);
        }}
        onCancel={() => setRevocarTarget(null)}
      />
    </div>
  );
}
