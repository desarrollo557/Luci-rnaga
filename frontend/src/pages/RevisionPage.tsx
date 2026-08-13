import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Table,
  type Column,
} from '@/components/ui';
import { fuidApi, getApiErrorMessage, modulosCajaApi, plantillaApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { FuidDato } from '@/types';

const PAGE_SIZE = 25;

const EDITABLE_ROLES = ['LIDER', 'ADMIN', 'TECNICA'] as const;

function FieldValue({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-silver-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-silver-800">{value ?? '—'}</dd>
    </div>
  );
}

function Seccion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-silver-200 bg-silver-50 p-4">
      <h3 className="text-sm font-semibold text-silver-800">{title}</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function FuidFields({ registro }: { registro: FuidDato }) {
  return (
    <>
      <Seccion title="Identificación">
        <FieldValue label="Fecha del Dato" value={registro.fecha_del_dato?.slice(0, 10)} />
        <FieldValue label="N° Orden" value={registro.n_orden} />
        <FieldValue label="Código" value={registro.codigo} />
        <FieldValue label="Entidad Remitente" value={registro.entidad_remitente} />
        <FieldValue label="Entidad Productora" value={registro.entidad_productora} />
      </Seccion>

      <Seccion title="Procedencia">
        <FieldValue label="Unidad Administrativa" value={registro.unidad_administrativa} />
        <FieldValue label="Oficina Productora" value={registro.oficina_productora} />
        <FieldValue label="Objeto" value={registro.objeto} />
        <FieldValue label="Serie" value={registro.serie} />
        <FieldValue label="Subserie" value={registro.subserie} />
        <FieldValue label="N° Orden Interno" value={registro.numero_de_orden_interno} />
        <FieldValue label="Accionado Procesado" value={registro.accionado_procesado} />
        <FieldValue label="Accionado Denunciante" value={registro.accionado_denunciante} />
        <FieldValue label="Identificación" value={registro.identificacion} />
      </Seccion>

      <Seccion title="Documento">
        <FieldValue label="Asunto" value={registro.asunto} />
        <FieldValue label="Radicado" value={registro.radicado} />
        <FieldValue label="N° Documento" value={registro.numero_doc} />
        <FieldValue label="N° Documento Hasta" value={registro.numero_doc_hasta} />
        <FieldValue label="Fecha Inicial" value={registro.fecha_inicial?.slice(0, 10)} />
        <FieldValue label="Fecha Final" value={registro.fecha_final?.slice(0, 10)} />
      </Seccion>

      <Seccion title="Caja">
        <FieldValue label="Caja" value={registro.caja} />
        <FieldValue label="UPD" value={registro.upd} />
        <FieldValue label="Tomo" value={registro.tomo} />
        <FieldValue label="Otro" value={registro.otro} />
        <FieldValue label="Caja Interna" value={registro.caja_interna} />
        <FieldValue label="Folios" value={registro.folios} />
        <FieldValue label="Soporte" value={registro.soporte} />
        <FieldValue label="Frecuencia" value={registro.frecuencia} />
        <FieldValue label="Elaborado Por" value={registro.elaborado_por} />
        <FieldValue label="N° Acta Transferible" value={registro.nro_acta_transferible} />
        <FieldValue label="Fecha Transferencia" value={registro.fecha_transferencia?.slice(0, 10)} />
        <FieldValue label="Notas" value={registro.notas} />
        <FieldValue label="Sede" value={registro.sede} />
        <FieldValue label="Tiempo" value={registro.tiempo} />
        <FieldValue label="Asunto 2" value={registro.asunto_2} />
        <FieldValue label="Asunto 3" value={registro.asunto_3} />
      </Seccion>
    </>
  );
}

interface RevisionModalProps {
  open: boolean;
  registro: FuidDato | null;
  onClose: () => void;
}

function RevisionModal({ open, registro, onClose }: RevisionModalProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canAprobar = EDITABLE_ROLES.some((rol) => rol === user?.rol);
  const [confirmado, setConfirmado] = useState(false);

  const aprobado = registro?.historial_y_cambios === 'OK';

  useEffect(() => {
    setConfirmado(false);
  }, [registro]);

  const aprobarMutation = useMutation({
    mutationFn: (ids: number[]) => fuidApi.marcarOk(ids),
    onSuccess: () => {
      toast.success('Registro marcado como revisado');
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['fuiddatosreal', 'list'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  if (!registro) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Revisión — ${registro.upd ? `UPD ${registro.upd}` : `Registro #${registro.id}`}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={aprobarMutation.isPending}>
            Cerrar
          </Button>
          {canAprobar && !aprobado && (
            <Button
              onClick={() => aprobarMutation.mutate([registro.id])}
              loading={aprobarMutation.isPending}
              disabled={!confirmado}
            >
              <CheckCircle2 className="size-4" /> Guardar y aprobar
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {aprobado ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <Badge color="green">OK</Badge>
              <span className="text-sm font-medium text-emerald-800">Registro aprobado</span>
            </div>
            <p className="mt-1 text-sm text-emerald-700">
              Aprobado por {registro.cambio_calidad ?? '—'}
              {registro.sede_calidad ? ` · ${registro.sede_calidad}` : ''}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge color="gray">Pendiente</Badge>
            <span className="text-sm text-silver-500">Este registro aún no ha sido aprobado</span>
          </div>
        )}

        <FuidFields registro={registro} />

        {canAprobar && !aprobado && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-silver-200 bg-silver-50 p-3 text-sm text-silver-700">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(event) => setConfirmado(event.target.checked)}
            />
            <span>Marcar como revisado</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

export default function RevisionPage() {
  const queryClient = useQueryClient();
  const { cajaId } = useParams<{ cajaId: string }>();
  const user = useAuthStore((state) => state.user);
  const canMarcarOk = EDITABLE_ROLES.some((rol) => rol === user?.rol);

  const [revisionTarget, setRevisionTarget] = useState<FuidDato | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [entidadFiltro, setEntidadFiltro] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const cajaQuery = useQuery({
    queryKey: ['modulos-caja', 'detalle', cajaId],
    queryFn: () => modulosCajaApi.get(cajaId as string).then((res) => res.data),
    enabled: Boolean(cajaId),
  });

  const cajaCode = cajaQuery.data?.caja_modulo ?? cajaId ?? '';

  const fuidQuery = useQuery({
    queryKey: ['fuiddatosreal', 'list'],
    queryFn: () => fuidApi.list().then((res) => res.data),
  });

  const filtered = useMemo(() => {
    const term = entidadFiltro.trim().toLowerCase();
    return (fuidQuery.data ?? []).filter((registro) => {
      if (registro.caja !== cajaCode) return false;
      if (term && !(registro.entidad_remitente ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [fuidQuery.data, cajaCode, entidadFiltro]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const currentPage = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [entidadFiltro, cajaCode]);

  const marcarOkMutation = useMutation({
    mutationFn: (ids: number[]) => fuidApi.marcarOk(ids),
    onSuccess: () => {
      toast.success('Registros marcados como revisados');
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ['fuiddatosreal', 'list'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const handleMarcarSeleccionados = () => {
    if (selectedIds.size === 0) return;
    marcarOkMutation.mutate([...selectedIds]);
  };

  const pageIds = currentPage.map((registro) => registro.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleExportar = async () => {
    if (exporting || !cajaCode) return;
    setExporting(true);
    try {
      const response = await plantillaApi.generar(`plantilla_${cajaCode}`, {
        caja: cajaCode,
        ...(entidadFiltro.trim() ? { entidad_remitente: entidadFiltro.trim() } : {}),
      });
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `plantilla_${cajaCode}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Plantilla exportada correctamente');
    } catch (error) {
      let message = 'Error al exportar la plantilla';
      if (axios.isAxiosError<Blob>(error)) {
        const status = error.response?.status;
        if (status === 404 && error.response?.data) {
          try {
            const text = await error.response.data.text();
            const parsed = JSON.parse(text) as { error?: string; message?: string };
            message = parsed.error ?? parsed.message ?? 'No se encontraron datos para exportar';
          } catch {
            message = 'No se encontraron datos para exportar';
          }
        }
      }
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const renderEstado = (registro: FuidDato) => {
    const estado = registro.historial_y_cambios;
    if (estado === 'OK') return <Badge color="green">OK</Badge>;
    if (estado) return <Badge color="amber">{estado}</Badge>;
    return <Badge color="gray">Pendiente</Badge>;
  };

  const columns: Column<FuidDato>[] = [
    { key: 'n_orden', header: 'N°', render: (registro: FuidDato) => registro.n_orden ?? '—' },
    { key: 'upd', header: 'UPD' },
    { key: 'codigo', header: 'Código' },
    { key: 'entidad_remitente', header: 'Entidad Remitente' },
    { key: 'entidad_productora', header: 'Entidad Productora' },
    { key: 'serie', header: 'Serie' },
    { key: 'asunto', header: 'Asunto' },
    {
      key: 'fechas',
      header: 'Fechas',
      render: (registro: FuidDato) => {
        const inicial = registro.fecha_inicial?.slice(0, 10);
        const final = registro.fecha_final?.slice(0, 10);
        if (!inicial && !final) return '—';
        return `${inicial ?? '?'} – ${final ?? '?'}`;
      },
    },
    { key: 'caja', header: 'Caja' },
    { key: 'estado', header: 'Estado', render: renderEstado },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (registro: FuidDato) => (
        <Button variant="secondary" size="sm" onClick={() => setRevisionTarget(registro)}>
          <Eye className="size-4" /> Revisar
        </Button>
      ),
    },
  ];

  if (canMarcarOk) {
    columns.unshift({
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={togglePage}
          aria-label="Seleccionar registros de esta página"
        />
      ),
      render: (registro: FuidDato) => (
        <input
          type="checkbox"
          checked={selectedIds.has(registro.id)}
          onChange={() => toggleRow(registro.id)}
          aria-label={`Seleccionar registro ${registro.n_orden ?? registro.id}`}
        />
      ),
    });
  }

  const loading = fuidQuery.isPending || cajaQuery.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Revisión de Calidad — Caja ${cajaCode}`}
        description="Clientes / Actas / Cajas / Revisión"
        actions={
          <>
            <Input
              placeholder="Filtrar por entidad remitente"
              value={entidadFiltro}
              onChange={(event) => setEntidadFiltro(event.target.value)}
              className="w-56"
              aria-label="Filtrar por entidad remitente"
            />
            <Button
              variant="secondary"
              onClick={() => void handleExportar()}
              loading={exporting}
              disabled={loading || !cajaCode}
            >
              <FileDown className="size-4" /> Exportar Excel
            </Button>
            {canMarcarOk && (
              <Button
                onClick={handleMarcarSeleccionados}
                loading={marcarOkMutation.isPending}
                disabled={selectedIds.size === 0}
              >
                <CheckCircle2 className="size-4" />
                Marcar seleccionados como revisados
                {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <Card>
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-primary-600" />
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12">
          <p className="text-sm text-silver-500">No hay registros para revisar en esta caja</p>
        </Card>
      ) : (
        <>
          <Table columns={columns} data={currentPage} rowKey={(registro) => registro.id} />

          <div className="flex items-center justify-between">
            <p className="text-sm text-silver-500">
              Página {safePage} de {totalPages} · {filtered.length} registros
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="size-4" /> Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Siguiente <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <RevisionModal
        open={revisionTarget !== null}
        registro={revisionTarget}
        onClose={() => setRevisionTarget(null)}
      />
    </div>
  );
}
