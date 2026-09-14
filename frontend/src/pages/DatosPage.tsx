import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Table,
  UpdInput,
  numeroAUpd,
  updANumero,
  type Column,
} from '@/components/ui';
import { fuidApi, getApiErrorCode, modulosCajaApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastApiError } from '@/lib/feedback';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { OPCIONES_FRECUENCIA, OPCIONES_OTRO, OPCIONES_SOPORTE } from '@/lib/catalogos';
import { fechaHoyISO } from '@/lib/utils';
import { FECHA_MINIMA_DOCUMENTAL, dateInRange, dateOrderValid, fechaHoyLocal, onlyDigits } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';
import {
  SUGGESTION_FIELDS,
  type DataRow,
  type FuidDato,
  type ModuloCaja,
  type SessionUser,
} from '@/types';

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

/** Última caja interna digitada; se recuerda entre registros como hacía la versión anterior. */
const CLAVE_CAJA_INTERNA = 'luciernaga.fuid.caja_interna';

function leerCajaInternaRecordada(): string {
  try {
    return localStorage.getItem(CLAVE_CAJA_INTERNA) ?? '';
  } catch {
    return '';
  }
}

function recordarCajaInterna(valor: string): void {
  try {
    if (valor.trim()) localStorage.setItem(CLAVE_CAJA_INTERNA, valor.trim());
  } catch {
    // Sin almacenamiento local solo se pierde la comodidad de recordarla.
  }
}

/** UPD siguiente al guardado (7 dígitos); vacío si no es válido o ya era UPD9999999. */
function siguienteUpdLocal(upd: string): string {
  const numero = parseInt(updANumero(upd), 10);
  if (Number.isNaN(numero) || numero >= 9999999) return '';
  return numeroAUpd(String(numero + 1));
}

/** Un "N/A" heredado de la caja no se precarga: el campo se muestra vacío. */
function sinNA(valor?: string | null): string {
  const limpio = (valor ?? '').trim();
  return limpio.toUpperCase() === 'N/A' ? '' : limpio;
}

function emptyFormFor(
  cajaId: string,
  user: SessionUser | null,
  defaultNOrden: number,
  defaultTomo: string,
  caja?: ModuloCaja | null,
): FuidFormValues {
  return {
    ...EMPTY_FORM,
    caja: cajaId,
    n_orden: String(defaultNOrden),
    tomo: defaultTomo,
    caja_interna: leerCajaInternaRecordada(),
    // La fecha del dato es el día en que se digita (hora local del navegador).
    fecha_del_dato: fechaHoyISO(),
    elaborado_por: user ? `${user.nombre} (${user.cc})` : '',
    sede: user?.sede ?? '',
    // Datos derivados de la caja seleccionada: la persona solo completa UPD y los
    // campos específicos del documento; el resto ya está lógicamente creado en la caja.
    // `codigo` queda en blanco a propósito: el id interno del módulo no es el
    // código documental que va en el FUID, y precargarlo hacía que se guardara
    // un número sin significado archivístico.
    codigo: '',
    entidad_remitente: caja?.entidad_remitente_caja ?? '',
    entidad_productora: sinNA(caja?.entidad_productora_caja),
    unidad_administrativa: sinNA(caja?.unidad_administrativa_caja),
    oficina_productora: sinNA(caja?.oficina_productora_caja),
    objeto: sinNA(caja?.objeto_caja),
    nro_acta_transferible: caja?.acta_trans_caja ?? '',
    fecha_transferencia: caja?.fecha_trans_caja?.slice(0, 10) ?? '',
  };
}

function buildPayload(form: FuidFormValues, editing: FuidDato | null): DataRow {
  // Los textos se guardan en mayúsculas, como hacía la versión anterior y como
  // están los registros históricos; lo vacío viaja como NULL (nunca "N/A").
  const text = (value: string): string | null => (value.trim() === '' ? null : value.trim().toUpperCase());
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
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
}

function SuggestionInput({
  caja,
  campo,
  label,
  value,
  onChange,
  disabled,
  readOnly,
  autoFocus,
  className,
}: SuggestionInputProps) {
  const debouncedQuery = useDebouncedValue(value, 300);
  const suggestionsQuery = useQuery({
    queryKey: ['fuiddatosreal', 'suggestions', caja, campo, debouncedQuery],
    queryFn: () =>
      fuidApi.suggestions(caja, campo, debouncedQuery).then((res) => res.data as unknown as string[]),
    enabled: Boolean(caja && debouncedQuery.trim().length >= 3),
  });

  return (
    <div className={cn('w-full', className)}>
      <Input
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={`sug-${campo}`}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
      />
      <datalist id={`sug-${campo}`}>
        {(suggestionsQuery.data ?? []).map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}


/** Opciones fijas de la lista más el valor guardado cuando quedó fuera de ella (registros antiguos). */
function opcionesCon(lista: readonly string[], actual: string) {
  const valor = actual.trim().toUpperCase();
  const base = lista.map((v) => ({ value: v, label: v }));
  return valor && !lista.includes(valor) ? [...base, { value: valor, label: valor }] : base;
}

interface FuidFormModalProps {
  open: boolean;
  cajaId: string;
  editing: FuidDato | null;
  defaultNOrden: number;
  defaultTomo: string;
  caja?: ModuloCaja | null;
  onClose: () => void;
}

/**
 * Formulario de digitación: los mismos 21 campos y el mismo orden que usaba la
 * versión anterior, en una cuadrícula de 4 columnas que cabe en pantalla sin
 * desplazarse. Sin validaciones al enviar ni relleno automático con N/A: lo que
 * va en blanco se guarda vacío y el servidor solo exige caja y UPD. Los datos
 * derivados (caja, fecha del dato, N° orden, elaborado por, sede, acta y fecha
 * de transferencia) viajan sin mostrarse.
 */
function FuidFormModal({ open, cajaId, editing, defaultNOrden, defaultTomo, caja, onClose }: FuidFormModalProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [form, setForm] = useState<FuidFormValues>(() =>
    editing ? formFromRecord(editing) : emptyFormFor(cajaId, user, defaultNOrden, defaultTomo, caja),
  );
  /** Registros guardados sin cerrar el formulario; remonta el formulario para volver a enfocar Codigo. */
  const [racha, setRacha] = useState(0);
  /** Confirmación animada del último registro guardado; se apaga sola a los ~2,4 s. */
  const [confirmacion, setConfirmacion] = useState<{ id: number; upd: string; siguiente: string } | null>(null);

  useEffect(() => {
    if (!confirmacion) return;
    const temporizador = setTimeout(() => setConfirmacion(null), 2400);
    return () => clearTimeout(temporizador);
  }, [confirmacion]);

  const debouncedUpd = useDebouncedValue(form.upd.trim(), 500);
  const updExistsQuery = useQuery({
    queryKey: ['fuiddatosreal', 'check-upd', debouncedUpd],
    queryFn: () =>
      fuidApi.checkDuplicateUpd(debouncedUpd).then((res) => (res.data as unknown as CheckUpdResponse).exists),
    enabled: Boolean(debouncedUpd) && !editing,
  });
  const nextUpdQuery = useQuery({
    queryKey: ['modulos-caja', 'next-upd', cajaId],
    queryFn: () => modulosCajaApi.siguienteUpd(cajaId).then((res) => res.data),
    enabled: open && !editing && Boolean(cajaId),
  });
  const updSugerido = nextUpdQuery.data?.upd ?? '';

  useEffect(() => {
    if (!editing && updSugerido && !form.upd.trim()) {
      setForm((prev) => (prev.upd ? prev : { ...prev, upd: updSugerido }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updSugerido, editing, open]);

  const setField = (field: keyof FuidFormValues) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const updateField = (field: keyof FuidFormValues) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const createMutation = useMutation({
    mutationFn: (data: DataRow) => fuidApi.create(data),
    onSuccess: () => {
      recordarCajaInterna(form.caja_interna);
      void invalidateDomain(queryClient, 'fuiddatosreal');

      // Producción: no se cierra el formulario. Queda listo el siguiente registro
      // con el UPD consecutivo, el N° de orden y el tomo siguientes, y los datos
      // de la caja precargados; el cursor vuelve a Codigo.
      const guardado = form.upd.trim().toUpperCase();
      const siguienteUpd = siguienteUpdLocal(guardado);
      const tomoActual = parseInt(form.tomo, 10);
      const siguienteTomo = Number.isNaN(tomoActual) ? defaultTomo : String(tomoActual + 1);
      setForm({
        ...emptyFormFor(cajaId, user, defaultNOrden + racha + 1, siguienteTomo, caja),
        upd: siguienteUpd,
      });
      setRacha((r) => r + 1);
      setConfirmacion({ id: Date.now(), upd: guardado, siguiente: siguienteUpd });
      // El servidor confirma el consecutivo libre (salta UPD ya usados); solo se
      // reemplaza si la persona todavía no lo cambió.
      void nextUpdQuery.refetch().then((result) => {
        const sugerido = result.data?.upd;
        if (sugerido) setForm((prev) => (prev.upd === siguienteUpd ? { ...prev, upd: sugerido } : prev));
      });
    },
    onError: (error) => {
      if (getApiErrorCode(error) === 'UPD_YA_USADO') {
        toast.error('El UPD ya fue usado por otro registro. Se asignará el siguiente disponible.');
        void nextUpdQuery.refetch().then((result) => {
          setForm((prev) => ({ ...prev, upd: result.data?.upd ?? '' }));
        });
        return;
      }
      toastApiError(error, { context: 'No se pudo guardar el registro:' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: DataRow }) => fuidApi.update(id, data),
    onSuccess: () => {
      toast.success('Registro FUID actualizado correctamente');
      onClose();
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo actualizar el registro:' });
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  /**
   * Las dos fechas son lo único que se valida en el cliente: el resto se envía
   * tal cual y el servidor responde, para no meter pasos entre un registro y el
   * siguiente. Se calcula al vuelo en lugar de al enviar, para que el aviso
   * aparezca mientras se escribe y no después de intentar guardar.
   */
  const errorFechaInicial = dateInRange(form.fecha_inicial, 'La fecha inicial');
  const errorFechaFinal =
    dateInRange(form.fecha_final, 'La fecha final') ??
    dateOrderValid(form.fecha_inicial, form.fecha_final);
  const errorFolios = onlyDigits(form.folios, 'Los folios');
  const primerError = errorFechaInicial ?? errorFechaFinal ?? errorFolios;
  const hayErrorDeFormulario = Boolean(primerError);

  const hoy = fechaHoyLocal();

  // El submit se bloquea, pero el formulario no se toca: lo escrito sigue ahí
  // para que la persona corrija solo la fecha.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    if (primerError) {
      toast.error(primerError);
      return;
    }
    const payload = buildPayload(form, editing);
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  };

  const updDuplicado = !editing && updExistsQuery.data ? 'Este UPD ya existe en la base de datos' : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar Registro FUID' : 'Nuevo Registro FUID'}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" form="fuid-form" loading={isSaving} disabled={isSaving || hayErrorDeFormulario}>
            Enviar
          </Button>
        </>
      }
    >
      <div className={cn('relative rounded-xl', confirmacion && 'animate-[fuid-flash_1.2s_ease-out]')}>
        {confirmacion && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center animate-[fuid-confirmacion_2.4s_ease-in-out_forwards]"
          >
            <div className="flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50 px-6 py-4 shadow-xl">
              <svg className="size-16 shrink-0" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="fuid-check-circulo" cx="26" cy="26" r="24" fill="none" stroke="#16a34a" strokeWidth="3" />
                <path
                  className="fuid-check-marca"
                  d="M14 27 l8 8 l16 -16"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <p className="text-xl font-bold text-green-800">Registro {confirmacion.upd} guardado</p>
                <p className="text-base text-green-700">
                  {confirmacion.siguiente
                    ? `Listo el siguiente: ${confirmacion.siguiente}`
                    : 'Indique el siguiente UPD'}
                </p>
              </div>
            </div>
          </div>
        )}
      <form
        key={racha}
        id="fuid-form"
        onSubmit={handleSubmit}
        autoComplete="off"
        className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <SuggestionInput
          caja={form.caja}
          campo="entidad_productora"
          label="Entidad Productora"
          value={form.entidad_productora}
          onChange={updateField('entidad_productora')}
        />
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
          campo="codigo"
          label="Codigo"
          value={form.codigo}
          onChange={updateField('codigo')}
          autoFocus
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
        <SuggestionInput
          caja={form.caja}
          campo="asunto_2"
          label="Asunto Automático"
          value={form.asunto_2}
          onChange={updateField('asunto_2')}
        />

        <Input label="Asunto Manual" value={form.asunto_3} onChange={setField('asunto_3')} />
        <SuggestionInput
          caja={form.caja}
          campo="numero_doc"
          label="Nro. Documento Desde"
          value={form.numero_doc}
          onChange={updateField('numero_doc')}
        />
        <SuggestionInput
          caja={form.caja}
          campo="numero_doc_hasta"
          label="Nro. Documento Hasta"
          value={form.numero_doc_hasta}
          onChange={updateField('numero_doc_hasta')}
        />
        <Input
          label="Fecha Inicial"
          type="date"
          value={form.fecha_inicial}
          onChange={setField('fecha_inicial')}
          min={FECHA_MINIMA_DOCUMENTAL}
          max={hoy}
          error={errorFechaInicial ?? undefined}
        />

        <Input
          label="Fecha Final"
          type="date"
          value={form.fecha_final}
          onChange={setField('fecha_final')}
          min={form.fecha_inicial || FECHA_MINIMA_DOCUMENTAL}
          max={hoy}
          error={errorFechaFinal ?? undefined}
        />
        <UpdInput
          label="UPD"
          value={updANumero(form.upd)}
          onChange={(numero) => updateField('upd')(numero)}
          onBlur={() => updateField('upd')(numeroAUpd(updANumero(form.upd)))}
          error={updDuplicado}
          hint={nextUpdQuery.data?.message}
          defaultUnlocked
        />
        <Input label="Tomo" value={form.tomo} onChange={setField('tomo')} inputMode="numeric" />
        <Select
          label="Otro"
          options={opcionesCon(OPCIONES_OTRO, form.otro)}
          value={form.otro.trim().toUpperCase()}
          onChange={updateField('otro')}
          placeholder="—"
        />

        <SuggestionInput
          caja={form.caja}
          campo="caja_interna"
          label="Caja Interna"
          value={form.caja_interna}
          onChange={updateField('caja_interna')}
        />
        <Input
          label="Folios"
          value={form.folios}
          onChange={setField('folios')}
          inputMode="numeric"
          error={onlyDigits(form.folios, 'Los folios') ?? undefined}
        />
        <Select
          label="Soporte"
          options={opcionesCon(OPCIONES_SOPORTE, form.soporte)}
          value={form.soporte.trim().toUpperCase()}
          onChange={updateField('soporte')}
          placeholder="—"
        />
        <Select
          label="Frecuencia"
          options={opcionesCon(OPCIONES_FRECUENCIA, form.frecuencia)}
          value={form.frecuencia.trim().toUpperCase()}
          onChange={updateField('frecuencia')}
          placeholder="—"
        />

        <SuggestionInput
          caja={form.caja}
          campo="notas"
          label="Notas"
          value={form.notas}
          onChange={updateField('notas')}
          className="sm:col-span-2 lg:col-span-4"
        />
      </form>
      </div>
    </Modal>
  );
}


interface UpdInicioDialogProps {
  open: boolean;
  cajaCode: string;
  volverA: string;
  onListo: () => void;
  /** Motivo por el que se pide el arranque (p. ej. se alcanzó UPD9999999). */
  mensaje?: string;
}

/**
 * Antes de digitar el primer FUID de la caja, el técnico indica el UPD de
 * arranque. Solo escribe el número: el prefijo lo aporta el propio control y el
 * servidor lo normaliza a UPD + 7 dígitos. A partir de ahí el consecutivo corre
 * solo en cada registro nuevo.
 */
function UpdInicioDialog({ open, cajaCode, volverA, onListo, mensaje }: UpdInicioDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [numero, setNumero] = useState('');
  const [error, setError] = useState<string | undefined>();

  const guardar = useMutation({
    mutationFn: () => modulosCajaApi.fijarUpdInicio(cajaCode, numero),
    onSuccess: (res) => {
      toast.success(res.data.message);
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['modulos-caja', 'next-upd', cajaCode] });
      onListo();
    },
    onError: (err: unknown) => {
      const mensaje =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'No se pudo guardar el UPD de inicio';
      setError(mensaje);
    },
  });

  const enviar = (event: FormEvent) => {
    event.preventDefault();
    if (!numero.trim()) {
      setError('Escribe el número del UPD');
      return;
    }
    guardar.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={() => undefined}
      dismissible={false}
      title={`Iniciar digitación — Caja ${cajaCode}`}
    >
      <form onSubmit={enviar} className="space-y-5">
        <p className="text-sm text-silver-600">
          Indica el número del UPD con el que arranca esta caja. Solo el número: las siglas{' '}
          <span className="font-semibold text-silver-800">UPD</span> ya están puestas. A partir de
          ahí, cada registro nuevo tomará el consecutivo automáticamente.
        </p>
        {mensaje && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{mensaje}</p>
        )}

        <UpdInput
          label="Número del UPD inicial"
          value={numero}
          onChange={(valor) => {
            setNumero(valor);
            if (error) setError(undefined);
          }}
          error={error}
          hint="Se completará con ceros a la izquierda hasta 7 dígitos."
          autoFocus
          disabled={guardar.isPending}
        />

        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(volverA)}>
            Volver a cajas
          </Button>
          <Button type="submit" disabled={guardar.isPending || !numero.trim()}>
            {guardar.isPending ? 'Guardando…' : 'Comenzar digitación'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function DatosPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { cajaId } = useParams<{ cajaId: string }>();
  const user = useAuthStore((state) => state.user);
  const canMarcarOk = user?.rol === 'LIDER' || user?.rol === 'ADMIN' || user?.rol === 'TECNICA' || user?.rol === 'CALIDAD';
  const canCrear = user?.rol !== 'CALIDAD';
  const canEliminar = user?.rol !== 'CALIDAD';
  const fromPath = (location.state as { from?: string } | null)?.from ?? `/clientes`;

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
    queryKey: ['fuiddatosreal', 'list', cajaCode],
    queryFn: () => fuidApi.list({ caja: cajaCode }).then((res) => res.data),
    enabled: Boolean(cajaCode),
  });

  // El técnico necesita fijar su UPD de arranque antes de digitar en esta caja.
  const esTecnica = user?.rol === 'TECNICA';
  const updInicioQuery = useQuery({
    queryKey: ['modulos-caja', 'next-upd', cajaCode],
    queryFn: () => modulosCajaApi.siguienteUpd(cajaCode).then((res) => res.data),
    enabled: esTecnica && Boolean(cajaCode),
  });
  const requiereUpdInicio = esTecnica && updInicioQuery.data?.requiere_inicio === true;

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

  const registros = useMemo(() => fuidQuery.data ?? [], [fuidQuery.data]);

  const defaultNOrden = useMemo(() => {
    if (registros.length === 0) return 1;
    return Math.max(...registros.map((registro) => registro.n_orden ?? 0)) + 1;
  }, [registros]);

  // Como en la versión anterior: el tomo sugerido es el mayor de la caja más uno.
  const defaultTomo = useMemo(() => {
    const tomos = registros
      .map((registro) => parseInt(registro.tomo ?? '', 10))
      .filter((n) => !Number.isNaN(n));
    return String(tomos.length > 0 ? Math.max(...tomos) + 1 : 1);
  }, [registros]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fuidApi.remove(id),
    onSuccess: () => {
      toast.success('Registro FUID eliminado');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo eliminar el registro:' });
    },
  });

  const marcarOkMutation = useMutation({
    mutationFn: (ids: number[]) => fuidApi.marcarOk(ids),
    onSuccess: () => {
      toast.success('Registros marcados como revisados');
      setSelectedIds(new Set());
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
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
      key: 'created_at',
      header: 'Creado',
      render: (registro: FuidDato) => (registro.created_at ? registro.created_at.slice(0, 19).replace('T', ' ') : '—'),
    },
    {
      key: 'updated_at',
      header: 'Actualizado',
      render: (registro: FuidDato) => (registro.updated_at ? registro.updated_at.slice(0, 19).replace('T', ' ') : '—'),
    },
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
          {canEliminar && (
            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(registro)}>
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
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
      {requiereUpdInicio && (
        <UpdInicioDialog
          open
          cajaCode={cajaCode}
          volverA={fromPath}
          onListo={() => void updInicioQuery.refetch()}
          mensaje={updInicioQuery.data?.message}
        />
      )}

      <PageHeader
        title={`Digitación FUID — Caja ${cajaCode}`}
        description="Clientes / Actas / Cajas / Digitación"
        backTo={fromPath}
        backLabel="Volver a Cajas"
        actions={
          <>
            {canCrear && (
              <Button onClick={openNuevo}>
                <Plus className="size-4" /> Nuevo Registro
              </Button>
            )}
          </>
        }
      />

      {fuidQuery.isPending ? (
        <Card>
          <div className="flex justify-center py-10">
            <LoadingState message="Estamos consultando la información…" />
          </div>
        </Card>
      ) : registros.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12">
          <p className="text-sm text-silver-500">No hay registros FUID en esta caja</p>
          {canCrear && (
            <Button onClick={openNuevo}>
              <Plus className="size-4" /> Nuevo Registro
            </Button>
          )}
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
          <div key={`fuids-${cajaCode}`} className="form-fill-anim">
            <Table
              columns={columns}
              data={registros}
              rowKey={(registro) => registro.id}
            />
          </div>
        </>
      )}

      {modalOpen && (
        <FuidFormModal
          key={editing ? `edit-${editing.id}` : 'new'}
          open={modalOpen}
          cajaId={cajaCode}
          editing={editing}
          defaultNOrden={defaultNOrden}
          defaultTomo={defaultTomo}
          caja={cajaQuery.data}
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
