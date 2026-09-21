import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CheckCircle, Pencil, Search, Trash2, X } from 'lucide-react';
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
import { fuidApi, getApiErrorCode, getApiErrorMessage, modulosCajaApi, modulosClienteApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastApiError } from '@/lib/feedback';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { intervaloRefresco } from '@/lib/refresco';
import { filtrarPorTexto } from '@/lib/busqueda';
import { useLatidoDeEscritura } from '@/lib/latidoDeEscritura';
import { retornoDeCaja } from '@/lib/navegacion';
import { OPCIONES_FRECUENCIA, OPCIONES_OTRO, OPCIONES_SOPORTE } from '@/lib/catalogos';
import { limiteDe } from '@/lib/limites';
import { fechaHoyLocal, formatearFechaHora } from '@/lib/fechas';
import { estadoDeCaja } from '@/lib/estadoCaja';
import { CierreDeJornada } from './cajas/CierreDeJornada';
import { FECHA_MINIMA_DOCUMENTAL, dateInRange, dateOrderValid, onlyDigits } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';
import { SUGGESTION_FIELDS, type DataRow, type FuidDato, type ModuloCaja, type SessionUser, tieneAlgunRol, tieneRol } from '@/types';

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

/** Los campos de un registro nuevo que nadie escribe: salen de la caja o de lo ya digitado en ella. */
type CamposHeredados = Pick<
  FuidFormValues,
  | 'entidad_remitente'
  | 'entidad_productora'
  | 'unidad_administrativa'
  | 'oficina_productora'
  | 'objeto'
  | 'nro_acta_transferible'
  | 'fecha_transferencia'
  | 'asunto_2'
  | 'caja_interna'
>;

/**
 * Lo que un registro nuevo hereda, en un solo sitio.
 *
 * Lo usan dos: el formulario en blanco y el efecto que recoge lo que llega
 * tarde. Tiene que ser la misma lista en los dos, y tenerla escrita dos veces
 * fue justo lo que falló: se añadieron al efecto el asunto automático y la
 * caja interna, y los campos que vienen de la caja se quedaron fuera, así que
 * solo se rellenaban cuando la consulta de la caja ganaba la carrera contra el
 * montaje del formulario.
 *
 * Los que vienen de la caja pasan por `sinNA`: un `N/A` heredado no se
 * precarga, porque en el formulario ese marcador no se escribe ni se ve.
 */
function valoresHeredados(
  caja: ModuloCaja | null | undefined,
  asuntoAutomatico = '',
  cajaInterna = '',
): CamposHeredados {
  return {
    entidad_remitente: caja?.entidad_remitente_caja ?? '',
    entidad_productora: sinNA(caja?.entidad_productora_caja),
    unidad_administrativa: sinNA(caja?.unidad_administrativa_caja),
    oficina_productora: sinNA(caja?.oficina_productora_caja),
    objeto: sinNA(caja?.objeto_caja),
    nro_acta_transferible: caja?.acta_trans_caja ?? '',
    fecha_transferencia: caja?.fecha_trans_caja?.slice(0, 10) ?? '',
    // El asunto automático del último registro de la caja. Una caja suele
    // contener documentos del mismo asunto, así que se trae ya escrito y quien
    // necesite otro lo cambia; volver a teclearlo en cada registro era el
    // trabajo repetido más caro de la digitación.
    //
    // El asunto manual NO se hereda: describe el documento concreto, cambia de
    // un registro al siguiente y arrastrarlo hacía que se guardara el del
    // anterior cuando alguien pasaba de largo.
    asunto_2: asuntoAutomatico,
    // La caja interna se hereda del **primer** registro de la caja. Es un dato
    // de la caja, no del documento: una vez fijado en el primero vale para
    // todos los que vengan detrás. Del primero y no del último —que es como se
    // hacía antes y se quitó— porque el último va cambiando y obligaba a
    // comprobar el campo en cada registro.
    caja_interna: cajaInterna,
  };
}

function emptyFormFor(
  cajaId: string,
  user: SessionUser | null,
  defaultNOrden: number,
  caja?: ModuloCaja | null,
  asuntoAutomatico?: string,
  cajaInterna?: string,
): FuidFormValues {
  return {
    ...EMPTY_FORM,
    ...valoresHeredados(caja, asuntoAutomatico, cajaInterna),
    caja: cajaId,
    n_orden: String(defaultNOrden),
    // El tomo queda en blanco a propósito. Antes se sugería el siguiente de la
    // caja y se iba sumando en cada registro, así que el campo llegaba con un
    // número que casi nunca era el del documento y había que borrarlo a mano.
    //
    // `codigo` también: el id interno del módulo no es el código documental que
    // va en el FUID, y precargarlo hacía que se guardara un número sin
    // significado archivístico.
    codigo: '',
    // La fecha del dato es el día en que se digita, en hora de Colombia.
    fecha_del_dato: fechaHoyLocal(),
    elaborado_por: user ? `${user.nombre} (${user.cc})` : '',
    sede: user?.sede ?? '',
  };
}

function buildPayload(form: FuidFormValues, editing: FuidDato | null): DataRow {
  // Los textos se guardan en mayúsculas, como hacía la versión anterior y como
  // están los registros históricos.
  //
  // Lo vacío viaja como NULL y es el servidor quien decide con qué se guarda:
  // las columnas de texto del FUID quedan en "N/A" y las de fecha, número y
  // tiempo en NULL (`CAMPOS_NO_DILIGENCIADOS` en el backend). No se manda "N/A"
  // desde aquí a propósito: el formulario debe verse vacío mientras se digita,
  // el marcador es cosa de cómo se guarda.
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
    // Versión leída al abrir el registro: el backend la exige para detectar que
    // otra persona guardó mientras tanto (bloqueo optimista).
    payload.version = editing.version;
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
  className?: string;
  error?: string;
}

function SuggestionInput({
  caja,
  campo,
  label,
  value,
  onChange,
  disabled,
  readOnly,
  className,
  error,
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
        error={error}
        // El componente ya recibe el nombre de la columna, así que el tope sale
        // del mapa sin tener que repetirlo en cada uno de los campos del FUID.
        maxLength={limiteDe(campo)}
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

interface FormularioFuidProps {
  cajaId: string;
  /** Registro que se corrige, o `null` para digitar uno nuevo. */
  editing: FuidDato | null;
  defaultNOrden: number;
  /** Asunto automático del último registro de la caja, para no reescribirlo. */
  asuntoAutomaticoDeLaCaja: string;
  /** Caja interna del primer registro de la caja: es la misma para toda ella. */
  cajaInternaDeLaCaja: string;
  /** Avisa del UPD recién guardado, para que la lista pueda señalar su fila. */
  onGuardado?: (upd: string) => void;
  caja?: ModuloCaja | null;
  /** Se llama al terminar de corregir; solo tiene sentido dentro del diálogo. */
  onTerminar?: () => void;
}

/**
 * Formulario de digitación: los mismos 21 campos y el mismo orden que usaba la
 * versión anterior, en una cuadrícula de 4 columnas que cabe en pantalla sin
 * desplazarse. Sin validaciones al enviar ni relleno automático con N/A: lo que
 * va en blanco se guarda vacío y el servidor solo exige caja y UPD. Los datos
 * derivados (caja, fecha del dato, N° orden, elaborado por, sede, acta y fecha
 * de transferencia) viajan sin mostrarse.
 *
 * Sirve para las dos cosas y no sabe dónde está. En la pantalla de la caja vive
 * fijo, arriba de la lista de registros: digitar es lo que se hace ahí todo el
 * día y no tiene sentido abrir un diálogo para cada uno. Para corregir un
 * registro ya guardado, la misma pieza se monta dentro de un diálogo, que es lo
 * que corresponde a una acción puntual sobre una fila concreta.
 */
function FormularioFuid({
  cajaId,
  editing,
  defaultNOrden,
  asuntoAutomaticoDeLaCaja,
  cajaInternaDeLaCaja,
  caja,
  onTerminar,
  onGuardado,
}: FormularioFuidProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  /*
   * Avisa de que se está escribiendo, para que el panel del líder distinga a
   * quien está llenando el formulario de quien lo dejó abierto y se fue.
   */
  const avisarQueEscribe = useLatidoDeEscritura(cajaId);

  const [form, setForm] = useState<FuidFormValues>(() =>
    editing
      ? formFromRecord(editing)
      : emptyFormFor(cajaId, user, defaultNOrden, caja, asuntoAutomaticoDeLaCaja, cajaInternaDeLaCaja),
  );
  /** Registros guardados sin cerrar el formulario; remonta el formulario para volver a enfocar Asunto Manual. */
  const [racha, setRacha] = useState(0);
  // Los campos obligatorios no se marcan en rojo hasta el primer intento de
  // guardar: un formulario recién abierto está vacío por definición y teñirlo
  // de avisos desde el principio solo estorba a quien digita de corrido.
  const [faltantesALaVista, setFaltantesALaVista] = useState(false);
  /** Confirmación animada del último registro guardado; se apaga sola a los ~2,4 s. */
  const [confirmacion, setConfirmacion] = useState<{ id: number; upd: string; siguiente: string } | null>(null);

  useEffect(() => {
    if (!confirmacion) return;
    const temporizador = setTimeout(() => setConfirmacion(null), 2400);
    return () => clearTimeout(temporizador);
  }, [confirmacion]);

  /*
   * Lo que se hereda llega tarde, y hay que recogerlo cuando llega.
   *
   * El formulario se monta con la página, y en ese momento ni la caja ni sus
   * registros han respondido todavía: entidad productora, objeto, el asunto
   * automático y los demás valen cadena vacía. Como el estado inicial de
   * `useState` solo se calcula en el primer render, sin esto esos campos se
   * quedaban en blanco el resto de la sesión.
   *
   * Y fallaba de forma intermitente, que es lo que costaba entender: si la
   * caja ya estaba en la caché de una visita anterior, la respuesta llegaba
   * antes de montar el formulario y los campos salían llenos; en una carga
   * fría, no. Lo mismo, según el día.
   *
   * Solo se rellena lo que sigue vacío, así que nunca pisa lo que la persona
   * haya escrito mientras tanto —que es lo que podía pasar remontando el
   * formulario— ni vuelve sobre un campo que ella misma borró a propósito.
   */
  useEffect(() => {
    if (editing) return;
    const heredados = valoresHeredados(caja, asuntoAutomaticoDeLaCaja, cajaInternaDeLaCaja);
    setForm((prev) => {
      const pendientes = Object.entries(heredados).filter(
        ([campo, valor]) => valor !== '' && prev[campo as keyof FuidFormValues] === '',
      );
      if (pendientes.length === 0) return prev;
      return { ...prev, ...Object.fromEntries(pendientes) };
    });
  }, [caja, asuntoAutomaticoDeLaCaja, cajaInternaDeLaCaja, editing]);

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
    enabled: !editing && Boolean(cajaId),
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
      void invalidateDomain(queryClient, 'fuiddatosreal');

      // Producción: no se cierra el formulario. Queda listo el siguiente registro
      // con el UPD consecutivo, el N° de orden y los datos de la caja
      // precargados; el cursor vuelve a Codigo.
      //
      // Del registro que se acaba de guardar se arrastran el asunto automático
      // y la caja interna: lo habitual es encadenar varios documentos del mismo
      // asunto dentro de la misma caja interna, y volver a escribirlos cada vez
      // cuesta más que corregirlos cuando cambian. Se toman de aquí y no de la
      // lista para que el siguiente registro los tenga ya puestos, sin esperar
      // a que la consulta se refresque. El asunto manual y las notas arrancan
      // en blanco, porque describen el documento concreto y no se repiten de un
      // registro al siguiente.
      const guardado = form.upd.trim().toUpperCase();
      const siguienteUpd = siguienteUpdLocal(guardado);
      setForm({
        ...emptyFormFor(
          cajaId,
          user,
          defaultNOrden + racha + 1,
          caja,
          form.asunto_2,
          form.caja_interna,
        ),
        upd: siguienteUpd,
      });
      setRacha((r) => r + 1);
      setFaltantesALaVista(false);
      setConfirmacion({ id: Date.now(), upd: guardado, siguiente: siguienteUpd });
      onGuardado?.(guardado);
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
      void invalidateDomain(queryClient, 'fuiddatosreal');
      onTerminar?.();
    },
    onError: (error) => {
      // Otra persona guardó este mismo registro mientras estaba abierto. No se
      // cierra el formulario ni se borra nada: lo escrito sigue a la vista para
      // que se pueda copiar antes de recargar.
      if (getApiErrorCode(error) === 'VERSION_DESACTUALIZADA') {
        toast.error(
          'Este registro fue modificado por otro usuario. Recarga para ver los cambios más recientes.',
          { duration: 8000 },
        );
        return;
      }
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

  /**
   * Los dos asuntos son lo único obligatorio además de la caja y el UPD: son lo
   * que permite saber qué contiene el documento sin abrir la caja. El resto
   * puede quedar vacío y el servidor lo guarda como N/A.
   *
   * Van aparte de los errores de formato a propósito. Un formato inválido
   * deshabilita el botón Enviar; un obligatorio vacío no, porque el formulario
   * arranca vacío y el botón quedaría apagado desde el principio sin decir por
   * qué. Estos se comprueban al enviar y ahí sí se marcan.
   */
  /*
   * El asunto manual ya no entra aquí. Era obligatorio junto con el automático,
   * y se retiró: describe el documento concreto y hay documentos de los que no
   * hay nada particular que decir, así que exigirlo obligaba a inventar texto o
   * a parar la digitación. Vacío se guarda como `N/A`, como el resto de los
   * campos descriptivos. El automático sigue siendo obligatorio porque es lo
   * que permite saber qué contiene la caja sin abrirla, y además se hereda del
   * registro anterior, así que casi siempre viene puesto.
   */
  const faltaAsuntoAutomatico = form.asunto_2.trim() === '' ? 'El asunto automático es requerido' : null;

  const errorDeFormato = errorFechaInicial ?? errorFechaFinal ?? errorFolios;
  const primerError = errorDeFormato ?? faltaAsuntoAutomatico;
  const hayErrorDeFormulario = Boolean(errorDeFormato);

  const hoy = fechaHoyLocal();

  // El submit se bloquea, pero el formulario no se toca: lo escrito sigue ahí
  // para que la persona corrija solo la fecha.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    if (primerError) {
      setFaltantesALaVista(true);
      toast.error(primerError);
      return;
    }
    const payload = buildPayload(form, editing);
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  };

  const updDuplicado = !editing && updExistsQuery.data ? 'Este UPD ya existe en la base de datos' : undefined;

  return (
    /*
     * El destello verde confirma el guardado al instante sin tapar nada. El
     * registro recién guardado aparece además en la lista de abajo, así que la
     * confirmación no tiene que dejar rastro por sí sola.
     */
    <div className={cn('rounded-xl', confirmacion && 'animate-[fuid-flash_1.2s_ease-out]')}>
      <form
        key={racha}
        id="fuid-form"
        onSubmit={handleSubmit}
        /*
         * Cada pulsación en cualquier campo avisa de que se está escribiendo.
         * `onInput` sube desde los campos, así que basta ponerlo aquí y no hay
         * que acordarse de engancharlo en cada uno de los veintiún campos. El
         * aviso se manda como mucho cada medio minuto.
         */
        onInput={avisarQueEscribe}
        autoComplete="off"
        /*
         * Cuatro columnas y el mismo orden de siempre; lo que se ajusta es el
         * aire. El margen de los rótulos se aprieta solo aquí: son veintiún
         * campos, y el par de píxeles por fila decide si la lista de abajo se
         * ve o hay que buscarla desplazando.
         */
        className="grid grid-cols-1 gap-x-5 gap-y-2 [&_label]:mb-0.5 sm:grid-cols-2 lg:grid-cols-4"
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

        {/*
          Sin foco automático. Al abrir el formulario, este campo aparecía
          resaltado como si fuera el que hay que llenar, y no lo es: quien digita
          recorre los campos en el orden del documento que tiene delante, no
          empezando por el código. El diálogo se encarga de recoger el foco sin
          señalar ningún campo.
        */}
        <SuggestionInput
          caja={form.caja}
          campo="codigo"
          label="Codigo"
          value={form.codigo}
          onChange={updateField('codigo')}
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
          label="Asunto Automático *"
          value={form.asunto_2}
          onChange={updateField('asunto_2')}
          error={(faltantesALaVista && faltaAsuntoAutomatico) || undefined}
        />

        {/* Asunto Manual ocupa la fila entera, que es lo único que lo distingue
            del resto: es donde se escribe de corrido y en una columna estrecha no
            se alcanza a leer lo que ya se puso. Por lo demás se comporta como
            cualquier otro campo, sin saltos de línea. Tampoco hereda nada del
            registro anterior.

            Es el campo que recibe el foco al abrir el formulario, y el único que
            lo pide. Es el que de verdad hay que escribir en cada registro: el
            resto viene de la caja o se repite del anterior, y este describe el
            documento concreto que se tiene en la mano. */}
        <div className="sm:col-span-2 lg:col-span-4">
          <Input
            label="Asunto Manual"
            value={form.asunto_3}
            onChange={(event) => updateField('asunto_3')(event.target.value)}
            maxLength={limiteDe('asunto_3')}
            autoFocus
          />
        </div>

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
        <Input label="Tomo" value={form.tomo} onChange={setField('tomo')} inputMode="numeric" maxLength={limiteDe('tomo')} />
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

        {/*
          Notas y las acciones comparten la última fila.
          
          Notas ocupa tres de las cuatro columnas —sigue siendo el campo largo
          que pediste— y el botón va en la cuarta. Antes las acciones tenían
          fila propia, y una fila de este formulario cuesta unos ochenta y cinco
          píxeles: con veintiún campos compartiendo pantalla con la lista de
          registros, esa fila era la diferencia entre ver lo que acabas de
          guardar y tener que desplazarte a buscarlo.

          La lista de sugerencias no aplica en Notas: proponía lo escrito en
          otros registros de la caja, que es justo lo que aquí no sirve.
        */}
        <div className="sm:col-span-2 lg:col-span-3">
          <Input
            label="Notas"
            value={form.notas}
            onChange={(event) => updateField('notas')(event.target.value)}
            maxLength={limiteDe('notas')}
          />
        </div>
        <div className="flex flex-col justify-end gap-1.5 sm:col-span-2 lg:col-span-1">
          {/*
            El acuse de lo guardado. Ocupa siempre el mismo alto —vacío o
            lleno— para que al aparecer no empuje el botón de guardar medio
            centímetro hacia abajo justo cuando la mano va hacia él.

            Dice las dos cosas que interesan en ese instante: qué quedó
            guardado y con qué UPD sigue, que es lo que evita mirar el campo
            para comprobarlo.
          */}
          <div role="status" aria-live="polite" className="flex min-h-7 items-center justify-end">
            {confirmacion && (
              <span
                key={confirmacion.id}
                className="inline-flex animate-[field-pop-in_260ms_ease-out] items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800"
              >
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span className="font-mono">{confirmacion.upd}</span>
                <span className="text-green-700">guardado</span>
                {confirmacion.siguiente && (
                  <span className="border-l border-green-200 pl-1.5 text-green-700">
                    sigue <span className="font-mono">{confirmacion.siguiente}</span>
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {editing && (
              <Button variant="ghost" onClick={onTerminar} disabled={isSaving}>
                Cancelar
              </Button>
            )}
            <Button type="submit" loading={isSaving} disabled={isSaving || hayErrorDeFormulario}>
              {editing ? 'Guardar cambios' : 'Guardar registro'}
            </Button>
          </div>
        </div>
      </form>
    </div>
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
  const canMarcarOk = tieneAlgunRol(user, ['LIDER', 'ADMIN', 'TECNICA']);
  // Todos los perfiles que llegan aquí digitan y pueden borrar; las reglas de
  // autor y de fecha las aplica el backend.
  const canCrear = true;
  const canEliminar = true;
  // El retorno se resuelve más abajo, cuando ya se conoce la caja: necesita
  // saber de qué acta cuelga para poder subir un nivel sin depender del
  // historial de navegación.

  const [editing, setEditing] = useState<FuidDato | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FuidDato | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState('');
  const duplicatesNotifiedRef = useRef<string | null>(null);

  const cajaQuery = useQuery({
    queryKey: ['modulos-caja', 'detalle', cajaId],
    queryFn: () => modulosCajaApi.get(cajaId as string).then((res) => res.data),
    enabled: Boolean(cajaId),
  });

  // Acta (módulo cliente) de la caja, para obtener el número y año de creación
  const actaQuery = useQuery({
    queryKey: ['modulos-cliente', 'detalle', cajaQuery.data?.id_modulo_caja],
    queryFn: () => modulosClienteApi.get(String(cajaQuery.data?.id_modulo_caja)).then((res) => res.data),
    enabled: Boolean(cajaQuery.data?.id_modulo_caja),
  });

  /*
   * El número de caja sale de la caja, y de ningún otro sitio.
   *
   * Antes, mientras la consulta viajaba, esto caía al identificador de la
   * ruta —un número como "114"— y ese valor se usaba para todo: el título, la
   * lista de registros y, lo grave, el campo `caja` del registro que se
   * guardaba. Quien digitaba nada más abrir la pantalla mandaba un registro
   * con la caja "114" en lugar de "054C004453", y entonces pasaba una de dos
   * según el perfil:
   *
   * - A quien digita, el servidor le respondía "la caja no está asignada a
   *   usted", porque ninguna caja se llama "114". Parecía un problema de
   *   permisos y era esto.
   * - A un líder o administrador, que no pasa por esa comprobación, el
   *   registro **se guardaba** con un número de caja que no existe. Así nació
   *   el registro huérfano con la caja "67", que no cruza con ninguna caja y
   *   ensucia el seguimiento.
   *
   * Vacío mientras no se sepa. Las consultas ya se apagan solas con
   * `enabled`, y el formulario no se monta hasta que hay número.
   */
  const cajaCode = cajaQuery.data?.caja_modulo ?? '';

  // Botón de volver: la vista de la que se vino si consta, y si no el acta de
  // la caja. Nunca salta directamente a la lista de clientes salvo que la caja
  // no tenga acta.
  const retorno = retornoDeCaja(location.state, cajaQuery.data);

  const fuidQuery = useQuery({
    queryKey: ['fuiddatosreal', 'list', cajaCode],
    queryFn: () => fuidApi.list({ caja: cajaCode }).then((res) => res.data),
    enabled: Boolean(cajaCode),
    // Dos técnicas pueden digitar en la misma caja: la tabla muestra lo que
    // lleva la otra sin tener que recargar.
    refetchInterval: intervaloRefresco(Boolean(cajaCode)),
  });

  // El técnico necesita fijar su UPD de arranque antes de digitar en esta caja.
  const esTecnica = tieneRol(user, 'TECNICA');
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

  /*
   * Para la lista, el último digitado primero.
   *
   * El formulario está justo encima, así que el registro que se acaba de
   * guardar aparece pegado a él y se ve sin desplazarse. Con el orden natural
   * del documento, en una caja de doscientos registros el recién guardado caía
   * al fondo y había que ir a buscarlo, que es justo lo contrario de poder
   * comprobar lo que se va haciendo.
   */
  const registrosParaLista = useMemo(
    () =>
      [...registros].sort((a, b) => {
        const creadoA = a.created_at ?? '';
        const creadoB = b.created_at ?? '';
        if (creadoA !== creadoB) return creadoB.localeCompare(creadoA);
        return (b.n_orden ?? b.id) - (a.n_orden ?? a.id);
      }),
    [registros],
  );

  /*
   * Todo lo del registro es buscable, no solo lo que se ve en la tabla.
   *
   * Quien busca se acuerda de cualquier cosa: del número de documento, de una
   * palabra de las notas, de quién lo digitó. Limitar la búsqueda a las columnas
   * visibles obligaría a saber de antemano en qué campo está lo que se recuerda,
   * que es justo lo que no se sabe. Por eso entran también los campos que la
   * tabla no muestra.
   */
  const registrosFiltrados = useMemo(
    () =>
      filtrarPorTexto(registrosParaLista, filtro, (r) => [
        r.n_orden,
        r.upd,
        r.caja,
        r.codigo,
        r.entidad_remitente,
        r.entidad_productora,
        r.unidad_administrativa,
        r.oficina_productora,
        r.objeto,
        r.serie,
        r.subserie,
        r.asunto,
        r.asunto_2,
        r.asunto_3,
        r.numero_doc,
        r.numero_doc_hasta,
        r.fecha_inicial,
        r.fecha_final,
        r.fecha_del_dato,
        r.tomo,
        r.otro,
        r.caja_interna,
        r.folios,
        r.soporte,
        r.frecuencia,
        r.notas,
        r.elaborado_por,
        r.nro_acta_transferible,
        r.historial_y_cambios === 'OK' ? 'OK REVISADO' : 'SIN REVISAR',
      ]),
    [registrosParaLista, filtro],
  );
  const filtrando = filtro.trim() !== '';

  /*
   * Estado de la caja, con lo que ya está cargado: ninguna petición más. Se
   * muestra porque quien digita necesita saber si esta caja viene de días
   * anteriores, y porque el estado ya no lo marca nadie a mano: el servidor lo
   * deduce de esta misma digitación.
   */
  const estadoCaja = useMemo(() => {
    const fechas = registros.map((r) => r.fecha_del_dato).filter((f): f is string => Boolean(f));
    return estadoDeCaja(
      {
        estado: cajaQuery.data?.estado_caja,
        registros: registros.length,
        desde: fechas.length > 0 ? fechas.reduce((a, b) => (a < b ? a : b)) : null,
        fechaFinalizacion: cajaQuery.data?.fecha_finalizacion,
        reabiertaPor: cajaQuery.data?.reabierta_por,
      },
      fechaHoyLocal(),
    );
  }, [cajaQuery.data?.estado_caja, cajaQuery.data?.fecha_finalizacion, cajaQuery.data?.reabierta_por, registros]);

  const defaultNOrden = useMemo(() => {
    if (registros.length === 0) return 1;
    return Math.max(...registros.map((registro) => registro.n_orden ?? 0)) + 1;
  }, [registros]);

  /*
   * Caja interna con la que se abre un registro nuevo: la del **primer**
   * registro de la caja.
   *
   * No es un dato del documento sino de la caja: se decide al empezar y vale
   * para todo lo que entre después. Por eso se toma del primero por número de
   * orden y no del último digitado, que es como se hacía antes: aquel iba
   * cambiando y obligaba a comprobar el campo en cada registro. Con la caja
   * vacía no hay de dónde tomarla y el campo abre en blanco, que es cuando la
   * persona la decide.
   */
  const cajaInternaDeLaCaja = useMemo<string>(() => {
    const primero = registros.reduce<FuidDato | null>(
      (menor, registro) =>
        (registro.n_orden ?? Number.MAX_SAFE_INTEGER) < (menor?.n_orden ?? Number.MAX_SAFE_INTEGER)
          ? registro
          : menor,
      null,
    );
    return sinNA(primero?.caja_interna);
  }, [registros]);

  /*
   * Asunto automático con el que se abre un registro nuevo: el del último que se
   * digitó en la caja. Se toma el de mayor número de orden, no el último que
   * devuelva la consulta, porque el orden de las filas no está garantizado.
   *
   * El asunto manual no entra aquí a propósito: es el único texto que describe
   * el documento concreto, así que cada registro lo escribe desde cero.
   */
  const asuntoAutomaticoDeLaCaja = useMemo<string>(() => {
    const ultimo = registros.reduce<FuidDato | null>(
      (mayor, registro) => ((registro.n_orden ?? 0) >= (mayor?.n_orden ?? -1) ? registro : mayor),
      null,
    );
    return sinNA(ultimo?.asunto_2);
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

  /** Registros marcados que se van a borrar de una vez; null cuando no hay diálogo abierto. */
  const [borradoMultiple, setBorradoMultiple] = useState<number[] | null>(null);
  /*
   * UPD del último registro guardado, para señalar su fila en la lista.
   *
   * Guardar manda el registro a una tabla de veinticinco columnas y la lista
   * va de lo más nuevo a lo más viejo, así que aparece arriba; aun así, sin
   * nada que lo distinga hay que buscarlo. Se recuerda por UPD y no por id
   * porque el formulario conoce el UPD en el acto, sin esperar a que la
   * consulta traiga el registro con su identificador.
   *
   * Se olvida solo: la marca es para el instante de guardar, no un estado que
   * haya que mantener.
   */
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null>(null);

  useEffect(() => {
    if (!ultimoGuardado) return;
    const temporizador = setTimeout(() => setUltimoGuardado(null), 1800);
    return () => clearTimeout(temporizador);
  }, [ultimoGuardado]);

  /*
   * Borrar los registros marcados, uno por uno contra el mismo endpoint.
   *
   * No se manda la lista entera al servidor en una sola llamada a propósito:
   * el permiso de borrado se decide **registro a registro** —la técnica solo
   * borra lo suyo y del mismo día, el líder lo de su sede— y cada borrado deja
   * su copia en el historial y su línea en la auditoría. Un endpoint en lote
   * tendría que repetir esas reglas, y repetirlas es como se acaban relajando.
   *
   * En serie y no en paralelo porque las conexiones contra la base son un cupo
   * compartido (ver `DB_CONNECTION_LIMIT`), y borrar no es una operación que se
   * haga a cada rato: que tarde un segundo más no le cuesta nada a nadie.
   *
   * Lo que sí importa es contar la verdad al final: si de diez marcados dos
   * estaban fuera de su alcance, se dice cuántos se fueron y cuántos no, en vez
   * de un "listo" que esconde la mitad.
   */
  const borrarVariosMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      let eliminados = 0;
      const fallos: string[] = [];
      for (const id of ids) {
        try {
          await fuidApi.remove(id);
          eliminados += 1;
        } catch (error) {
          fallos.push(getApiErrorMessage(error));
        }
      }
      return { eliminados, fallos };
    },
    onSuccess: ({ eliminados, fallos }) => {
      if (eliminados > 0) {
        toast.success(
          `${eliminados} ${eliminados === 1 ? 'registro eliminado' : 'registros eliminados'}`,
        );
      }
      if (fallos.length > 0) {
        // El mismo motivo se repite para todos los que fallan por lo mismo.
        const motivo = [...new Set(fallos)][0];
        toast.error(
          `${fallos.length} no se ${fallos.length === 1 ? 'pudo' : 'pudieron'} eliminar: ${motivo}`,
        );
      }
      setSelectedIds(new Set());
      setBorradoMultiple(null);
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => {
      setBorradoMultiple(null);
      toastApiError(error, { context: 'No se pudieron eliminar los registros:' });
    },
  });

  /** Finalizar caja en proceso (solo para técnica asignada). */
  const finalizarCajaMutation = useMutation({
    mutationFn: (id: string | number) => modulosCajaApi.cambiarEstado(id, 'FINALIZADO'),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Caja finalizada');
      void invalidateDomain(queryClient, 'modulos-caja');
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo finalizar la caja:' });
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

  /*
   * Seleccionar todo abarca lo que está a la vista, no la caja entera. Con un
   * filtro puesto, marcar como revisado lo que el filtro esconde sería tocar
   * registros que nadie está mirando.
   */
  const allSelected =
    registrosFiltrados.length > 0 && registrosFiltrados.every((registro) => selectedIds.has(registro.id));

  /*
   * Hay casillas si con lo marcado se puede hacer algo: revisar en lote o
   * eliminar en lote. Antes solo aparecían para revisar, así que quien podía
   * borrar pero no revisar tenía que ir registro por registro.
   */
  const puedeSeleccionar = canMarcarOk || canEliminar;

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
    else setSelectedIds(new Set(registrosFiltrados.map((registro) => registro.id)));
  };

  const openEditar = (registro: FuidDato) => setEditing(registro);
  const cerrarEdicion = () => setEditing(null);

  /*
   * Solo lo que distingue un registro de otro.
   *
   * La entidad remitente, la entidad productora y el número de caja valen lo
   * mismo en todos los registros de la caja, y esta pantalla es la de una caja:
   * repetirlos en cada fila ensanchaba la tabla hasta empujar la columna de
   * acciones fuera de la pantalla, que es justo el botón que hay que alcanzar
   * para corregir. Lo que no cabe se ve en el propio registro al abrirlo.
   */
  /*
   * Todas las columnas del FUID, en el mismo orden en que se digitan.
   *
   * Antes la tabla mostraba ocho campos de los veintiuno que se llenan arriba,
   * así que para comprobar lo que acababa de escribir había que abrir el
   * registro uno por uno. Un FUID es un inventario: la forma natural de
   * revisarlo es verlo entero, columna por columna, como la hoja de la que
   * sale. La tabla desborda a lo ancho y se desplaza, con la columna del
   * número de orden fija para no perder de vista de qué fila se trata.
   *
   * Cada celda muestra lo que hay guardado, sin traducir nada: esta tabla es
   * para comprobar contra el documento en la mano, y ahí un valor cambiado
   * por otro más bonito es un error que no se ve.
   */
  const campo = (
    key: keyof FuidDato,
    header: string,
    opciones: { ancho?: string; mono?: boolean } = {},
  ): Column<FuidDato> => ({
    key,
    header,
    render: (registro: FuidDato) => {
      /*
       * Tal como está guardado, `N/A` incluido. En el formulario ese marcador
       * se oculta —quien digita no debe escribirlo ni verlo—, pero aquí no:
       * en una vista de consulta `N/A` es información, dice que alguien miró
       * el documento y ese dato no estaba. Un hueco en blanco no dice eso. El
       * guion queda solo para lo realmente nulo, que no debería existir.
       */
      const valor = (registro[key] as string | null | undefined)?.toString().trim();
      if (!valor) return <span className="text-silver-300">—</span>;
      return (
        <span
          className={cn('block truncate', opciones.ancho ?? 'max-w-[16rem]', opciones.mono && 'font-mono')}
          title={valor}
        >
          {valor}
        </span>
      );
    },
  });

  const columns: Column<FuidDato>[] = [
    {
      /*
       * Identidad de la fila y selección en la misma celda: es la única
       * columna que queda fija al desplazarse en horizontal, y separarlas
       * dejaría la casilla sin decir a qué registro pertenece.
       */
      key: 'n_orden',
      header: puedeSeleccionar ? (
        <span className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Seleccionar todos los registros"
          />
          N°
        </span>
      ) : (
        'N°'
      ),
      render: (registro: FuidDato) => (
        <span className="flex items-center gap-2 font-medium text-silver-800">
          {puedeSeleccionar && (
            <input
              type="checkbox"
              checked={selectedIds.has(registro.id)}
              onChange={() => toggleRow(registro.id)}
              aria-label={`Seleccionar registro ${registro.n_orden_caja ?? registro.n_orden ?? registro.id}`}
            />
          )}
          {registro.n_orden_caja ?? registro.n_orden ?? '—'}
        </span>
      ),
    },
    campo('upd', 'UPD', { ancho: 'max-w-[9rem]', mono: true }),
    campo('entidad_productora', 'Entidad Productora'),
    campo('unidad_administrativa', 'Unidad Administrativa'),
    campo('oficina_productora', 'Oficina Productora'),
    campo('objeto', 'Objeto'),
    campo('codigo', 'Código', { ancho: 'max-w-[7rem]' }),
    campo('serie', 'Serie', { ancho: 'max-w-[9rem]' }),
    campo('subserie', 'Subserie', { ancho: 'max-w-[9rem]' }),
    campo('asunto_2', 'Asunto Automático', { ancho: 'max-w-[20rem]' }),
    campo('asunto_3', 'Asunto Manual', { ancho: 'max-w-[20rem]' }),
    campo('numero_doc', 'Doc. Desde', { ancho: 'max-w-[8rem]' }),
    campo('numero_doc_hasta', 'Doc. Hasta', { ancho: 'max-w-[8rem]' }),
    {
      key: 'fechas',
      header: 'Fechas del documento',
      render: (registro: FuidDato) => {
        const inicial = registro.fecha_inicial?.slice(0, 10);
        const final = registro.fecha_final?.slice(0, 10);
        if (!inicial && !final) return <span className="text-silver-300">—</span>;
        return `${inicial ?? '?'} – ${final ?? '?'}`;
      },
    },
    campo('tomo', 'Tomo', { ancho: 'max-w-[6rem]' }),
    campo('otro', 'Otro', { ancho: 'max-w-[8rem]' }),
    campo('caja_interna', 'Caja Interna', { ancho: 'max-w-[8rem]' }),
    campo('folios', 'Folios', { ancho: 'max-w-[6rem]' }),
    campo('soporte', 'Soporte', { ancho: 'max-w-[8rem]' }),
    campo('frecuencia', 'Frecuencia', { ancho: 'max-w-[8rem]' }),
    campo('notas', 'Notas', { ancho: 'max-w-[18rem]' }),
    campo('elaborado_por', 'Digitado por', { ancho: 'max-w-[14rem]' }),
    // No. ACTA DE TRANSFERENCIA: formato ACTA {numero}_{añoCreacionActa}
    {
      key: 'acta_transferencia',
      header: 'No. ACTA DE TRANSFERENCIA',
      render: () => {
        const numero = actaQuery.data?.acta_transferencia_modulo ?? '';
        const año = actaQuery.data?.created_at ? new Date(actaQuery.data.created_at).getFullYear() : '';
        if (!numero) return <span className="text-silver-300">—</span>;
        return <span className="font-mono text-silver-800">{año ? `ACTA ${numero}_${año}` : `ACTA ${numero}`}</span>;
      },
    },
    {
      key: 'created_at',
      header: 'Creado',
      render: (registro: FuidDato) => formatearFechaHora(registro.created_at),
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
        /*
         * Solo iconos: la columna de acciones se repite en cada fila y el texto
         * la ensanchaba sin decir nada nuevo. El rótulo va en el título y en la
         * etiqueta accesible, con el UPD, para saber sobre qué registro se actúa.
         */
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditar(registro)}
            title={`Editar ${registro.upd ?? 'este registro'}`}
            aria-label={`Editar ${registro.upd ?? 'este registro'}`}
          >
            <Pencil className="size-4" />
          </Button>
          {canEliminar && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(registro)}
              title={`Eliminar ${registro.upd ?? 'este registro'}`}
              aria-label={`Eliminar ${registro.upd ?? 'este registro'}`}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {requiereUpdInicio && (
        <UpdInicioDialog
          open
          cajaCode={cajaCode}
          volverA={retorno.to}
          onListo={() => void updInicioQuery.refetch()}
          mensaje={updInicioQuery.data?.message}
        />
      )}

      <PageHeader
        title={cajaCode ? `Digitación FUID — Caja ${cajaCode}` : 'Digitación FUID'}
        description={estadoCaja.detalle ?? 'Clientes / Actas / Cajas / Digitación'}
        backTo={retorno.to}
        backLabel={retorno.label}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={estadoCaja.color}>{estadoCaja.etiqueta}</Badge>
            {/*
              Cerrar el día se decide aquí, sin salir de la digitación: es donde
              está la persona cuando deja la caja, y al lado del estado, que es
              lo que la declaración cambia.
            */}
            {cajaQuery.data?.id && <CierreDeJornada cajaId={cajaQuery.data.id} />}
            {/* Finalizar caja: solo para técnica asignada, cuando está EN PROCESO */}
            {esTecnica &&
              cajaQuery.data?.estado_caja === 'EN PROCESO' &&
              cajaQuery.data?.id && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => finalizarCajaMutation.mutate(cajaQuery.data!.id)}
                  loading={finalizarCajaMutation.isPending && finalizarCajaMutation.variables === cajaQuery.data!.id}
                >
                  <CheckCircle className="size-4" /> Finalizar caja
                </Button>
              )}
          </div>
        }
      />

      {/*
        El formulario vive fijo en la pantalla, encima de la lista. Digitar es
        lo que se hace aquí todo el día: abrir y cerrar un diálogo por cada
        registro era un paso de más en cada vuelta, y mientras estaba abierto
        tapaba lo ya digitado. Ahora se escribe arriba y el registro aparece
        abajo, en la misma pantalla y sin moverse de sitio.
      */}
      {/*
        Sin saber en qué caja se está, no hay formulario.

        Es la otra mitad del arreglo: aunque el número ya no se inventa, dejar
        el formulario a la vista con la caja vacía permitiría escribir un
        registro que no se puede guardar. Son décimas de segundo y lo que se ve
        mientras tanto es que la pantalla está cargando, no un formulario que
        engaña.
      */}
      {canCrear && !cajaCode && (
        <Card padding="p-4">
          <div className="flex justify-center py-8">
            <LoadingState
              message={
                cajaQuery.isError
                  ? 'No se pudo cargar la caja. Recarga la página para volver a intentarlo.'
                  : 'Estamos abriendo la caja…'
              }
            />
          </div>
        </Card>
      )}

      {canCrear && cajaCode && (
        /*
         * Denso a propósito. El formulario comparte pantalla con la lista de
         * registros, y si se lleva todo el alto hay que desplazarse para ver lo
         * que se acaba de guardar, que es justo lo que esta disposición busca
         * evitar. No lleva encabezado propio: la cabecera de la página ya dice
         * que esto es la digitación de la caja, y el botón dice qué hace.
         */
        <Card padding="p-4">
          <FormularioFuid
            cajaId={cajaCode}
            editing={null}
            defaultNOrden={defaultNOrden}
            asuntoAutomaticoDeLaCaja={asuntoAutomaticoDeLaCaja}
            cajaInternaDeLaCaja={cajaInternaDeLaCaja}
            caja={cajaQuery.data}
            onGuardado={setUltimoGuardado}
          />
        </Card>
      )}

      {fuidQuery.isPending ? (
        <Card>
          <div className="flex justify-center py-10">
            <LoadingState message="Estamos consultando la información…" />
          </div>
        </Card>
      ) : registros.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12">
          <p className="text-sm text-silver-500">
            Todavía no hay registros en esta caja. El primero que guardes arriba aparecerá aquí.
          </p>
        </Card>
      ) : (
        <>
          {/*
            Un solo campo que busca en todo el registro, incluidos los campos
            que la tabla no muestra. Al lado, cuántos quedan a la vista: sin eso
            no se distingue una búsqueda que no encontró nada de una lista que
            se quedó corta por otro motivo.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-72 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
              <Input
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
                placeholder="Buscar en los registros…"
                aria-label="Buscar en los registros"
                className="pl-9 pr-9"
              />
              {filtrando && (
                <button
                  type="button"
                  onClick={() => setFiltro('')}
                  aria-label="Limpiar la búsqueda"
                  title="Limpiar la búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-silver-400 transition-colors hover:bg-silver-100 hover:text-silver-700"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <p className="text-sm text-silver-600">
              {filtrando
                ? `${registrosFiltrados.length.toLocaleString('es-CO')} de ${registros.length.toLocaleString('es-CO')}`
                : `${registros.length.toLocaleString('es-CO')} ${registros.length === 1 ? 'registro' : 'registros'}`}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {canEliminar && selectedIds.size > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => setBorradoMultiple([...selectedIds])}
                  loading={borrarVariosMutation.isPending}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="size-4" />
                  Eliminar ({selectedIds.size})
                </Button>
              )}
              {canMarcarOk && (
                <Button
                  onClick={handleMarcarOk}
                  disabled={selectedIds.size === 0}
                  loading={marcarOkMutation.isPending}
                >
                  <CheckCircle2 className="size-4" />
                  Marcar como revisado{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </Button>
              )}
            </div>
          </div>
          <div key={`fuids-${cajaCode}`} className="form-fill-anim">
            <Table
              columns={columns}
              data={registrosFiltrados}
              rowKey={(registro) => registro.id}
              emptyMessage="Ningún registro coincide con la búsqueda"
              /*
               * `nowrap` es lo que hace que la tabla tome su ancho natural y
               * aparezca la barra horizontal; sin él, veintitantas columnas se
               * aprietan hasta quedar ilegibles. El alto máximo deja a la vista
               * el formulario mientras se revisa lo ya digitado.
               */
              nowrap
              stickyFirstColumn
              maxHeight="60vh"
              rowClassName={(registro) =>
                registro.upd && registro.upd === ultimoGuardado ? 'fuid-fila-nueva' : undefined
              }
            />
          </div>
        </>
      )}

      {/* Corregir un registro ya guardado sí es una acción puntual sobre una
          fila concreta, y para eso el diálogo es lo que corresponde. */}
      <Modal
        open={editing !== null}
        onClose={cerrarEdicion}
        title={editing ? `Editar registro ${editing.upd ?? ''}` : 'Editar registro'}
        size="xl"
      >
        {editing && (
          <FormularioFuid
            key={`edit-${editing.id}`}
            cajaId={cajaCode}
            editing={editing}
            defaultNOrden={defaultNOrden}
            asuntoAutomaticoDeLaCaja={asuntoAutomaticoDeLaCaja}
            cajaInternaDeLaCaja={cajaInternaDeLaCaja}
            caja={cajaQuery.data}
            onTerminar={cerrarEdicion}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={borradoMultiple !== null}
        title={`Eliminar ${borradoMultiple?.length ?? 0} ${(borradoMultiple?.length ?? 0) === 1 ? 'registro' : 'registros'}`}
        description={`Se eliminarán ${borradoMultiple?.length ?? 0} ${(borradoMultiple?.length ?? 0) === 1 ? 'registro seleccionado' : 'registros seleccionados'} de la caja ${cajaCode}. Queda copia de cada uno en el historial.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (borradoMultiple) borrarVariosMutation.mutate(borradoMultiple);
        }}
        onCancel={() => setBorradoMultiple(null)}
        loading={borrarVariosMutation.isPending}
      />

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
