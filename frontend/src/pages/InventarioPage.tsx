import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, DatePicker, Input, Modal, PageHeader, Select, Table, type Column } from '@/components/ui';
import { inventarioApi, getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { invalidateDomain } from '@/lib/queryInvalidation';
import type { DataRow, Inventario } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const ESTADOS_INVENTARIO = ['PENDIENTE', 'EN PROCESO', 'FINALIZADO'];
const ESTADOS_ENTREGA = ['PENDIENTE', 'EN PROCESO', 'ENTREGADO'];

type InventarioForm = Record<string, string>;

function emptyForm(): InventarioForm {
  return {
    CODIGO_DEL_CLIENTE: '',
    CLIENTE: '',
    No_ACTA: '',
    FECHA_TRANSFERENCIA: '',
    X200: '',
    X300: '',
    X400: '',
    NC: '',
    TOTAL_CAJAS: '',
    ANEXOS: '',
    FECHA_ENTREGA_CUSTODIA: '',
    FUNCIONARIO: '',
    ESTADO_DEL_INVENTARIO: 'PENDIENTE',
    CAJAS_PROCESADAS: '',
    CAJA_INICIAR: '',
    CAJ_FIN: '',
    REGISTROS_PROCESADOS: '',
    FECHA_ENTREGA: '',
    INICIO_INVENTARIO: '',
    FIN_INVENTARIO: '',
    ESTADO_ENTREGA: 'PENDIENTE',
    MES_ENTREGA_PACA: '',
  };
}

function toForm(row: Inventario): InventarioForm {
  return {
    CODIGO_DEL_CLIENTE: row.CODIGO_DEL_CLIENTE ?? '',
    CLIENTE: row.CLIENTE ?? '',
    No_ACTA: row.No_ACTA ?? '',
    FECHA_TRANSFERENCIA: row.FECHA_TRANSFERENCIA ?? '',
    X200: row.X200 != null ? String(row.X200) : '',
    X300: row.X300 != null ? String(row.X300) : '',
    X400: row.X400 != null ? String(row.X400) : '',
    NC: row.NC != null ? String(row.NC) : '',
    TOTAL_CAJAS: row.TOTAL_CAJAS != null ? String(row.TOTAL_CAJAS) : '',
    ANEXOS: row.ANEXOS ?? '',
    FECHA_ENTREGA_CUSTODIA: row.FECHA_ENTREGA_CUSTODIA ?? '',
    FUNCIONARIO: row.FUNCIONARIO ?? '',
    ESTADO_DEL_INVENTARIO: row.ESTADO_DEL_INVENTARIO ?? 'PENDIENTE',
    CAJAS_PROCESADAS: row.CAJAS_PROCESADAS != null ? String(row.CAJAS_PROCESADAS) : '',
    CAJA_INICIAR: row.CAJA_INICIAR ?? '',
    CAJ_FIN: row.CAJ_FIN ?? '',
    REGISTROS_PROCESADOS: row.REGISTROS_PROCESADOS != null ? String(row.REGISTROS_PROCESADOS) : '',
    FECHA_ENTREGA: row.FECHA_ENTREGA ?? '',
    INICIO_INVENTARIO: row.INICIO_INVENTARIO ?? '',
    FIN_INVENTARIO: row.FIN_INVENTARIO ?? '',
    ESTADO_ENTREGA: row.ESTADO_ENTREGA ?? 'PENDIENTE',
    MES_ENTREGA_PACA: row.MES_ENTREGA_PACA ?? '',
  };
}

const PAGE_SIZE = 25;

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
        active
          ? 'border-primary-500 bg-primary-600 text-white shadow-sm shadow-primary-600/30'
          : 'border-silver-200 bg-silver-100 text-silver-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800',
      )}
    >
      {label}
    </button>
  );
}

export default function InventarioPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canEdit = user?.rol === 'LIDER' || user?.rol === 'ADMIN';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Inventario | null>(null);
  const [form, setForm] = useState<InventarioForm>(emptyForm());
  const [deleting, setDeleting] = useState<Inventario | null>(null);
  const [page, setPage] = useState(0);

  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [estadoEntrega, setEstadoEntrega] = useState('');
  const [funcionario, setFuncionario] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: async () => (await inventarioApi.list()).data,
    refetchInterval: 60_000,
  });

  const funcionarios = useMemo(
    () => Array.from(new Set(rows.map((r) => r.FUNCIONARIO).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const desdeT = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const hastaT = hasta ? new Date(`${hasta}T23:59:59.999`).getTime() : null;
    return rows.filter((row) => {
      if (query) {
        const campos = [
          row.CODIGO_DEL_CLIENTE,
          row.CLIENTE,
          row.No_ACTA,
          row.FUNCIONARIO,
          row.MES_ENTREGA_PACA,
          row.CAJA_INICIAR,
          row.CAJ_FIN,
          String(row.TOTAL_CAJAS ?? ''),
        ];
        if (!campos.some((campo) => String(campo ?? '').toLowerCase().includes(query))) return false;
      }
      if (estado && row.ESTADO_DEL_INVENTARIO !== estado) return false;
      if (estadoEntrega && row.ESTADO_ENTREGA !== estadoEntrega) return false;
      if (funcionario && row.FUNCIONARIO !== funcionario) return false;
      if (desdeT !== null || hastaT !== null) {
        const fecha = row.FECHA_TRANSFERENCIA ? new Date(row.FECHA_TRANSFERENCIA).getTime() : null;
        if (fecha === null) return false;
        if (desdeT !== null && fecha < desdeT) return false;
        if (hastaT !== null && fecha > hastaT) return false;
      }
      return true;
    });
  }, [rows, q, estado, estadoEntrega, funcionario, desde, hasta]);

  const hayFiltros = Boolean(q || estado || estadoEntrega || funcionario || desde || hasta);

  const limpiar = () => {
    setQ('');
    setEstado('');
    setEstadoEntrega('');
    setFuncionario('');
    setDesde('');
    setHasta('');
    setPage(0);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: number | null; data: DataRow }) => {
      if (payload.id == null) {
        return await inventarioApi.create(payload.data);
      }
      return await inventarioApi.update(payload.id, payload.data);
    },
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      const sync = resp.data?.sync;
      if (sync?.state === 'SUBIDO') {
        toast.success(editing ? 'Registro actualizado. Documento subido a WorkDrive' : 'Registro creado. Documento subido a WorkDrive');
      } else if (sync?.state === 'ERROR') {
        toast.error('Registro guardado, pero falló la subida a WorkDrive: ' + (sync.error ?? 'Error desconocido'));
      } else {
        toast.success(editing ? 'Registro actualizado correctamente' : 'Registro creado correctamente');
      }
      setModalOpen(false);
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await inventarioApi.remove(id);
    },
    onSuccess: async () => {
      void invalidateDomain(queryClient, 'inventario');
      toast.success('Registro eliminado');
      setDeleting(null);
    },
    onError: () => {
      toast.error('Error al eliminar el registro');
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => inventarioApi.sync(id),
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      const sync = resp.data.sync;
      if (sync.state === 'SUBIDO') {
        toast.success('Documento subido a WorkDrive');
      } else {
        toast.error('Error al subir: ' + (sync.error ?? 'desconocido'));
      }
    },
    onError: () => toast.error('Error al reintentar la subida a WorkDrive'),
  });

  const retrySync = (row: Inventario) => retryMutation.mutate(row.ITEMS);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (row: Inventario) => {
    setEditing(row);
    setForm(toForm(row));
    setModalOpen(true);
  };

  const handleSubmit = () => {
    const data: DataRow = { ...form };
    for (const key of Object.keys(data)) {
      if (data[key] === '') data[key] = null;
    }
    saveMutation.mutate({ id: editing?.ITEMS ?? null, data });
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const columns: Column<Inventario>[] = [
    { key: 'ITEMS', header: 'ID' },
    { key: 'CODIGO_DEL_CLIENTE', header: 'Código Cliente' },
    { key: 'CLIENTE', header: 'Cliente' },
    { key: 'No_ACTA', header: 'N° Acta' },
    {
      key: 'TOTAL_CAJAS',
      header: 'Total Cajas',
      render: (row) => <span>{row.TOTAL_CAJAS ?? '—'}</span>,
    },
    {
      key: 'CAJAS_PROCESADAS',
      header: 'Procesadas',
      render: (row) => <span>{row.CAJAS_PROCESADAS ?? '—'}</span>,
    },
    {
      key: 'ESTADO_DEL_INVENTARIO',
      header: 'Estado',
      render: (row) => {
        const estadoRow = row.ESTADO_DEL_INVENTARIO;
        const color = estadoRow === 'FINALIZADO' ? 'green' : estadoRow === 'EN PROCESO' ? 'amber' : 'gray';
        return <Badge color={color}>{estadoRow ?? 'PENDIENTE'}</Badge>;
      },
    },
    {
      key: 'ESTADO_ENTREGA',
      header: 'Entrega',
      render: (row) => {
        const estadoRow = row.ESTADO_ENTREGA;
        const color = estadoRow === 'ENTREGADO' ? 'green' : estadoRow === 'EN PROCESO' ? 'amber' : 'gray';
        return <Badge color={color}>{estadoRow ?? 'PENDIENTE'}</Badge>;
      },
    },
    {
      key: 'zoho',
      header: 'WorkDrive',
      render: (row) => {
        const state = row.ZOHO_SYNC_STATE ?? 'PENDIENTE';
        if (state === 'SUBIDO') {
          return <Badge color="green">Subido</Badge>;
        }
        if (state === 'ERROR') {
          return (
            <div className="flex items-center gap-1">
              <span title={row.ZOHO_SYNC_ERROR ?? undefined}>
                <Badge color="red">Error</Badge>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => retrySync(row)}
                aria-label="Reintentar subida a WorkDrive"
                className="text-silver-500 hover:text-primary-600"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          );
        }
        return <Badge color="gray">Pendiente</Badge>;
      },
    },
    ...(canEdit
      ? [
          {
            key: 'acciones',
            header: 'Acciones',
            render: (row: Inventario) => (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Editar">
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(row)}
                  className="text-red-600 hover:bg-red-50"
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ] as Column<Inventario>[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        description="Registro y seguimiento de inventarios por cliente"
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Nuevo Registro
            </Button>
          ) : undefined
        }
      />

      {/* Panel de filtros — diseño propio de Inventario */}
      <div className="rounded-2xl border border-silver-200 bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-silver-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por cliente, código, acta, funcionario, caja…"
            className="h-12 w-full rounded-xl border border-silver-300 bg-silver-50 pl-11 pr-4 text-sm text-silver-900 shadow-sm placeholder:text-silver-400 transition-all duration-200 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/20"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-silver-500">Estado:</span>
          <Chip label="Todos" active={estado === ''} onClick={() => setEstado('')} />
          {ESTADOS_INVENTARIO.map((e) => (
            <Chip key={e} label={e} active={estado === e} onClick={() => setEstado(e)} />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-silver-500">Entrega:</span>
          <Chip label="Todos" active={estadoEntrega === ''} onClick={() => setEstadoEntrega('')} />
          {ESTADOS_ENTREGA.map((e) => (
            <Chip key={e} label={e} active={estadoEntrega === e} onClick={() => setEstadoEntrega(e)} />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-silver-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Funcionario"
            placeholder="Todos"
            options={funcionarios.map((f) => ({ value: f, label: f }))}
            value={funcionario}
            onChange={(value) => {
              setFuncionario(value);
              setPage(0);
            }}
          />
          <DatePicker
            label="Desde (transferencia)"
            value={desde}
            onChange={(value) => {
              setDesde(value);
              setPage(0);
            }}
          />
          <DatePicker
            label="Hasta (transferencia)"
            value={hasta}
            onChange={(value) => {
              setHasta(value);
              setPage(0);
            }}
          />
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={limpiar}
              disabled={!hayFiltros}
              className="h-10 border border-silver-200 text-silver-600 hover:bg-silver-50 hover:text-silver-900"
            >
              <RotateCcw className="size-4" /> Limpiar
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-silver-100 pt-3 text-sm">
          <span className="font-medium text-silver-600">
            {filtered.length.toLocaleString('es-CO')} {filtered.length === 1 ? 'registro' : 'registros'}
            {hayFiltros && (
              <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">
                filtrado
              </span>
            )}
          </span>
        </div>
      </div>

      <Table
        columns={columns}
        data={pageRows}
        rowKey={(row) => row.ITEMS}
        loading={isLoading}
        emptyMessage={hayFiltros ? 'No se encontraron registros con esos filtros' : 'No hay inventario registrado'}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-silver-500">
            Página {page + 1} de {totalPages} ({filtered.length} registros)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Inventario #${editing.ITEMS}` : 'Nuevo Registro de Inventario'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={saveMutation.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-silver-500">Cliente</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Código del Cliente"
                value={form.CODIGO_DEL_CLIENTE}
                onChange={(e) => setForm({ ...form, CODIGO_DEL_CLIENTE: e.target.value })}
              />
              <Input
                label="Cliente"
                value={form.CLIENTE}
                onChange={(e) => setForm({ ...form, CLIENTE: e.target.value })}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-silver-500">Acta</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="N° Acta"
                value={form.No_ACTA}
                onChange={(e) => setForm({ ...form, No_ACTA: e.target.value })}
              />
              <DatePicker
                label="Fecha Transferencia"
                value={form.FECHA_TRANSFERENCIA}
                onChange={(value) => setForm({ ...form, FECHA_TRANSFERENCIA: value })}
              />
              <Input
                label="Anexos"
                value={form.ANEXOS}
                onChange={(e) => setForm({ ...form, ANEXOS: e.target.value })}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-silver-500">Cajas</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              <Input
                label="X200"
                type="number"
                value={form.X200}
                onChange={(e) => setForm({ ...form, X200: e.target.value })}
              />
              <Input
                label="X300"
                type="number"
                value={form.X300}
                onChange={(e) => setForm({ ...form, X300: e.target.value })}
              />
              <Input
                label="X400"
                type="number"
                value={form.X400}
                onChange={(e) => setForm({ ...form, X400: e.target.value })}
              />
              <Input
                label="NC"
                type="number"
                value={form.NC}
                onChange={(e) => setForm({ ...form, NC: e.target.value })}
              />
              <Input
                label="Total Cajas"
                type="number"
                value={form.TOTAL_CAJAS}
                onChange={(e) => setForm({ ...form, TOTAL_CAJAS: e.target.value })}
              />
              <Input
                label="Cajas Procesadas"
                type="number"
                value={form.CAJAS_PROCESADAS}
                onChange={(e) => setForm({ ...form, CAJAS_PROCESADAS: e.target.value })}
              />
              <Input
                label="Caja Iniciar"
                value={form.CAJA_INICIAR}
                onChange={(e) => setForm({ ...form, CAJA_INICIAR: e.target.value })}
              />
              <Input
                label="Caja Fin"
                value={form.CAJ_FIN}
                onChange={(e) => setForm({ ...form, CAJ_FIN: e.target.value })}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-silver-500">Proceso</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <DatePicker
                label="Fecha Entrega Custodia"
                value={form.FECHA_ENTREGA_CUSTODIA}
                onChange={(value) => setForm({ ...form, FECHA_ENTREGA_CUSTODIA: value })}
              />
              <Input
                label="Funcionario"
                value={form.FUNCIONARIO}
                onChange={(e) => setForm({ ...form, FUNCIONARIO: e.target.value })}
              />
              <Select
                label="Estado del Inventario"
                options={ESTADOS_INVENTARIO.map((v) => ({ value: v, label: v }))}
                value={form.ESTADO_DEL_INVENTARIO}
                onChange={(value) => setForm({ ...form, ESTADO_DEL_INVENTARIO: value })}
              />
              <Input
                label="Registros Procesados"
                type="number"
                value={form.REGISTROS_PROCESADOS}
                onChange={(e) => setForm({ ...form, REGISTROS_PROCESADOS: e.target.value })}
              />
              <DatePicker
                label="Fecha Entrega"
                value={form.FECHA_ENTREGA}
                onChange={(value) => setForm({ ...form, FECHA_ENTREGA: value })}
              />
              <DatePicker
                label="Inicio Inventario"
                value={form.INICIO_INVENTARIO}
                onChange={(value) => setForm({ ...form, INICIO_INVENTARIO: value })}
              />
              <DatePicker
                label="Fin Inventario"
                value={form.FIN_INVENTARIO}
                onChange={(value) => setForm({ ...form, FIN_INVENTARIO: value })}
              />
              <Select
                label="Estado Entrega"
                options={ESTADOS_ENTREGA.map((v) => ({ value: v, label: v }))}
                value={form.ESTADO_ENTREGA}
                onChange={(value) => setForm({ ...form, ESTADO_ENTREGA: value })}
              />
              <Input
                label="Mes Entrega Paca"
                value={form.MES_ENTREGA_PACA}
                onChange={(e) => setForm({ ...form, MES_ENTREGA_PACA: e.target.value })}
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar registro"
        description={
          deleting
            ? `¿Está seguro de eliminar el registro de inventario #${deleting.ITEMS} (${deleting.CLIENTE ?? 'sin cliente'})? Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.ITEMS)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
