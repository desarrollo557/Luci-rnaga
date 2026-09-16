import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  RefreshCcw,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  MenuDeAcciones,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  type AccionDeMenu,
  type Column,
} from '@/components/ui';
import { inventarioApi, type ActaDelCliente } from '@/lib/api';
import { toastApiError } from '@/lib/feedback';
import { cn } from '@/lib/cn';
import { descargarBlob } from '@/lib/utils';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { aFechaISO, fechaHoyLocal, formatearFecha, hace } from '@/lib/fechas';
import { type DataRow, type FuidConEstado, type Inventario, tieneAlgunRol } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const ESTADOS_INVENTARIO = ['PENDIENTE', 'EN PROCESO', 'FINALIZADO'];
const ESTADOS_ENTREGA = ['PENDIENTE', 'EN PROCESO', 'ENTREGADO'];

const FUID_PAGE_SIZE = 50;

/** Encabezado oficial del FUID (fila 8 del Excel) en el orden exacto: [header, campo BD]. */
const FUID_COLUMNS: ReadonlyArray<readonly [string, keyof FuidConEstado]> = [
  ['N° Orden', 'n_orden'],
  ['CÓDIGO', 'codigo'],
  ['ENTIDAD REMITENTE', 'entidad_remitente'],
  ['ENTIDAD PRODUCTORA', 'entidad_productora'],
  ['UNIDAD ADMINISTRATIVA', 'unidad_administrativa'],
  ['OFICINA PRODUCTORA', 'oficina_productora'],
  ['OBJETO', 'objeto'],
  ['SERIE', 'serie'],
  ['SUBSERIE', 'subserie'],
  ['ASUNTOS', 'asunto'],
  ['Desde', 'numero_doc'],
  ['Hasta', 'numero_doc_hasta'],
  ['Inicial', 'fecha_inicial'],
  ['Final', 'fecha_final'],
  ['CAJA', 'caja'],
  ['UPD', 'upd'],
  ['TOMO', 'tomo'],
  ['OTRO', 'otro'],
  ['CAJA INTERNA', 'caja_interna'],
  ['FOLIOS', 'folios'],
  ['SOPORTE', 'soporte'],
  ['FRECUENCIA', 'frecuencia'],
  ['NOTAS', 'notas'],
  ['ELABORADO POR', 'elaborado_por'],
  ['FECHA DE INVENTARIO', 'fecha_del_dato'],
  ['No. ACTA DE TRANSFERENCIA', 'nro_acta_transferible'],
  ['FECHA DE TRANSFERENCIA', 'fecha_transferencia'],
];

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

/**
 * Campos del formulario que describen un acta de transferencia: su número, su
 * fecha y el recuento y el rango de sus propias cajas.
 *
 * Los cuatro se reemplazan juntos porque describen lo mismo. Mezclarlos —el
 * número de un acta con las cajas de otra— dejaría un inventario que no cuadra
 * con ningún acta real.
 *
 * Sin acta se usan las cifras del cliente completo, que es el alcance del
 * inventario mientras no se acote a una.
 */
function camposDelActa(
  acta: ActaDelCliente | null,
  cliente: { totalCajas: number; cajaIniciar: string | null; cajaFin: string | null } | null,
): Record<string, string> {
  if (acta) {
    return {
      No_ACTA: acta.acta ?? '',
      FECHA_TRANSFERENCIA: acta.fecha ? aFechaISO(acta.fecha) : '',
      TOTAL_CAJAS: acta.totalCajas ? String(acta.totalCajas) : '',
      CAJA_INICIAR: acta.cajaIniciar ?? '',
      CAJ_FIN: acta.cajaFin ?? '',
    };
  }
  return {
    No_ACTA: '',
    FECHA_TRANSFERENCIA: '',
    TOTAL_CAJAS: cliente?.totalCajas ? String(cliente.totalCajas) : '',
    CAJA_INICIAR: cliente?.cajaIniciar ?? '',
    CAJ_FIN: cliente?.cajaFin ?? '',
  };
}

/**
 * Cómo de al día está un inventario respecto de lo que hay digitado.
 *
 * Compara los registros que el inventario tiene guardados con los que existen
 * ahora mismo en el sistema. Es la única forma de responder a "¿hace falta
 * actualizar esto?" sin abrirlo: una fecha de última modificación no lo dice,
 * porque un inventario leído ayer puede estar perfecto y uno leído hace una hora
 * puede haberse quedado corto en ese rato.
 *
 * La diferencia puede ser negativa si se borraron registros, y también cuenta
 * como desfase: el inventario dice más de lo que hay.
 */
type Frescura =
  | { estado: 'al-dia' }
  | { estado: 'desfasado'; diferencia: number }
  | { estado: 'sin-datos' };

function frescuraDe(row: Inventario): Frescura {
  const vivos = row.registros_vivos ?? 0;
  const guardados = row.REGISTROS_PROCESADOS ?? 0;
  if (vivos === 0 && guardados === 0) return { estado: 'sin-datos' };
  if (vivos === guardados) return { estado: 'al-dia' };
  return { estado: 'desfasado', diferencia: vivos - guardados };
}

interface ArbolDeActasProps {
  codigo: string;
  /** Clave de la descarga en curso, o null si no hay ninguna. */
  descargando: string | null;
  claveDescarga: (codigo: string, acta?: string | null) => string;
  onDescargar: (acta: string | null) => void;
  onVerPrevia: (acta: string | null) => void;
}

/**
 * Las actas de transferencia que cuelgan de un cliente, dentro de su fila del
 * inventario.
 *
 * El inventario se lleva por cliente, pero el trabajo se entrega por acta, así
 * que hacía falta ver de un vistazo cuántas actas tiene un cliente, qué cajas
 * abarca cada una y poder bajarse el FUID de una sola sin arrastrar el del resto.
 *
 * Las actas se piden al desplegar y no antes: la tabla lista muchos clientes y
 * preguntar por todos de entrada serían tantas consultas como filas.
 */
function ArbolDeActas({
  codigo,
  descargando,
  claveDescarga,
  onDescargar,
  onVerPrevia,
}: ArbolDeActasProps) {
  const actasQuery = useQuery({
    queryKey: ['inventario', 'actas', codigo],
    queryFn: () => inventarioApi.clienteParaInventario(codigo).then((r) => r.data.actas ?? []),
    enabled: Boolean(codigo),
  });

  const actas = actasQuery.data ?? [];
  const registrosVivos = actas.reduce((suma, acta) => suma + (acta.registros ?? 0), 0);
  const cajasVivas = actas.reduce((suma, acta) => suma + (acta.totalCajas ?? 0), 0);

  return (
    <div className="space-y-2 pl-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">
          {actas.length} {actas.length === 1 ? 'acta' : 'actas'} &middot; {cajasVivas}{' '}
          {cajasVivas === 1 ? 'caja' : 'cajas'} &middot; {registrosVivos.toLocaleString('es-CO')}{' '}
          {registrosVivos === 1 ? 'registro' : 'registros'}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => onVerPrevia(null)}>
            <Eye className="mr-2 size-4" />
            Ver todo el FUID
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={descargando === claveDescarga(codigo, null)}
            disabled={descargando !== null}
            onClick={() => onDescargar(null)}
          >
            <Download className="mr-2 size-4" />
            Descargar todo
          </Button>
        </div>
      </div>

      {actasQuery.isLoading && (
        <div className="flex items-center gap-2 py-3 text-sm text-silver-500">
          <Spinner className="size-4" />
          <span>Cargando las actas…</span>
        </div>
      )}

      {actasQuery.isError && (
        <p className="py-2 text-sm text-red-600">No se pudieron cargar las actas de este cliente.</p>
      )}

      {!actasQuery.isLoading && !actasQuery.isError && actas.length === 0 && (
        <p className="py-2 text-sm text-silver-500">Este cliente no tiene actas registradas.</p>
      )}

      {actas.map((acta, i) => {
        const ultima = i === actas.length - 1;
        const sinCajas = acta.totalCajas === 0;
        return (
          <div key={acta.id} className="relative pl-6">
            {/*
              Conector del árbol, dibujado con dos líneas en vez de con caracteres
              como "├─": la tipografía los recortaba y su ancho cambiaba con la
              fuente. El tramo vertical sube 0,5rem para cubrir la separación
              entre tarjetas y que la línea se lea continua; en la última acta se
              corta a media altura, que es donde la rama termina.
            */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-2 w-px bg-silver-300',
                ultima ? 'top-[-0.5rem] h-[calc(50%+0.5rem)]' : 'top-[-0.5rem] h-[calc(100%+0.5rem)]',
              )}
            />
            <span aria-hidden="true" className="absolute left-2 top-1/2 h-px w-3 bg-silver-300" />
            <div
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2',
                (acta.registrosSinReflejar ?? 0) > 0
                  ? 'border-amber-300 bg-amber-50/40'
                  : 'border-silver-200 bg-surface',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-silver-800">{acta.acta ?? 'SIN NÚMERO'}</span>
                <span className="text-xs text-silver-500">
                  {acta.totalCajas} {acta.totalCajas === 1 ? 'caja' : 'cajas'} &middot;{' '}
                  {(acta.registros ?? 0).toLocaleString('es-CO')}{' '}
                  {acta.registros === 1 ? 'registro' : 'registros'}
                </span>
                {/*
                  Cuenta exacta, no una estimación: son los registros de esta
                  acta creados después de la última lectura del inventario.
                */}
                {(acta.registrosSinReflejar ?? 0) > 0 && (
                  <Badge color="amber">
                    {acta.registrosSinReflejar.toLocaleString('es-CO')} sin reflejar
                  </Badge>
                )}
                {acta.cajaIniciar && acta.cajaFin && (
                  <span className="text-xs text-silver-500">
                    {acta.cajaIniciar} a {acta.cajaFin}
                  </span>
                )}
                {acta.fecha && (
                  <span className="text-xs text-silver-500">{formatearFecha(acta.fecha)}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={sinCajas}
                  onClick={() => onVerPrevia(acta.acta)}
                  aria-label={`Ver el FUID del acta ${acta.acta ?? ''}`}
                  title={sinCajas ? 'Esta acta no tiene cajas' : `Ver el FUID del acta ${acta.acta ?? ''}`}
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={descargando === claveDescarga(codigo, acta.acta)}
                  disabled={sinCajas || descargando !== null}
                  onClick={() => onDescargar(acta.acta)}
                  aria-label={`Descargar el FUID del acta ${acta.acta ?? ''}`}
                  title={sinCajas ? 'Esta acta no tiene cajas' : `Descargar el FUID del acta ${acta.acta ?? ''}`}
                >
                  <Download className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
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
          ? 'border-primary-500 bg-brand text-white shadow-sm shadow-brand/30'
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
  const canEdit = tieneAlgunRol(user, ['LIDER', 'ADMIN']);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Inventario | null>(null);
  const [form, setForm] = useState<InventarioForm>(emptyForm());
  const [deleting, setDeleting] = useState<Inventario | null>(null);
  const [detalle, setDetalle] = useState<Inventario | null>(null);
  /*
   * Acta a la que está acotada la vista previa abierta, o null para el cliente
   * entero. Va aparte de `detalle` porque el inventario es el mismo: lo único
   * que cambia es cuánto de su FUID se está mirando.
   */
  const [detalleActa, setDetalleActa] = useState<string | null>(null);
  const [fuidPage, setFuidPage] = useState(0);
  const [fuidQ, setFuidQ] = useState('');
  const [fuidQInput, setFuidQInput] = useState('');
  const [page, setPage] = useState(0);
  const [fillVersion, setFillVersion] = useState(0);
  const [cargandoCliente, setCargandoCliente] = useState(false);
  /*
   * Actas del cliente elegido en el formulario. Un cliente puede tener varias, y
   * de ahí sale el selector de N° Acta: con una sola el campo se comporta como
   * siempre, y con varias hay que decir de cuál habla este inventario.
   */
  const [actasDelCliente, setActasDelCliente] = useState<ActaDelCliente[]>([]);
  /*
   * Clientes cuyo árbol de actas está desplegado en la tabla, por su ITEMS. Se
   * guarda aquí y no en la tabla porque es la pantalla la que decide qué se abre.
   */
  const [desplegados, setDesplegados] = useState<Set<number>>(new Set());
  /** Inventario cuyas cifras se están recalculando, por su ITEMS. */
  const [recalculando, setRecalculando] = useState<number | null>(null);
  /** Si el bloque de filtros secundarios esta desplegado. */
  const [masFiltros, setMasFiltros] = useState(false);
  /*
   * Creacion en un paso. Antes, "Nuevo inventario" abria el formulario entero de
   * veintiun campos para algo que solo necesita saber de que cliente se trata:
   * las cifras las cuenta el sistema y la gestion se llena despues, cuando el
   * trabajo avanza. Aqui solo se elige el cliente y se ve que se va a crear.
   */
  const [creando, setCreando] = useState(false);
  const [codigoNuevo, setCodigoNuevo] = useState('');

  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [estadoEntrega, setEstadoEntrega] = useState('');
  const [funcionario, setFuncionario] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: async () => (await inventarioApi.list()).data,
  });

  const { data: clientesParaInventario = [] } = useQuery({
    queryKey: ['inventario-clientes'],
    queryFn: async () => (await inventarioApi.clientesParaInventario()).data,
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFuidQ(fuidQInput);
    }, 300);
    return () => clearTimeout(timeout);
  }, [fuidQInput]);

  const fuidQuery = useQuery({
    queryKey: ['inventario-fuid', detalle?.ITEMS, detalleActa, fuidPage, fuidQ],
    queryFn: async () =>
      (
        await inventarioApi.fuid(detalle!.ITEMS, {
          limit: FUID_PAGE_SIZE,
          offset: fuidPage * FUID_PAGE_SIZE,
          q: fuidQ || undefined,
          acta: detalleActa,
        })
      ).data,
    enabled: detalle !== null,
  });

  const fuidColumns = useMemo<Column<FuidConEstado>[]>(() => {
    const dateFields = new Set<string>(['fecha_inicial', 'fecha_final', 'fecha_del_dato', 'fecha_transferencia']);
    return [
      {
        key: 'ESTADO_CAJA',
        header: 'Estado Caja',
        render: (row) => {
          const estado = row.estado_caja;
          const color =
            estado === 'PROCESADA' || estado === 'PROCESADO' ? 'green' : estado === 'EN PROCESO' ? 'amber' : 'gray';
          return <Badge color={color}>{estado || 'Sin estado'}</Badge>;
        },
      },
      ...FUID_COLUMNS.map(([header, campo]) => ({
        key: header,
        header,
        render: (row: FuidConEstado) => (
          <span>{dateFields.has(campo) ? formatearFecha(row[campo] as string | null) : (row[campo] ?? '—')}</span>
        ),
      })),
    ];
  }, []);

  const fuidTotal = fuidQuery.data?.total ?? 0;
  const fuidTotalPages = Math.max(1, Math.ceil(fuidTotal / (fuidQuery.data?.limit ?? FUID_PAGE_SIZE)));

  const clientOptions = useMemo(() => {
    // Deduplica por código: hay moduloscliente con el mismo codigo pero distinto remitente,
    // y el Select usa el código como key (React rompe con keys duplicadas).
    const unicos = new Map<string, { codigo: string; entidad_remitente: string }>();
    for (const c of clientesParaInventario) {
      if (!unicos.has(c.codigo)) unicos.set(c.codigo, c);
    }
    return Array.from(unicos.values())
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.entidad_remitente}` }));
  }, [clientesParaInventario]);

  const selectOptions = useMemo(() => {
    const options = [...clientOptions];
    const current = form.CODIGO_DEL_CLIENTE;
    if (current && !options.some((o) => o.value === current)) {
      options.unshift({ value: current, label: form.CLIENTE ? `${current} — ${form.CLIENTE}` : current });
    }
    return options;
  }, [clientOptions, form.CODIGO_DEL_CLIENTE, form.CLIENTE]);

  const handleClientCodeChange = async (codigo: string) => {
    setForm((prev) => ({ ...prev, CODIGO_DEL_CLIENTE: codigo }));
    if (!codigo) {
      setActasDelCliente([]);
      return;
    }
    setCargandoCliente(true);
    try {
      const { data: pkg } = await inventarioApi.clienteParaInventario(codigo);
      setActasDelCliente(pkg.actas ?? []);
      // El acta que se propone es la primera del cliente, que es la que el
      // formulario traía antes. Con varias, el selector deja cambiarla.
      const primera = pkg.actas?.[0] ?? null;
      setForm((prev) => ({
        ...prev,
        CODIGO_DEL_CLIENTE: codigo,
        CLIENTE: pkg.cliente.entidad_remitente ?? '',
        ...camposDelActa(primera, pkg),
      }));
      setFillVersion((v) => v + 1);
    } catch {
      setActasDelCliente([]);
      toast.error('No se pudo cargar la información del cliente');
    } finally {
      setCargandoCliente(false);
    }
  };

  /**
   * Cambio de acta dentro del formulario: el número, la fecha de transferencia y
   * las cifras de cajas describen el acta elegida, no el cliente entero. Si no se
   * reemplazaran juntas, el inventario diría un acta y contaría las cajas de otra.
   */
  const handleActaChange = (numeroDeActa: string) => {
    const acta = actasDelCliente.find((a) => (a.acta ?? '') === numeroDeActa) ?? null;
    setForm((prev) => ({ ...prev, ...camposDelActa(acta, null), No_ACTA: numeroDeActa }));
    setFillVersion((v) => v + 1);
  };

  const funcionarios = useMemo(
    () => Array.from(new Set(rows.map((r) => r.FUNCIONARIO).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
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
      if (desde || hasta) {
        // Se compara como texto YYYY-MM-DD: pasar la fecha por `new Date()` la
        // ponía en la medianoche UTC, que en Colombia es el día anterior, y el
        // primer día del rango quedaba fuera.
        const fecha = aFechaISO(row.FECHA_TRANSFERENCIA);
        if (!fecha) return false;
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
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
        toast.success(editing ? 'Inventario actualizado. Documento subido a Zoho Sheet' : 'Inventario creado. Documento subido a Zoho Sheet');
      } else if (sync?.state === 'ERROR') {
        toast.error('Inventario guardado, pero falló la subida a Zoho Sheet: ' + (sync.error ?? 'Error desconocido'));
      } else {
        toast.success(editing ? 'Inventario actualizado correctamente' : 'Inventario creado correctamente');
      }
      setModalOpen(false);
    },
    onError: (error) => {
      toastApiError(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await inventarioApi.remove(id);
    },
    onSuccess: async () => {
      void invalidateDomain(queryClient, 'inventario');
      toast.success('Inventario eliminado');
      setDeleting(null);
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo eliminar el inventario:' });
    },
  });

  /**
   * Qué descarga está en curso, identificada por cliente y acta.
   *
   * Hace falta la pareja y no un simple booleano porque en el árbol conviven
   * varios botones a la vez: el del cliente y el de cada una de sus actas. Con
   * una sola marca se pondrían todos a girar.
   */
  const [descargando, setDescargando] = useState<string | null>(null);
  const claveDescarga = (codigo: string, acta?: string | null) => `${codigo}|${acta ?? ''}`;

  /**
   * Descarga el FUID de un cliente en Excel.
   *
   * Sin `acta` baja el documento completo del cliente; con ella, solo el de esa
   * acta de transferencia. El nombre del archivo lleva el acta cuando la hay,
   * para distinguir varios archivos del mismo cliente en la carpeta de descargas.
   *
   * Va por el código del cliente y no por el identificador del inventario para
   * que funcione igual desde el árbol y desde el formulario, incluso cuando el
   * inventario todavía no se ha guardado.
   *
   * El servidor responde con el archivo, pero también puede responder con un
   * error en JSON —por ejemplo si esa acta no tiene registros—; como la petición
   * pide un blob, ese mensaje llega como blob y hay que leerlo para mostrarlo.
   */
  const descargarFuid = async (
    codigo: string | null | undefined,
    acta: string | null,
    nombreCliente?: string | null,
  ) => {
    if (!codigo) {
      toast.error('El inventario no tiene código de cliente, no hay de dónde sacar el FUID');
      return;
    }
    setDescargando(claveDescarga(codigo, acta));
    try {
      const respuesta = await inventarioApi.descargarExcelDeCliente(codigo, acta);
      const limpio = (valor: unknown) => String(valor ?? '').replace(/[^A-Za-z0-9]+/g, '_');
      const porActa = acta ? `_Acta_${limpio(acta)}` : '';
      const nombre = `Inventario_${limpio(nombreCliente ?? codigo)}${porActa}_${fechaHoyLocal()}.xlsx`;
      descargarBlob(respuesta.data as Blob, nombre);
      toast.success(acta ? `FUID del acta ${acta} descargado` : 'FUID completo del cliente descargado');
    } catch (error) {
      const datos = (error as { response?: { data?: unknown } }).response?.data;
      if (datos instanceof Blob) {
        try {
          const { error: mensaje } = JSON.parse(await datos.text()) as { error?: string };
          toast.error(mensaje ?? 'No se pudo descargar el FUID');
          return;
        } catch {
          // No era JSON: cae al aviso genérico de abajo.
        }
      }
      toastApiError(error, { context: 'No se pudo descargar el FUID:' });
    } finally {
      setDescargando(null);
    }
  };

  /**
   * Vuelve a leer del sistema las cifras del inventario y las guarda.
   *
   * El aviso dice qué cambió y no solo que terminó: quien pulsa el botón quiere
   * saber si entró trabajo nuevo desde la última vez, y un "listo" no responde a
   * eso. Cuando nada cambió, también se dice, que es una respuesta útil.
   */
  const recalcularMutation = useMutation({
    mutationFn: async (row: Inventario) => {
      setRecalculando(row.ITEMS);
      return (await inventarioApi.recalcular(row.ITEMS)).data;
    },
    onSuccess: async (datos) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      const { antes, ahora } = datos;
      const cambioCajas = (antes.totalCajas ?? 0) !== ahora.totalCajas;
      const cambioRegistros = (antes.registros ?? 0) !== ahora.registros;
      if (!cambioCajas && !cambioRegistros) {
        toast.success('El inventario ya estaba al día');
        return;
      }
      const partes = [];
      if (cambioCajas) partes.push(`cajas ${antes.totalCajas ?? 0} → ${ahora.totalCajas}`);
      if (cambioRegistros) partes.push(`registros ${antes.registros ?? 0} → ${ahora.registros}`);
      toast.success(`Inventario actualizado: ${partes.join(', ')}`);
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo actualizar el inventario:' });
    },
    onSettled: () => setRecalculando(null),
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => inventarioApi.sync(id),
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      const sync = resp.data.sync;
      if (sync.state === 'SUBIDO') {
        toast.success('Documento subido a Zoho Sheet');
      } else {
        toast.error('Error al subir: ' + (sync.error ?? 'desconocido'));
      }
    },
    onError: () => toast.error('Error al reintentar la subida a Zoho Sheet'),
  });

  const retrySync = (row: Inventario) => retryMutation.mutate(row.ITEMS);

  const openCreate = () => {
    setCodigoNuevo('');
    setCreando(true);
  };

  /** Lo que hay en el sistema para el cliente elegido, para mostrarlo antes de crear. */
  const resumenNuevoQuery = useQuery({
    queryKey: ['inventario', 'resumen-cliente', codigoNuevo],
    queryFn: () => inventarioApi.clienteParaInventario(codigoNuevo).then((r) => r.data),
    enabled: creando && Boolean(codigoNuevo),
  });

  const yaTieneInventario = useMemo(
    () => rows.some((row) => row.CODIGO_DEL_CLIENTE === codigoNuevo),
    [rows, codigoNuevo],
  );

  const crearMutation = useMutation({
    mutationFn: async () => {
      const paquete = resumenNuevoQuery.data;
      // Solo se manda lo que identifica al cliente y su primera acta. El resto lo
      // calcula el servidor al crear, que es quien sabe contar cajas y registros.
      const primera = paquete?.actas?.[0] ?? null;
      const data: DataRow = {
        CODIGO_DEL_CLIENTE: codigoNuevo,
        CLIENTE: paquete?.cliente.entidad_remitente ?? null,
        No_ACTA: primera?.acta ?? null,
        FECHA_TRANSFERENCIA: primera?.fecha ? aFechaISO(primera.fecha) : null,
        ESTADO_DEL_INVENTARIO: 'PENDIENTE',
        ESTADO_ENTREGA: 'PENDIENTE',
      };
      return await inventarioApi.create(data);
    },
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      const sync = resp.data?.sync;
      if (sync?.state === 'ERROR') {
        toast.error(`Inventario creado, pero fallo la subida a Zoho Sheet: ${sync.error ?? 'error desconocido'}`);
      } else {
        toast.success('Inventario creado con los datos del sistema');
      }
      setCreando(false);
    },
    onError: (error) => {
      toastApiError(error, { context: 'No se pudo crear el inventario:' });
    },
  });

  const openEdit = (row: Inventario) => {
    setEditing(row);
    setForm(toForm(row));
    setModalOpen(true);
    // Las actas del cliente se traen también al editar: sin ellas el campo N°
    // Acta seguiría siendo de texto libre en un inventario ya creado, y quien
    // corrige no vería de qué actas puede elegir.
    void cargarActasDelCliente(row.CODIGO_DEL_CLIENTE);
  };

  /** Actas del cliente, para el selector del formulario. Falla en silencio. */
  const cargarActasDelCliente = async (codigo: string | null | undefined) => {
    setActasDelCliente([]);
    if (!codigo) return;
    try {
      const { data } = await inventarioApi.clienteParaInventario(codigo);
      setActasDelCliente(data.actas ?? []);
    } catch {
      // El campo se queda como texto libre; no vale la pena molestar con un aviso.
    }
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

  /**
   * Abre la vista previa del FUID. Con `acta` se acota a esa acta de
   * transferencia; sin ella se ve el cliente entero, que es como se abría antes.
   * El buscador y la página se reinician: lo que se estaba mirando ya no aplica
   * al conjunto nuevo.
   */
  const abrirVistaPrevia = (row: Inventario, acta: string | null = null) => {
    setDetalle(row);
    setDetalleActa(acta);
    setFuidPage(0);
    setFuidQ('');
    setFuidQInput('');
  };

  const cerrarVistaPrevia = () => {
    setDetalle(null);
    setDetalleActa(null);
  };

  const alternarDespliegue = (items: number) =>
    setDesplegados((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(items)) siguiente.delete(items);
      else siguiente.add(items);
      return siguiente;
    });

  const columns: Column<Inventario>[] = [
    {
      // Solo se despliegan los clientes con más de un acta: con una sola, lo que
      // habría debajo es lo mismo que ya dice la fila.
      key: 'desplegar',
      header: '',
      render: (row) => {
        if ((row.total_actas ?? 0) <= 1) return <span className="inline-block w-5" />;
        const abierta = desplegados.has(row.ITEMS);
        return (
          <button
            type="button"
            onClick={() => alternarDespliegue(row.ITEMS)}
            className="rounded p-0.5 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700"
            aria-expanded={abierta}
            aria-label={abierta ? 'Ocultar las actas' : `Ver las ${row.total_actas} actas`}
            title={abierta ? 'Ocultar las actas' : `Ver las ${row.total_actas} actas`}
          >
            <ChevronRight className={cn('size-4 transition-transform', abierta && 'rotate-90')} />
          </button>
        );
      },
    },
    {
      key: 'CLIENTE',
      header: 'Cliente',
      render: (row) => (
        <div>
          <div className="font-medium text-silver-900">{row.CLIENTE ?? 'Sin nombre'}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-silver-500">{row.CODIGO_DEL_CLIENTE ?? 'sin codigo'}</span>
            {/*
              La subida a Zoho ya no tiene columna propia, pero un fallo tiene que
              verse igual: sin esta marca, un documento que no llego a publicarse
              quedaba indistinguible de uno publicado. El motivo va en el titulo,
              y la acción de reintentar, en el menu.
            */}
            {row.ZOHO_SYNC_STATE === 'ERROR' && (
              <span title={row.ZOHO_SYNC_ERROR ?? 'Fallo la subida a Zoho Sheet'}>
                <Badge color="red">Zoho</Badge>
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'total_actas',
      header: 'Actas',
      render: (row) => <span className="text-silver-700">{row.total_actas ?? 0}</span>,
    },
    {
      /*
       * Cajas terminadas sobre el total, con una barra. Antes eran dos columnas
       * ("Total Cajas" y "Procesadas") y había que compararlas con la vista; el
       * avance de una caja sobre otra es lo que se quiere leer, no cada cifra
       * suelta.
       */
      key: 'cajas',
      header: 'Cajas',
      render: (row) => {
        const total = row.cajas_vivas ?? row.TOTAL_CAJAS ?? 0;
        const hechas = row.CAJAS_PROCESADAS ?? 0;
        const porcentaje = total > 0 ? Math.min(100, Math.round((hechas / total) * 100)) : 0;
        const color = porcentaje === 100 ? 'bg-green-500' : porcentaje > 0 ? 'bg-amber-500' : 'bg-silver-400';
        return (
          <div>
            <div className="whitespace-nowrap text-silver-800">
              {hechas} <span className="text-silver-400">/ {total}</span>
            </div>
            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-silver-200">
              <div className={cn('h-full rounded-full', color)} style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'registros',
      header: 'Registros',
      render: (row) => (
        <span className="text-silver-700">
          {(row.REGISTROS_PROCESADOS ?? 0).toLocaleString('es-CO')}
        </span>
      ),
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
      /*
       * La columna que responde a "¿hace falta actualizar?". Compara los
       * registros que el inventario tiene guardados con los que hay digitados
       * ahora mismo. Sin ella, el boton de actualizar es una accion a ciegas.
       */
      key: 'frescura',
      header: 'Al dia',
      render: (row) => {
        const estadoFrescura = frescuraDe(row);
        const leido = row.FECHA_ACTUALIZACION ?? row.FECHA_CREACION;
        if (estadoFrescura.estado === 'sin-datos') {
          return <span className="text-xs text-silver-400">sin registros aun</span>;
        }
        return (
          <div>
            {estadoFrescura.estado === 'al-dia' ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                <Check className="size-3.5" /> Al dia
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="size-3.5" />
                {estadoFrescura.diferencia > 0
                  ? `${estadoFrescura.diferencia.toLocaleString('es-CO')} registros nuevos`
                  : `${Math.abs(estadoFrescura.diferencia).toLocaleString('es-CO')} registros de menos`}
              </div>
            )}
            <div className="text-xs text-silver-400">leido {hace(leido)}</div>
          </div>
        );
      },
    },
    {
      key: 'acciones',
      header: <span className="block text-right">Acciones</span>,
      render: (row: Inventario) => {
        const estadoFrescura = frescuraDe(row);
        const desfasado = estadoFrescura.estado === 'desfasado';
        const sinRegistros = (row.registros_vivos ?? 0) === 0;
        const zoho = row.ZOHO_SYNC_STATE ?? 'PENDIENTE';
        const enlaceZoho = typeof row.ZOHO_FILE_ID === 'string' && row.ZOHO_FILE_ID.startsWith('http')
          ? row.ZOHO_FILE_ID
          : null;

        const secundarias: AccionDeMenu[] = [];
        if (canEdit && !desfasado) {
          secundarias.push({
            label: 'Actualizar cifras',
            icon: <RefreshCcw className="size-4" />,
            onSelect: () => recalcularMutation.mutate(row),
            disabled: recalculando !== null,
          });
        }
        if (enlaceZoho) {
          secundarias.push({
            label: 'Abrir en Zoho Sheet',
            icon: <ExternalLink className="size-4" />,
            onSelect: () => window.open(enlaceZoho, '_blank', 'noopener'),
          });
        }
        if (canEdit && zoho === 'ERROR') {
          secundarias.push({
            label: 'Reintentar subida a Zoho',
            icon: <RefreshCw className="size-4" />,
            onSelect: () => retrySync(row),
          });
        }
        if (canEdit) {
          secundarias.push({
            label: 'Editar datos de gestion',
            icon: <Pencil className="size-4" />,
            onSelect: () => openEdit(row),
          });
          secundarias.push({
            label: 'Eliminar inventario',
            icon: <Trash2 className="size-4" />,
            onSelect: () => setDeleting(row),
            peligrosa: true,
          });
        }

        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={sinRegistros}
              onClick={() => abrirVistaPrevia(row)}
              aria-label="Ver el FUID del cliente"
              title={sinRegistros ? 'Este cliente no tiene registros' : 'Ver el FUID del cliente'}
            >
              <Eye className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={sinRegistros}
              onClick={() => void descargarFuid(row.CODIGO_DEL_CLIENTE, null, row.CLIENTE)}
              loading={descargando === claveDescarga(row.CODIGO_DEL_CLIENTE ?? '', null)}
              aria-label="Descargar el FUID del cliente"
              title={sinRegistros ? 'Este cliente no tiene registros' : 'Descargar el FUID del cliente'}
            >
              <Download className="size-4" />
            </Button>
            {/* Actualizar solo se muestra cuando hace falta, y entonces se ve. */}
            {canEdit && desfasado && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => recalcularMutation.mutate(row)}
                loading={recalculando === row.ITEMS}
                disabled={recalculando !== null}
                className="border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                title="Actualizar las cifras con lo que hay digitado"
              >
                <RefreshCcw className="mr-1.5 size-3.5" />
                Actualizar
              </Button>
            )}
            {secundarias.length > 0 && <MenuDeAcciones acciones={secundarias} />}
          </div>
        );
      },
    },
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
              Nuevo Inventario
            </Button>
          ) : undefined
        }
      />

      {/*
        Filtros en una sola linea. Antes ocupaban la primera pantalla entera
        —buscador grande, dos filas de fichas, cuatro campos y un contador— y
        para llegar a la tabla habia que bajar. En un modulo de trabajo los datos
        van primero; lo que se usa a diario queda a la vista y el resto se
        despliega.
      */}
      <div className="rounded-xl border border-silver-200 bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar cliente, codigo o acta…"
              className="h-9 w-full rounded-lg border border-silver-300 bg-surface pl-9 pr-3 text-sm text-silver-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
            />
          </div>

          <div className="flex items-center gap-1">
            <Chip label="Todos" active={estado === ''} onClick={() => setEstado('')} />
            {ESTADOS_INVENTARIO.map((e) => (
              <Chip key={e} label={e} active={estado === e} onClick={() => setEstado(e)} />
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMasFiltros((abierto) => !abierto)}
            className={cn(masFiltros && 'border-primary-400 text-primary-700')}
          >
            Mas filtros
            <ChevronRight className={cn('ml-1 size-4 transition-transform', masFiltros && 'rotate-90')} />
          </Button>

          <span className="ml-auto whitespace-nowrap text-xs font-medium text-silver-500">
            {filtered.length.toLocaleString('es-CO')} {filtered.length === 1 ? 'cliente' : 'clientes'}
            {hayFiltros && <span className="ml-1 text-primary-600">(filtrado)</span>}
          </span>
        </div>

        {masFiltros && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-silver-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Estado de entrega"
              placeholder="Todos"
              options={ESTADOS_ENTREGA.map((v) => ({ value: v, label: v }))}
              value={estadoEntrega}
              onChange={(value) => {
                setEstadoEntrega(value);
                setPage(0);
              }}
            />
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
              label="Transferencia desde"
              value={desde}
              onChange={(value) => {
                setDesde(value);
                setPage(0);
              }}
            />
            <div className="flex gap-2">
              <DatePicker
                label="Hasta"
                value={hasta}
                onChange={(value) => {
                  setHasta(value);
                  setPage(0);
                }}
              />
              <div className="flex items-end">
                <Button variant="ghost" onClick={limpiar} disabled={!hayFiltros} title="Limpiar filtros">
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        data={pageRows}
        rowKey={(row) => row.ITEMS}
        loading={isLoading}
        emptyMessage={hayFiltros ? 'No se encontraron registros con esos filtros' : 'No hay inventario registrado'}
        isExpanded={(row) => desplegados.has(row.ITEMS)}
        renderExpansion={(row) => (
          <ArbolDeActas
            codigo={row.CODIGO_DEL_CLIENTE ?? ''}
            descargando={descargando}
            claveDescarga={claveDescarga}
            onDescargar={(acta) => void descargarFuid(row.CODIGO_DEL_CLIENTE, acta, row.CLIENTE)}
            onVerPrevia={(acta) => abrirVistaPrevia(row, acta)}
          />
        )}
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
        title={editing ? `Editar inventario de ${editing.CLIENTE ?? editing.CODIGO_DEL_CLIENTE ?? ''}` : 'Inventario'}
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
<div key={fillVersion} className="form-fill-anim space-y-6">
          {/* El formulario ya no pide cifras: con elegir el cliente basta, y el
              resto se lee del sistema al guardar. Se dice en pantalla para que
              quien llega no busque dónde escribir el total de cajas. */}
          <p className="rounded-lg border border-silver-200 bg-surface-2 px-3 py-2 text-sm text-silver-600">
            Elija el cliente y guarde. El número de cajas, el rango y los registros los lee el sistema
            de lo que hay digitado, y se vuelven a leer solos todos los días a las 4:15 p. m.
          </p>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-silver-500">Cliente</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Código del Cliente"
                placeholder="Selecciona un código"
                options={selectOptions}
                value={form.CODIGO_DEL_CLIENTE}
                onChange={(value) => void handleClientCodeChange(value)}
                disabled={cargandoCliente}
                hint={cargandoCliente ? 'Cargando cajas…' : undefined}
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
              {/* Con varias actas el campo es un selector: escribir el número a
                  mano se prestaba a poner uno que no era del cliente, y al
                  elegirlo aquí la fecha y las cifras de cajas se ponen solas. Con
                  una sola acta, o con ninguna, sigue siendo un campo de texto. */}
              {actasDelCliente.length > 1 ? (
                <Select
                  label="N° Acta"
                  options={actasDelCliente.map((acta) => ({
                    value: acta.acta ?? '',
                    label: `${acta.acta ?? 'SIN NÚMERO'} — ${acta.totalCajas} ${
                      acta.totalCajas === 1 ? 'caja' : 'cajas'
                    }`,
                  }))}
                  value={form.No_ACTA}
                  onChange={handleActaChange}
                  placeholder="Elija el acta"
                />
              ) : (
                <Input
                  label="N° Acta"
                  value={form.No_ACTA}
                  onChange={(e) => setForm({ ...form, No_ACTA: e.target.value })}
                />
              )}
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

            {/* Descargas desde el propio formulario. Van por el código del
                cliente, no por el inventario, así que también sirven mientras se
                está creando uno que todavía no se ha guardado. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!form.CODIGO_DEL_CLIENTE || !form.No_ACTA || descargando !== null}
                loading={descargando === claveDescarga(form.CODIGO_DEL_CLIENTE, form.No_ACTA)}
                onClick={() =>
                  void descargarFuid(form.CODIGO_DEL_CLIENTE, form.No_ACTA, form.CLIENTE)
                }
                title={
                  form.No_ACTA
                    ? `Descargar el FUID del acta ${form.No_ACTA}`
                    : 'Elija primero un número de acta'
                }
              >
                <Download className="mr-2 size-4" />
                FUID del acta {form.No_ACTA || '—'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!form.CODIGO_DEL_CLIENTE || descargando !== null}
                loading={descargando === claveDescarga(form.CODIGO_DEL_CLIENTE, null)}
                onClick={() => void descargarFuid(form.CODIGO_DEL_CLIENTE, null, form.CLIENTE)}
              >
                <Download className="mr-2 size-4" />
                Todo el FUID del cliente
              </Button>
              {actasDelCliente.length > 1 && (
                <span className="text-xs text-silver-500">
                  Este cliente tiene {actasDelCliente.length} actas.
                </span>
              )}
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
                value={form.TOTAL_CAJAS}
                readOnly
                hint="Lo calcula el sistema"
                className="bg-surface-muted"
              />
              <Input
                label="Cajas Procesadas"
                value={form.CAJAS_PROCESADAS}
                readOnly
                hint="Lo calcula el sistema"
                className="bg-surface-muted"
              />
              <Input
                label="Caja Iniciar"
                value={form.CAJA_INICIAR}
                readOnly
                hint="Lo calcula el sistema"
                className="bg-surface-muted"
              />
              <Input
                label="Caja Fin"
                value={form.CAJ_FIN}
                readOnly
                hint="Lo calcula el sistema"
                className="bg-surface-muted"
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
                value={form.REGISTROS_PROCESADOS}
                readOnly
                hint="Lo calcula el sistema"
                className="bg-surface-muted"
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

      <Modal
        open={detalle !== null}
        onClose={cerrarVistaPrevia}
        title={
          detalle
            ? detalleActa
              ? `FUID — ${detalle.CLIENTE ?? ''} · acta ${detalleActa}`
              : `FUID — ${detalle.CLIENTE ?? ''} · todas las actas`
            : ''
        }
        size="full"
        footer={
          <Button variant="ghost" onClick={cerrarVistaPrevia}>
            Cerrar
          </Button>
        }
      >
        {detalle && (
          <div className="space-y-6">
            <div className="rounded-xl border border-silver-200 bg-silver-50 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">Código</p>
                  <p className="font-medium text-silver-800">{detalle.CODIGO_DEL_CLIENTE ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">Acta</p>
                  <p className="font-medium text-silver-800">{detalle.No_ACTA ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">Total Cajas</p>
                  <p className="font-medium text-silver-800">{detalle.TOTAL_CAJAS ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">Estado</p>
                  {(() => {
                    const estadoRow = detalle.ESTADO_DEL_INVENTARIO;
                    const color = estadoRow === 'FINALIZADO' ? 'green' : estadoRow === 'EN PROCESO' ? 'amber' : 'gray';
                    return <Badge color={color}>{estadoRow ?? 'PENDIENTE'}</Badge>;
                  })()}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">Funcionario</p>
                  <p className="font-medium text-silver-800">{detalle.FUNCIONARIO ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-silver-500">Estado Entrega</p>
                  {(() => {
                    const estadoRow = detalle.ESTADO_ENTREGA;
                    const color = estadoRow === 'ENTREGADO' ? 'green' : estadoRow === 'EN PROCESO' ? 'amber' : 'gray';
                    return <Badge color={color}>{estadoRow ?? 'PENDIENTE'}</Badge>;
                  })()}
                </div>
              </div>
              {typeof detalle.ZOHO_FILE_ID === 'string' && detalle.ZOHO_FILE_ID.startsWith('http') && (
                <a
                  href={detalle.ZOHO_FILE_ID}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Abrir Sheet en Zoho
                </a>
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
              <input
                type="search"
                value={fuidQInput}
                onChange={(e) => {
                  setFuidQInput(e.target.value);
                  setFuidPage(0);
                }}
                placeholder="Buscar por caja, UPD, asunto, entidad, serie…"
                className="h-10 w-full rounded-lg border border-silver-300 bg-silver-50 pl-9 pr-3 text-sm text-silver-900 placeholder:text-silver-400 transition-all duration-200 focus:border-primary-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Registros', value: fuidQuery.data?.stats?.total_filas },
                { label: 'Cajas', value: fuidQuery.data?.stats?.total_cajas },
                { label: 'UPDs', value: fuidQuery.data?.stats?.total_upds },
                { label: 'Folios', value: fuidQuery.data?.stats?.total_folios },
                { label: 'Desde', value: formatearFecha(fuidQuery.data?.stats?.fecha_inicial_min) },
                { label: 'Hasta', value: formatearFecha(fuidQuery.data?.stats?.fecha_final_max) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-silver-200 bg-surface px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-silver-500">{label}</p>
                  <p className="truncate text-sm font-semibold text-silver-800">{value ?? '—'}</p>
                </div>
              ))}
            </div>

            <Table
              columns={fuidColumns}
              data={fuidQuery.data?.filas ?? []}
              rowKey={(row) => row.id}
              loading={fuidQuery.isLoading}
              nowrap
              stickyFirstColumn
              maxHeight="55vh"
              emptyMessage={fuidQ ? 'No se encontraron registros con ese filtro' : 'El cliente no tiene datos FUID registrados'}
            />

            {fuidQuery.data && fuidTotal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-silver-500">
                  Página {fuidPage + 1} de {fuidTotalPages} ({fuidTotal} registros{fuidQ ? ' filtrados' : ''})
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={fuidPage === 0}
                    onClick={() => setFuidPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={fuidPage >= fuidTotalPages - 1}
                    onClick={() => setFuidPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/*
        Nuevo inventario: un paso. Se elige el cliente y se ve, antes de crear,
        exactamente que se va a guardar. Los campos de gestion —funcionario,
        estados, fechas de entrega— se llenan despues desde Editar, que es cuando
        de verdad se conocen.
      */}
      <Modal
        open={creando}
        onClose={() => setCreando(false)}
        title="Nuevo inventario"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => crearMutation.mutate()}
              loading={crearMutation.isPending}
              disabled={!codigoNuevo || yaTieneInventario || resumenNuevoQuery.isLoading}
            >
              Crear inventario
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Cliente"
            placeholder="Elija el cliente"
            options={clientOptions}
            value={codigoNuevo}
            onChange={setCodigoNuevo}
          />

          {yaTieneInventario && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Este cliente ya tiene inventario. Abralo desde la tabla para actualizarlo.
            </p>
          )}

          {codigoNuevo && !yaTieneInventario && (
            <div className="rounded-lg border border-silver-200 bg-surface-2 px-3 py-3 text-sm">
              {resumenNuevoQuery.isLoading && (
                <div className="flex items-center gap-2 text-silver-500">
                  <Spinner className="size-4" />
                  <span>Leyendo lo que hay en el sistema…</span>
                </div>
              )}
              {resumenNuevoQuery.isError && (
                <p className="text-red-600">No se pudo leer la informacion de este cliente.</p>
              )}
              {resumenNuevoQuery.data && (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-silver-500">
                    Se creara con
                  </p>
                  <p className="font-medium text-silver-800">
                    {resumenNuevoQuery.data.cliente.entidad_remitente ?? codigoNuevo}
                  </p>
                  <p className="mt-1 text-silver-600">
                    {resumenNuevoQuery.data.actas.length}{' '}
                    {resumenNuevoQuery.data.actas.length === 1 ? 'acta' : 'actas'} &middot;{' '}
                    {resumenNuevoQuery.data.totalCajas}{' '}
                    {resumenNuevoQuery.data.totalCajas === 1 ? 'caja' : 'cajas'}
                  </p>
                  {resumenNuevoQuery.data.cajaIniciar && resumenNuevoQuery.data.cajaFin && (
                    <p className="text-xs text-silver-500">
                      {resumenNuevoQuery.data.cajaIniciar} a {resumenNuevoQuery.data.cajaFin}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-silver-500">
                    Las cifras las cuenta el sistema y se releen solas todos los dias a las 4:15 p. m.
                    El funcionario, los estados y las fechas de entrega se completan despues.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar inventario"
        description={
          deleting
            ? `¿Está seguro de eliminar el inventario #${deleting.ITEMS} (${deleting.CLIENTE ?? 'sin cliente'})? Esta acción no se puede deshacer.`
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
