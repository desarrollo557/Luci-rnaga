import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
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
  Spinner,
  Table,
  type Column,
} from '@/components/ui';
import { fuidApi, getApiErrorMessage, modulosCajaApi } from '@/lib/api';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { required } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';
import { SUGGESTION_FIELDS, type DataRow, type FuidDato, type SessionUser } from '@/types';

type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

interface CheckUpdResponse {
  exists: boolean;
}

interface CajaDuplicateGroup {
  caja: string;
  total: number;
  ids: string;
}

interface CajaDuplicatesResponse {
  duplicates: CajaDuplicateGroup[];
}

interface FuidFormValues {
  fecha_del_dato: string;
  n_orden: string;
  codigo: string;
  entidad_remitente: string;
  entidad_productora: string;
  unidad_administrativa: string;
  oficina_productora: string;
  objeto: string;
  serie: string;
  subserie: string;
  numero_de_orden_interno: string;
  accionado_procesado: string;
  accionado_denunciante: string;
  identificacion: string;
  asunto: string;
  radicado: string;
  numero_doc: string;
  numero_doc_hasta: string;
  fecha_inicial: string;
  fecha_final: string;
  caja: string;
  upd: string;
  tomo: string;
  otro: string;
  caja_interna: string;
  folios: string;
  soporte: string;
  frecuencia: string;
  elaborado_por: string;
  nro_acta_transferible: string;
  fecha_transferencia: string;
  notas: string;
  sede: string;
  tiempo: string;
  asunto_2: string;
  asunto_3: string;
}

const EMPTY_FORM: FuidFormValues = {
  fecha_del_dato: '',
  n_orden: '',
  codigo: '',
  entidad_remitente: '',
  entidad_productora: '',
  unidad_administrativa: '',
  oficina_productora: '',
  objeto: '',
  serie: '',
  subserie: '',
  numero_de_orden_interno: '',
  accionado_procesado: '',
  accionado_denunciante: '',
  identificacion: '',
  asunto: '',
  radicado: '',
  numero_doc: '',
  numero_doc_hasta: '',
  fecha_inicial: '',
  fecha_final: '',
  caja: '',
  upd: '',
  tomo: '',
  otro: '',
  caja_interna: '',
  folios: '',
  soporte: '',
  frecuencia: '',
  elaborado_por: '',
  nro_acta_transferible: '',
  fecha_transferencia: '',
  notas: '',
  sede: '',
  tiempo: '',
  asunto_2: '',
  asunto_3: '',
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);
  return debounced;
}

function formFromRecord(record: FuidDato): FuidFormValues {
  return {
    fecha_del_dato: record.fecha_del_dato?.slice(0, 10) ?? '',
    n_orden: record.n_orden?.toString() ?? '',
    codigo: record.codigo ?? '',
    entidad_remitente: record.entidad_remitente ?? '',
    entidad_productora: record.entidad_productora ?? '',
    unidad_administrativa: record.unidad_administrativa ?? '',
    oficina_productora: record.oficina_productora ?? '',
    objeto: record.objeto ?? '',
    serie: record.serie ?? '',
    subserie: record.subserie ?? '',
    numero_de_orden_interno: record.numero_de_orden_interno ?? '',
    accionado_procesado: record.accionado_procesado ?? '',
    accionado_denunciante: record.accionado_denunciante ?? '',
    identificacion: record.identificacion ?? '',
    asunto: record.asunto ?? '',
    radicado: record.radicado ?? '',
    numero_doc: record.numero_doc ?? '',
    numero_doc_hasta: record.numero_doc_hasta ?? '',
    fecha_inicial: record.fecha_inicial?.slice(0, 10) ?? '',
    fecha_final: record.fecha_final?.slice(0, 10) ?? '',
    caja: record.caja ?? '',
    upd: record.upd ?? '',
    tomo: record.tomo ?? '',
    otro: record.otro ?? '',
    caja_interna: record.caja_interna ?? '',
    folios: record.folios ?? '',
    soporte: record.soporte ?? '',
    frecuencia: record.frecuencia ?? '',
    elaborado_por: record.elaborado_por ?? '',
    nro_acta_transferible: record.nro_acta_transferible ?? '',
    fecha_transferencia: record.fecha_transferencia?.slice(0, 10) ?? '',
    notas: record.notas ?? '',
    sede: record.sede ?? '',
    tiempo: record.tiempo ?? '',
    asunto_2: record.asunto_2 ?? '',
    asunto_3: record.asunto_3 ?? '',
  };
}

function emptyFormFor(cajaId: string, user: SessionUser | null, defaultNOrden: number): FuidFormValues {
  return {
    ...EMPTY_FORM,
    caja: cajaId,
    n_orden: String(defaultNOrden),
    elaborado_por: user ? `${user.nombre} (${user.cc})` : '',
    sede: user?.sede ?? '',
  };
}

function buildPayload(form: FuidFormValues, editing: FuidDato | null): DataRow {
  const text = (value: string): string | null => (value.trim() === '' ? null : value);
  const numero = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const payload: DataRow = {
    fecha_del_dato: text(form.fecha_del_dato),
    n_orden: numero(form.n_orden),
    codigo: text(form.codigo),
    entidad_remitente: text(form.entidad_remitente),
    entidad_productora: text(form.entidad_productora),
    unidad_administrativa: text(form.unidad_administrativa),
    oficina_productora: text(form.oficina_productora),
    objeto: text(form.objeto),
    serie: text(form.serie),
    subserie: text(form.subserie),
    numero_de_orden_interno: text(form.numero_de_orden_interno),
    accionado_procesado: text(form.accionado_procesado),
    accionado_denunciante: text(form.accionado_denunciante),
    identificacion: text(form.identificacion),
    asunto: text(form.asunto),
    radicado: text(form.radicado),
    numero_doc: text(form.numero_doc),
    numero_doc_hasta: text(form.numero_doc_hasta),
    fecha_inicial: text(form.fecha_inicial),
    fecha_final: text(form.fecha_final),
    caja: text(form.caja),
    upd: text(form.upd),
    tomo: text(form.tomo),
    otro: text(form.otro),
    caja_interna: text(form.caja_interna),
    folios: text(form.folios),
    soporte: text(form.soporte),
    frecuencia: text(form.frecuencia),
    elaborado_por: text(form.elaborado_por),
    nro_acta_transferible: text(form.nro_acta_transferible),
    fecha_transferencia: text(form.fecha_transferencia),
    notas: text(form.notas),
    sede: text(form.sede),
    tiempo: text(form.tiempo),
    asunto_2: text(form.asunto_2),
    asunto_3: text(form.asunto_3),
  };

  if (editing) {
    payload.historial_y_cambios = editing.historial_y_cambios;
    payload.cambio_calidad = editing.cambio_calidad;
    payload.sede_calidad = editing.sede_calidad;
  }

  return payload;
}

interface SuggestionInputProps {
  caja: string;
  campo: SuggestionField;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function SuggestionInput({ caja, campo, label, value, onChange }: SuggestionInputProps) {
  const debouncedQuery = useDebouncedValue(value, 300);
  const suggestionsQuery = useQuery({
    queryKey: ['fuiddatosreal', 'suggestions', caja, campo, debouncedQuery],
    queryFn: () =>
      fuidApi.suggestions(caja, campo, debouncedQuery).then((res) => res.data as unknown as string[]),
    enabled: Boolean(caja && debouncedQuery.trim().length >= 3),
  });

  return (
    <div className="w-full">
      <Input
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={`sug-${campo}`}
      />
      <datalist id={`sug-${campo}`}>
        {(suggestionsQuery.data ?? []).map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}

interface FuidFormModalProps {
  open: boolean;
  cajaId: string;
  editing: FuidDato | null;
  defaultNOrden: number;
  onClose: () => void;
}

function FuidFormModal({ open, cajaId, editing, defaultNOrden, onClose }: FuidFormModalProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [form, setForm] = useState<FuidFormValues>(() =>
    editing ? formFromRecord(editing) : emptyFormFor(cajaId, user, defaultNOrden),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FuidFormValues, string>>>({});

  const debouncedUpd = useDebouncedValue(form.upd.trim(), 500);
  const updExistsQuery = useQuery({
    queryKey: ['fuiddatosreal', 'check-upd', debouncedUpd],
    queryFn: () =>
      fuidApi.checkDuplicateUpd(debouncedUpd).then((res) => (res.data as unknown as CheckUpdResponse).exists),
    enabled: Boolean(debouncedUpd) && !editing,
  });

  const setField = (field: keyof FuidFormValues) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const updateField = (field: keyof FuidFormValues) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const createMutation = useMutation({
    mutationFn: (data: DataRow) => fuidApi.create(data),
    onSuccess: () => {
      toast.success('Registro FUID creado correctamente');
      onClose();
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: DataRow }) => fuidApi.update(id, data),
    onSuccess: () => {
      toast.success('Registro FUID actualizado correctamente');
      onClose();
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof FuidFormValues, string>> = {};
    const updError = required(form.upd, 'El UPD');
    if (updError) nextErrors.upd = updError;
    if (!form.caja.trim()) nextErrors.caja = 'La caja es requerida';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!editing) {
      try {
        const res = await fuidApi.checkDuplicateUpd(form.upd.trim());
        const exists = (res.data as unknown as CheckUpdResponse).exists;
        if (exists) {
          setErrors({ upd: 'El UPD ya existe' });
          return;
        }
      } catch {
        // el backend rechaza duplicados de todas formas
      }
    }

    const payload = buildPayload(form, editing);
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const updError = errors.upd ?? (updExistsQuery.data ? 'Este UPD ya existe en la base de datos' : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar Registro FUID' : 'Nuevo Registro FUID'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" form="fuid-form" loading={isSaving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="fuid-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-silver-200 bg-silver-50 p-4">
          <h3 className="text-sm font-semibold text-silver-800">Identificación</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DatePicker
              label="Fecha del Dato"
              value={form.fecha_del_dato}
              onChange={updateField('fecha_del_dato')}
            />
            <Input
              label="N° Orden"
              type="number"
              value={form.n_orden}
              onChange={setField('n_orden')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="codigo"
              label="Código"
              value={form.codigo}
              onChange={updateField('codigo')}
            />
            <Input
              label="Entidad Remitente"
              value={form.entidad_remitente}
              onChange={setField('entidad_remitente')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="entidad_productora"
              label="Entidad Productora"
              value={form.entidad_productora}
              onChange={updateField('entidad_productora')}
            />
          </div>
        </div>

        <div className="rounded-lg border border-silver-200 bg-silver-50 p-4">
          <h3 className="text-sm font-semibold text-silver-800">Procedencia</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SuggestionInput
              caja={form.caja}
              campo="unidad_administrativa"
              label="Unidad Administrativa"
              value={form.unidad_administrativa}
              onChange={updateField('unidad_administrativa')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="oficina_productora"
              label="Oficina Productora"
              value={form.oficina_productora}
              onChange={updateField('oficina_productora')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="objeto"
              label="Objeto"
              value={form.objeto}
              onChange={updateField('objeto')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="serie"
              label="Serie"
              value={form.serie}
              onChange={updateField('serie')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="subserie"
              label="Subserie"
              value={form.subserie}
              onChange={updateField('subserie')}
            />
            <Input
              label="N° Orden Interno"
              value={form.numero_de_orden_interno}
              onChange={setField('numero_de_orden_interno')}
            />
            <Input
              label="Accionado Procesado"
              value={form.accionado_procesado}
              onChange={setField('accionado_procesado')}
            />
            <Input
              label="Accionado Denunciante"
              value={form.accionado_denunciante}
              onChange={setField('accionado_denunciante')}
            />
            <Input
              label="Identificación"
              value={form.identificacion}
              onChange={setField('identificacion')}
            />
          </div>
        </div>

        <div className="rounded-lg border border-silver-200 bg-silver-50 p-4">
          <h3 className="text-sm font-semibold text-silver-800">Documento</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Asunto" value={form.asunto} onChange={setField('asunto')} />
            <SuggestionInput
              caja={form.caja}
              campo="radicado"
              label="Radicado"
              value={form.radicado}
              onChange={updateField('radicado')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="numero_doc"
              label="N° Documento"
              value={form.numero_doc}
              onChange={updateField('numero_doc')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="numero_doc_hasta"
              label="N° Documento Hasta"
              value={form.numero_doc_hasta}
              onChange={updateField('numero_doc_hasta')}
            />
            <DatePicker
              label="Fecha Inicial"
              value={form.fecha_inicial}
              onChange={updateField('fecha_inicial')}
            />
            <DatePicker
              label="Fecha Final"
              value={form.fecha_final}
              onChange={updateField('fecha_final')}
            />
          </div>
        </div>

        <div className="rounded-lg border border-silver-200 bg-silver-50 p-4">
          <h3 className="text-sm font-semibold text-silver-800">Caja</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Caja"
              value={form.caja}
              onChange={setField('caja')}
              error={errors.caja}
              placeholder="000C000000"
            />
            <Input label="UPD" value={form.upd} onChange={setField('upd')} error={updError} />
            <Input label="Tomo" value={form.tomo} onChange={setField('tomo')} />
            <Input label="Otro" value={form.otro} onChange={setField('otro')} />
            <SuggestionInput
              caja={form.caja}
              campo="caja_interna"
              label="Caja Interna"
              value={form.caja_interna}
              onChange={updateField('caja_interna')}
            />
            <Input label="Folios" type="number" value={form.folios} onChange={setField('folios')} />
            <Input label="Soporte" value={form.soporte} onChange={setField('soporte')} />
            <Input label="Frecuencia" value={form.frecuencia} onChange={setField('frecuencia')} />
            <Input
              label="Elaborado Por"
              value={form.elaborado_por}
              onChange={setField('elaborado_por')}
            />
            <Input
              label="N° Acta Transferible"
              value={form.nro_acta_transferible}
              onChange={setField('nro_acta_transferible')}
            />
            <DatePicker
              label="Fecha Transferencia"
              value={form.fecha_transferencia}
              onChange={updateField('fecha_transferencia')}
            />
            <SuggestionInput
              caja={form.caja}
              campo="notas"
              label="Notas"
              value={form.notas}
              onChange={updateField('notas')}
            />
            <Input label="Sede" value={form.sede} onChange={setField('sede')} />
            <Input label="Tiempo" value={form.tiempo} onChange={setField('tiempo')} />
            <SuggestionInput
              caja={form.caja}
              campo="asunto_2"
              label="Asunto 2"
              value={form.asunto_2}
              onChange={updateField('asunto_2')}
            />
            <Input label="Asunto 3" value={form.asunto_3} onChange={setField('asunto_3')} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function DatosPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { cajaId } = useParams<{ cajaId: string }>();
  const user = useAuthStore((state) => state.user);
  const canMarcarOk = user?.rol === 'LIDER' || user?.rol === 'ADMIN' || user?.rol === 'TECNICA';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FuidDato | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FuidDato | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const duplicatesNotifiedRef = useRef<string | null>(null);

  const cajaQuery = useQuery({
    queryKey: ['modulos-caja', 'detalle', cajaId],
    queryFn: () => modulosCajaApi.get(cajaId as string).then((res) => res.data),
    enabled: Boolean(cajaId),
  });

  const cajaCode = cajaQuery.data?.caja_modulo ?? cajaId ?? '';

  const fuidQuery = useQuery({
    queryKey: ['fuiddatosreal', 'list'],
    queryFn: () => fuidApi.list().then((res) => res.data),
    refetchInterval: 60_000,
  });

  const cajaDuplicatesQuery = useQuery({
    queryKey: ['fuiddatosreal', 'check-caja-duplicates', cajaCode],
    queryFn: () =>
      fuidApi.checkCajaDuplicates(cajaCode).then((res) => res.data as unknown as CajaDuplicatesResponse),
    enabled: Boolean(cajaCode),
  });

  useEffect(() => {
    const duplicates = cajaDuplicatesQuery.data?.duplicates;
    if (duplicates && duplicates.length > 0 && duplicatesNotifiedRef.current !== cajaCode) {
      duplicatesNotifiedRef.current = cajaCode;
      const total = duplicates.reduce((acc, group) => acc + group.total, 0);
      toast.warning(`Caja con ${total} registros duplicados`);
    }
  }, [cajaDuplicatesQuery.data, cajaCode]);

  const registros = useMemo(
    () => (fuidQuery.data ?? []).filter((registro) => registro.caja === cajaCode),
    [fuidQuery.data, cajaCode],
  );

  const defaultNOrden = useMemo(() => {
    if (registros.length === 0) return 1;
    return Math.max(...registros.map((registro) => registro.n_orden ?? 0)) + 1;
  }, [registros]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fuidApi.remove(id),
    onSuccess: () => {
      toast.success('Registro FUID eliminado');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const marcarOkMutation = useMutation({
    mutationFn: (ids: number[]) => fuidApi.marcarOk(ids),
    onSuccess: () => {
      toast.success('Registros marcados como revisados');
      setSelectedIds(new Set());
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const handleMarcarOk = () => {
    if (selectedIds.size === 0) return;
    marcarOkMutation.mutate([...selectedIds]);
  };

  const allSelected = registros.length > 0 && registros.every((registro) => selectedIds.has(registro.id));

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(registros.map((registro) => registro.id)));
  };

  const openNuevo = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEditar = (registro: FuidDato) => {
    setEditing(registro);
    setModalOpen(true);
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
    {
      key: 'estado',
      header: 'Estado',
      render: (registro: FuidDato) =>
        registro.historial_y_cambios === 'OK' ? (
          <Badge color="green">OK</Badge>
        ) : (
          <Badge color="gray">Sin revisar</Badge>
        ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (registro: FuidDato) => (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEditar(registro)}>
            <Pencil className="size-4" /> Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(registro)}>
            <Trash2 className="size-4" /> Eliminar
          </Button>
        </div>
      ),
    },
  ];

  if (canMarcarOk) {
    columns.unshift({
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Seleccionar todos los registros"
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Digitación FUID — Caja ${cajaCode}`}
        description="Clientes / Actas / Cajas / Digitación"
        actions={
          <>
            <Button onClick={openNuevo}>
              <Plus className="size-4" /> Nuevo Registro
            </Button>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="size-4" /> Volver a Cajas
            </Button>
          </>
        }
      />

      {fuidQuery.isPending ? (
        <Card>
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-primary-600" />
          </div>
        </Card>
      ) : registros.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12">
          <p className="text-sm text-silver-500">No hay registros FUID en esta caja</p>
          <Button onClick={openNuevo}>
            <Plus className="size-4" /> Nuevo Registro
          </Button>
        </Card>
      ) : (
        <>
          {canMarcarOk && (
            <div className="flex justify-end">
              <Button
                onClick={handleMarcarOk}
                disabled={selectedIds.size === 0}
                loading={marcarOkMutation.isPending}
              >
                <CheckCircle2 className="size-4" />
                Marcar como revisado{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </Button>
            </div>
          )}
          <Table
            columns={columns}
            data={registros}
            rowKey={(registro) => registro.id}
          />
        </>
      )}

      {modalOpen && (
        <FuidFormModal
          key={editing ? `edit-${editing.id}` : 'new'}
          open={modalOpen}
          cajaId={cajaCode}
          editing={editing}
          defaultNOrden={defaultNOrden}
          onClose={() => setModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar registro FUID"
        description={`¿Estás seguro de que deseas eliminar el registro ${deleteTarget?.upd ? `UPD ${deleteTarget.upd}` : `#${deleteTarget?.id ?? ''}`}?`}
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
