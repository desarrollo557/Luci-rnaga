import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, FileText, LockOpen, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { exportExcel } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EditableInput,
  EditableDatePicker,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  type Column,
  type SelectOption,
} from '@/components/ui';
import {
  asignacionCajaTecnicaApi,
  getApiErrorMessage,
  modulosCajaApi,
  modulosClienteApi,
  usersApi,
  type SerieCajasInput,
} from '@/lib/api';
import { OPCIONES_OBJETO_CAJA } from '@/lib/catalogos';
import { rutaDeClientes } from '@/lib/clienteRecordado';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { formatearFechaHora } from '@/lib/fechas';
import { useAuthStore } from '@/stores/authStore';
import { type ModuloCaja, tieneAlgunRol } from '@/types';

const ESTADOS_CAJA = ['EN PROCESO', 'FINALIZADO'] as const;

/** ¿El objeto guardado está en el catálogo actual? */
function objetoEnCatalogo(valor: string | null | undefined): boolean {
  return (OPCIONES_OBJETO_CAJA as readonly string[]).includes((valor ?? '').trim());
}

/** Un "N/A" guardado no se precarga: el campo se muestra vacío. */
function sinNA(valor?: string | null): string {
  const limpio = (valor ?? '').trim();
  return limpio.toUpperCase() === 'N/A' ? '' : limpio;
}

interface CajaForm {
  numero_inicial: string;
  numero_final: string;
  entidad_remitente_caja: string;
  entidad_productora_caja: string;
  unidad_administrativa_caja: string;
  oficina_productora_caja: string;
  objeto_caja: string;
  acta_trans_caja: string;
  fecha_trans_caja: string;
  estado_caja: string;
}

const EMPTY_CAJA_FORM: CajaForm = {
  numero_inicial: '',
  numero_final: '',
  entidad_remitente_caja: '',
  entidad_productora_caja: '',
  unidad_administrativa_caja: '',
  oficina_productora_caja: '',
  objeto_caja: '',
  acta_trans_caja: '',
  fecha_trans_caja: '',
  estado_caja: '',
};

interface AsignacionCaja {
  tecnica: Set<number>;
}

const sinAsignacion = (): AsignacionCaja => ({ tecnica: new Set() });

function ListaUsuariosAsignables({
  titulo,
  usuarios,
  seleccionados,
  onToggle,
  cargando,
}: {
  titulo: string;
  usuarios: Array<{ id: number; nombre: string; sede?: string | null }>;
  seleccionados: Set<number>;
  onToggle: (id: number) => void;
  cargando: boolean;
}) {
  return (
    <div className="rounded-lg border border-silver-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-silver-800">{titulo}</span>
        <Badge color="blue">{seleccionados.size} seleccionados</Badge>
      </div>
      {cargando ? (
        <p className="text-sm text-silver-500">Cargando usuarios…</p>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-silver-500">No hay usuarios de este rol en su sede</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {usuarios.map((usuario) => (
            <li key={usuario.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-silver-50">
                <input
                  type="checkbox"
                  checked={seleccionados.has(usuario.id)}
                  onChange={() => onToggle(usuario.id)}
                />
                <span className="text-silver-700">
                  {usuario.nombre}
                  {usuario.sede ? <span className="text-silver-400"> ({usuario.sede})</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EstadoBadge({ caja }: { caja: ModuloCaja }) {
  const estado = caja.estado_caja;
  const color = estado === 'FINALIZADO' ? 'green' : estado === 'EN PROCESO' ? 'amber' : 'gray';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge color={color}>{estado || '—'}</Badge>
      {/* Reabierta a mano por el líder: mientras dure, la técnica corrige lo de días anteriores. */}
      {estado === 'EN PROCESO' && caja.reabierta_por && <Badge color="amber">Reabierta</Badge>}
    </span>
  );
}

export default function ActasPage() {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const isManager = tieneAlgunRol(user, ['ADMIN', 'LIDER']);

  const [filtroCajas, setFiltroCajas] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCaja, setEditingCaja] = useState<ModuloCaja | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuloCaja | null>(null);
  /** Cajas marcadas con la casilla, para borrarlas de una vez. */
  const [cajasMarcadas, setCajasMarcadas] = useState<Set<number>>(new Set());
  /** Cajas que se van a borrar en lote; null cuando no hay diálogo abierto. */
  const [borradoMultiple, setBorradoMultiple] = useState<ModuloCaja[] | null>(null);
  const [cajaForm, setCajaForm] = useState<CajaForm>(() => ({ ...EMPTY_CAJA_FORM }));
  const [cajaErrors, setCajaErrors] = useState<Partial<Record<keyof CajaForm, string>>>({});
  /** Siguiente número de caja libre del cliente; se enseña bajo el campo, sin escribirlo en él. */
  const [numeroSugerido, setNumeroSugerido] = useState('');
  /*
   * Crear **una** caja es el caso normal; la serie es la excepción.
   *
   * Antes el formulario pedía siempre un rango, con "Número Inicial" y "Número
   * Final" obligatorios y los dos en blanco. Para crear una sola caja había que
   * escribir el mismo número dos veces, y bastaba equivocarse en un dígito —o
   * entender que el final es el siguiente— para crear dos cajas sin querer. Es
   * lo que estaba pasando: cajas creadas de dos en dos, con números
   * consecutivos. Ahora hay un único campo y el rango se pide a propósito.
   */
  const [crearVarias, setCrearVarias] = useState(false);
  // Usuarios asignados a la caja (o a toda la serie al crear). En edición se
  // conserva el estado original para aplicar solo las diferencias al guardar.
  const [asignacion, setAsignacion] = useState<AsignacionCaja>(sinAsignacion);
  const [asignacionOriginal, setAsignacionOriginal] = useState<AsignacionCaja>(sinAsignacion);
  const [cargandoAsignacion, setCargandoAsignacion] = useState(false);

  /*
   * Opciones de "Objeto": las dos del catálogo y, cuando se edita
   * una caja creada antes de que el campo fuera una lista, también la que
   * tiene guardada. Sin ese añadido el desplegable aparecería vacío y guardar
   * cualquier otro dato de la caja borraría el objeto sin que nadie lo pidiera.
   */
  const opcionesObjetoCaja = useMemo(() => {
    const opciones: SelectOption[] = OPCIONES_OBJETO_CAJA.map((objeto) => ({
      value: objeto,
      label: objeto,
    }));
    const actual = cajaForm.objeto_caja.trim();
    if (actual && actual !== 'N/A' && !objetoEnCatalogo(actual)) {
      opciones.push({ value: actual, label: `${actual} (valor anterior)` });
    }
    return opciones;
  }, [cajaForm.objeto_caja]);

  const cajasQuery = useQuery({
    queryKey: ['modulos-caja', 'list', id],
    queryFn: () => modulosCajaApi.list(id as string).then((res) => res.data),
    enabled: Boolean(id),
  });

  const cajasData = cajasQuery.data ?? [];
  const loadingCajas = cajasQuery.isLoading;
  const terminoCajas = filtroCajas.trim().toLowerCase();
  const cajasFiltradasBase = terminoCajas
    ? cajasData.filter((caja) =>
      [
        caja.caja_modulo,
        caja.entidad_remitente_caja,
        caja.entidad_productora_caja,
        caja.acta_trans_caja,
        caja.estado_caja,
        caja.fecha_trans_caja?.slice(0, 10) ?? '',
      ].some((campo) => String(campo ?? '').toLowerCase().includes(terminoCajas)),
    )
    : cajasData;

  // Ordenar por número de caja (últimos 6 dígitos de caja_modulo) de menor a mayor
  const cajasFiltradas = useMemo(() => {
    return [...cajasFiltradasBase].sort((a, b) => {
      const numA = parseInt(a.caja_modulo.slice(-6), 10) || 0;
      const numB = parseInt(b.caja_modulo.slice(-6), 10) || 0;
      return numA - numB;
    });
  }, [cajasFiltradasBase]);

  const moduloQuery = useQuery({
    queryKey: ['modulos-cliente', 'get', id],
    queryFn: () => modulosClienteApi.get(id as string).then((res) => res.data),
    enabled: Boolean(id),
  });

  const actaModulo = moduloQuery.data?.acta_transferencia_modulo ?? '';
  // Entidad remitente del acta, que hereda cada caja nueva. Un N/A no se precarga.
  const entidadDelActa = sinNA(moduloQuery.data?.entidad_remitente);
  // Prefijo de las cajas (código del cliente + "C"). Solo se muestra: el backend
  // lo calcula al crear la serie y al editar se conserva el de la caja.
  const prefijoCaja = moduloQuery.data ? `${moduloQuery.data.codigo.padStart(3, '0')}C` : '';

  const tecnicosQuery = useQuery({
    queryKey: ['users', 'rol', 'TECNICA'],
    queryFn: () => usersApi.byRol('TECNICA', { sede: user?.sede }).then((res) => res.data),
    enabled: isManager,
  });

  const toggleAsignacion = (rol: keyof AsignacionCaja, id: number) => {
    setAsignacion((prev) => {
      const next = new Set(prev[rol]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [rol]: next };
    });
  };

  /** Carga los usuarios ya asignados a la caja para precargar el formulario de edición. */
  const cargarAsignacion = async (cajaId: number) => {
    setAsignacion(sinAsignacion());
    setAsignacionOriginal(sinAsignacion());
    setCargandoAsignacion(true);
    try {
      const tecnica = await modulosCajaApi.usuariosTecnica(cajaId).then((res) => res.data);
      const actual: AsignacionCaja = { tecnica: new Set(tecnica.map((u) => u.id)) };
      setAsignacion(actual);
      setAsignacionOriginal({ tecnica: new Set(actual.tecnica) });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCargandoAsignacion(false);
    }
  };

  /** Aplica sobre la caja solo las altas y bajas respecto a la asignación original. */
  const sincronizarAsignacion = async (cajaId: number) => {
    const roles = [{ rol: 'tecnica' as const, cliente: asignacionCajaTecnicaApi }];
    for (const { rol, cliente } of roles) {
      const actual = asignacion[rol];
      const original = asignacionOriginal[rol];
      const altas = [...actual].filter((id) => !original.has(id));
      const bajas = [...original].filter((id) => !actual.has(id));
      if (altas.length > 0) await cliente.asignar({ modulo_id: cajaId, usuarios: altas });
      if (bajas.length > 0) await cliente.eliminar(cajaId, bajas);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async ({ cajaId, data }: { cajaId: number; data: { caja_modulo: string; entidad_remitente_caja: string; entidad_productora_caja: string; unidad_administrativa_caja: string; oficina_productora_caja: string; objeto_caja: string; acta_trans_caja: string; fecha_trans_caja: string | null; estado_caja: string } }) => {
      await modulosCajaApi.update(cajaId, data);
      await sincronizarAsignacion(cajaId);
    },
    onSuccess: () => {
      toast.success('Caja actualizada correctamente');
      setModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-caja');
      void invalidateDomain(queryClient, 'users');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  /*
   * Reabrir una caja terminada. Es del líder: además de abrirla, autoriza a la
   * técnica a corregir sus registros de días anteriores mientras siga abierta.
   * Se cierra sola al terminar la jornada, como cualquier otra.
   */
  const reabrirMutation = useMutation({
    mutationFn: (cajaId: number) => modulosCajaApi.cambiarEstado(cajaId, 'EN PROCESO'),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Caja reabierta');
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const createSerieMutation = useMutation({
    mutationFn: (data: SerieCajasInput) => modulosCajaApi.createSerie(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Serie de cajas creada correctamente');
      setModalOpen(false);
      void invalidateDomain(queryClient, 'modulos-caja');
      void invalidateDomain(queryClient, 'users');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cajaId: number) => modulosCajaApi.remove(cajaId),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Caja eliminada');
      setDeleteTarget(null);
      void invalidateDomain(queryClient, 'modulos-caja');
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  /** Cuántas cajas saldrían del rango escrito, o 0 si todavía no es un rango válido. */
  const cajasDelRango = (() => {
    if (!/^\d{6}$/.test(cajaForm.numero_inicial) || !/^\d{6}$/.test(cajaForm.numero_final)) return 0;
    const desde = parseInt(cajaForm.numero_inicial, 10);
    const hasta = parseInt(cajaForm.numero_final, 10);
    return hasta >= desde ? hasta - desde + 1 : 0;
  })();

  /*
   * Borrar las cajas marcadas, una por una contra el mismo endpoint.
   *
   * Cada borrado de caja arrastra sus registros FUID y sus asignaciones dentro
   * de una transacción, comprueba que la caja sea de la sede de quien borra y
   * deja su línea en la auditoría. Mandar la lista entera en una sola llamada
   * obligaría a repetir todo eso, y repetirlo es como se acaba relajando.
   *
   * En serie y no en paralelo: las conexiones contra la base son un cupo
   * compartido, y borrar cajas no es algo que se haga a cada rato.
   */
  const borrarVariasMutation = useMutation({
    mutationFn: async (cajas: ModuloCaja[]) => {
      let eliminadas = 0;
      let fuids = 0;
      const fallos: string[] = [];
      for (const caja of cajas) {
        try {
          const res = await modulosCajaApi.remove(caja.id);
          eliminadas += 1;
          fuids += Number(res.data?.fuids_eliminados ?? 0);
        } catch (error) {
          fallos.push(getApiErrorMessage(error));
        }
      }
      return { eliminadas, fuids, fallos };
    },
    onSuccess: ({ eliminadas, fuids, fallos }) => {
      if (eliminadas > 0) {
        const conRegistros = fuids > 0 ? ` y ${fuids} registro(s) FUID` : '';
        toast.success(
          `${eliminadas} ${eliminadas === 1 ? 'caja eliminada' : 'cajas eliminadas'}${conRegistros}`,
        );
      }
      if (fallos.length > 0) {
        const motivo = [...new Set(fallos)][0];
        toast.error(
          `${fallos.length} no se ${fallos.length === 1 ? 'pudo' : 'pudieron'} eliminar: ${motivo}`,
        );
      }
      setCajasMarcadas(new Set());
      setBorradoMultiple(null);
      void invalidateDomain(queryClient, 'modulos-caja');
      void invalidateDomain(queryClient, 'fuiddatosreal');
    },
    onError: (error) => {
      setBorradoMultiple(null);
      toast.error(getApiErrorMessage(error));
    },
  });

  /*
   * Marcar todo abarca lo que está a la vista, no el acta entera: con un filtro
   * puesto, borrar lo que el filtro esconde sería tocar cajas que nadie está
   * mirando.
   */
  const todasMarcadas =
    cajasFiltradas.length > 0 && cajasFiltradas.every((caja) => cajasMarcadas.has(caja.id));

  const marcarCaja = (cajaId: number) => {
    setCajasMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(cajaId)) next.delete(cajaId);
      else next.add(cajaId);
      return next;
    });
  };

  const marcarTodas = () => {
    if (todasMarcadas) setCajasMarcadas(new Set());
    else setCajasMarcadas(new Set(cajasFiltradas.map((caja) => caja.id)));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof CajaForm, string>> = {};

    // Entidad productora, unidad administrativa, oficina productora y objeto se
    // pueden dejar en blanco: no siempre se conocen al crear la caja y el
    // servidor los guarda como N/A. Lo que sigue siendo obligatorio es lo que
    // identifica la caja y que MySQL declara NOT NULL.
    if (!cajaForm.entidad_remitente_caja?.trim()) {
      nextErrors.entidad_remitente_caja = 'La entidad remitente es requerida';
    }
    if (!cajaForm.acta_trans_caja?.trim()) {
      nextErrors.acta_trans_caja = 'El acta de transferencia es requerida';
    }
    // La columna no admite nulos: sin esta comprobación el servidor respondía
    // con un error genérico y el modal se quedaba sin decir qué faltaba.
    if (!cajaForm.fecha_trans_caja) {
      nextErrors.fecha_trans_caja = 'La fecha de transferencia es requerida';
    }

    setCajaErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Validar formato 6 dígitos para número inicial y final
    if (!/^\d{6}$/.test(cajaForm.numero_inicial)) {
      setCajaErrors({ ...nextErrors, numero_inicial: 'Debe tener 6 dígitos numéricos' });
      return;
    }
    if (!/^\d{6}$/.test(cajaForm.numero_final)) {
      setCajaErrors({ ...nextErrors, numero_final: 'Debe tener 6 dígitos numéricos' });
      return;
    }
    const ini = parseInt(cajaForm.numero_inicial, 10);
    const fin = parseInt(cajaForm.numero_final, 10);
    if (ini > fin) {
      setCajaErrors({ ...nextErrors, numero_inicial: 'El inicial no puede ser mayor que el final' });
      return;
    }

    const baseData = {
      id_modulo_caja: Number(id),
      numero_inicial: cajaForm.numero_inicial,
      numero_final: cajaForm.numero_final,
      entidad_remitente_caja: cajaForm.entidad_remitente_caja.trim(),
      entidad_productora_caja: cajaForm.entidad_productora_caja.trim(),
      unidad_administrativa_caja: cajaForm.unidad_administrativa_caja.trim(),
      oficina_productora_caja: cajaForm.oficina_productora_caja.trim(),
      objeto_caja: cajaForm.objeto_caja.trim(),
      acta_trans_caja: cajaForm.acta_trans_caja.trim(),
      fecha_trans_caja: cajaForm.fecha_trans_caja || null,
      // Sin estado elegido, la caja nace EN PROCESO: es el único que tiene
      // sentido para una caja recién creada, y desde ahí lo lleva el servidor
      // con cada registro que se digita.
      estado_caja: cajaForm.estado_caja || 'EN PROCESO',
      usuarios_tecnica: [...asignacion.tecnica],
    };

    if (editingCaja) {
      // Para edición, actualizar una sola caja (usar el número del inicial)
      const prefijo = editingCaja.caja_modulo.slice(0, 4); // ej. "051C"
      updateMutation.mutate({
        cajaId: editingCaja.id,
        data: {
          caja_modulo: `${prefijo}${cajaForm.numero_inicial}`,
          entidad_remitente_caja: cajaForm.entidad_remitente_caja.trim(),
          entidad_productora_caja: cajaForm.entidad_productora_caja.trim(),
          unidad_administrativa_caja: cajaForm.unidad_administrativa_caja.trim(),
          oficina_productora_caja: cajaForm.oficina_productora_caja.trim(),
          objeto_caja: cajaForm.objeto_caja.trim(),
          acta_trans_caja: cajaForm.acta_trans_caja.trim(),
          fecha_trans_caja: cajaForm.fecha_trans_caja || null,
          estado_caja: cajaForm.estado_caja,
        },
      });
      return;
    }

    if (!id) {
      toast.error('Falta el identificador del acta');
      return;
    }

    createSerieMutation.mutate(baseData);
  };

  const handleExportExcel = () => {
    // Exportar todas las cajas cargadas
    const rows = cajasData;
    if (rows.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = [
      { label: 'Caja', key: 'caja_modulo' },
      { label: 'Entidad Remitente', key: 'entidad_remitente_caja' },
      { label: 'Entidad Productora', key: 'entidad_productora_caja' },
      { label: 'Acta', key: 'acta_trans_caja' },
      { label: 'Fecha', key: 'fecha_trans_caja' },
      { label: 'Estado', key: 'estado_caja' },
      { label: 'Técnicos', key: 'tecnicos_asignados' },
    ];

    exportExcel(
      'Actas por Cliente',
      headers,
      rows,
      `actas_cliente_${id || 'all'}`
    );
  };

  const openNuevaCaja = async () => {
    setEditingCaja(null);
    // Siguiente número libre del prefijo en TODA la base, no solo en esta acta:
    // el número de caja no puede repetirse entre actas del mismo cliente. Se
    // enseña como pista bajo el campo, no como valor ya escrito.
    let sugerido = '';
    try {
      if (prefijoCaja) {
        const { data } = await modulosCajaApi.siguienteNumero(prefijoCaja);
        sugerido = data.siguiente.slice(-6);
      }
    } catch {
      // Sin respuesta del servidor: se parte de la última caja de esta acta.
      const ultimaCaja = [...cajasData].sort((a, b) => {
        const na = parseInt(a.caja_modulo.slice(-6), 10);
        const nb = parseInt(b.caja_modulo.slice(-6), 10);
        return nb - na;
      })[0];
      if (ultimaCaja) {
        sugerido = String(parseInt(ultimaCaja.caja_modulo.slice(-6), 10) + 1).padStart(6, '0');
      }
    }
    setNumeroSugerido(sugerido);
    /*
     * Ningún campo viene elegido. Antes la caja nueva heredaba de otra caja del
     * acta la entidad productora, la unidad, la oficina y el objeto, traía el
     * número sugerido ya escrito y el estado puesto: había que revisar campo por
     * campo qué aplicaba y qué no, y lo que nadie revisaba se guardaba tal cual,
     * como pasaba con el código del FUID antes de dejarlo en blanco. Lo único
     * precargado es lo que la caja toma del acta en la que se crea (entidad
     * remitente, número de acta y fecha), y va bloqueado como dato derivado.
     */
    setCajaForm({
      ...EMPTY_CAJA_FORM,
      entidad_remitente_caja: entidadDelActa,
      acta_trans_caja: actaModulo,
      fecha_trans_caja: moduloQuery.data?.fecha_trans_modulo?.slice(0, 10) ?? '',
    });
    setCajaErrors({});
    setCrearVarias(false);
    setAsignacion(sinAsignacion());
    setAsignacionOriginal(sinAsignacion());
    setModalOpen(true);
  };

  const handleEditarCaja = (caja: ModuloCaja) => {
    setEditingCaja(caja);
    // Para edición, extraer el número de 6 dígitos del final del caja_modulo
    const numero = caja.caja_modulo.slice(-6);
    setCajaForm({
      numero_inicial: numero,
      numero_final: numero,
      entidad_remitente_caja: caja.entidad_remitente_caja,
      entidad_productora_caja: caja.entidad_productora_caja,
      unidad_administrativa_caja: caja.unidad_administrativa_caja,
      oficina_productora_caja: caja.oficina_productora_caja,
      objeto_caja: caja.objeto_caja,
      acta_trans_caja: caja.acta_trans_caja,
      fecha_trans_caja: caja.fecha_trans_caja?.slice(0, 10) ?? '',
      estado_caja: caja.estado_caja,
    });
    setCajaErrors({});
    setModalOpen(true);
    void cargarAsignacion(caja.id);
  };

  const columns: Column<ModuloCaja>[] = [
    ...(isManager
      ? [
          {
            key: 'seleccion',
            header: (
              <input
                type="checkbox"
                checked={todasMarcadas}
                onChange={marcarTodas}
                aria-label="Seleccionar todas las cajas"
              />
            ),
            render: (caja: ModuloCaja) => (
              <input
                type="checkbox"
                checked={cajasMarcadas.has(caja.id)}
                onChange={() => marcarCaja(caja.id)}
                aria-label={`Seleccionar la caja ${caja.caja_modulo}`}
              />
            ),
          } as Column<ModuloCaja>,
        ]
      : []),
    { key: 'caja_modulo', header: 'Caja' },
    { key: 'entidad_remitente_caja', header: 'Entidad Remitente' },
    { key: 'entidad_productora_caja', header: 'Entidad Productora' },
    { key: 'acta_trans_caja', header: 'Acta' },
    {
      key: 'fecha_trans_caja',
      header: 'Fecha Trans.',
      render: (caja: ModuloCaja) => (caja.fecha_trans_caja ? caja.fecha_trans_caja.slice(0, 10) : '—'),
    },
    {
      key: 'fuid',
      header: 'N° FUID',
      render: (caja: ModuloCaja) => <span>{caja.total_fuids ?? 0}</span>,
    },
    {
      key: 'estado_caja',
      header: 'Estado',
      render: (caja: ModuloCaja) => <EstadoBadge caja={caja} />,
    },
    ...(isManager
      ? [
        {
          key: 'asignados',
          header: 'Asignados',
          /*
           * Una caja sin técnico asignado no la puede digitar nadie: el
           * servidor rechaza el registro con un 403 y la caja ni siquiera
           * aparece en la lista de quien digita. Antes eso se veía como un
           * guion, igual que un dato que falta, y una serie creada sin marcar
           * técnicos quedaba muerta sin que nada lo dijera. Ahora se avisa.
           */
          render: (caja: ModuloCaja) =>
            caja.tecnicos_asignados ? (
              <div className="space-y-0.5 text-xs">
                <p>
                  <span className="font-medium text-silver-500">Técnica:</span>{' '}
                  <span className="text-silver-700">{caja.tecnicos_asignados}</span>
                </p>
              </div>
            ) : (
              <span title="Nadie puede digitar en esta caja hasta que se le asigne un técnico">
                <Badge color="amber">Sin asignar</Badge>
              </span>
            ),
        },
      ]
      : []),
    {
      key: 'created_at',
      header: 'Creada',
      render: (caja: ModuloCaja) => formatearFechaHora(caja.created_at),
    },
    {
      key: 'updated_at',
      header: 'Actualizada',
      render: (caja: ModuloCaja) => formatearFechaHora(caja.updated_at),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (caja: ModuloCaja) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/cajas/${caja.id}/datos`} state={{ from: `/clientes/${id}/actas` }}>
            <Button variant="secondary" size="sm">
              <ClipboardList className="size-4" /> Ir a Digitación
            </Button>
          </Link>
          {isManager ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => handleEditarCaja(caja)}>
                <Pencil className="size-4" /> Editar
              </Button>
              {caja.estado_caja === 'FINALIZADO' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => reabrirMutation.mutate(caja.id)}
                  loading={reabrirMutation.isPending && reabrirMutation.variables === caja.id}
                >
                  <LockOpen className="size-4" /> Reabrir
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => setDeleteTarget(caja)}>
                <Trash2 className="size-4" /> Eliminar
              </Button>
            </>
          ) : (
            // Técnica: solo Ir a Digitación (finalizar está dentro de la caja)
            null
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={actaModulo ? `Acta ${actaModulo}` : 'Acta'}
        description="Clientes / Actas — Cajas registradas en el acta"
        backTo={rutaDeClientes(moduloQuery.data?.id_submodulo)}
        backLabel="Clientes"
        actions={
          isManager ? (
            <>
              <Button onClick={openNuevaCaja} disabled={!id} loading={createSerieMutation.isPending}>
                <Plus className="size-4" /> Nueva Caja
              </Button>
              <Button onClick={handleExportExcel} variant="ghost" loading={cajasQuery.isFetching}>
                <FileText className="size-4" /> Exportar Excel
              </Button>
            </>
          ) : undefined
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
            <Input
              value={filtroCajas}
              onChange={(event) => setFiltroCajas(event.target.value)}
              placeholder="Buscar caja por número, entidad, acta, fecha o estado…"
              className="pl-9"
              aria-label="Buscar cajas"
            />
          </div>
          {isManager && cajasMarcadas.size > 0 && (
            <Button
              variant="secondary"
              onClick={() =>
                setBorradoMultiple(cajasFiltradas.filter((caja) => cajasMarcadas.has(caja.id)))
              }
              loading={borrarVariasMutation.isPending}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
              Eliminar ({cajasMarcadas.size})
            </Button>
          )}
        </div>
      </Card>

      <Table
        columns={columns}
        data={cajasFiltradas}
        rowKey={(caja) => caja.id}
        loading={loadingCajas}
        emptyMessage={
          terminoCajas ? 'Ninguna caja coincide con la búsqueda' : 'Esta acta aún no tiene cajas registradas'
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCaja ? 'Editar Caja' : 'Nueva Caja'}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={createSerieMutation.isPending || updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="caja-form"
              loading={createSerieMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="caja-form" onSubmit={handleSubmit} autoComplete="off" className="grid gap-4 md:grid-cols-2">
          {/* Mismo orden de campos que el formulario de cajas anterior */}
          <Input
            label="Prefijo"
            value={editingCaja ? editingCaja.caja_modulo.slice(0, 4) : prefijoCaja}
            readOnly
            disabled
            hint={editingCaja ? undefined : 'Se toma del código del cliente'}
          />
          {editingCaja ? (
            <Input
              label="Número de caja (6 dígitos)"
              value={cajaForm.numero_inicial}
              onChange={(event) =>
                setCajaForm({ ...cajaForm, numero_inicial: event.target.value, numero_final: event.target.value })
              }
              error={cajaErrors.numero_inicial ?? cajaErrors.numero_final}
              placeholder="000001"
              maxLength={6}
            />
          ) : (
            <>
              <Input
                label={crearVarias ? 'Número Inicial (6 dígitos)' : 'Número de caja (6 dígitos)'}
                value={cajaForm.numero_inicial}
                onChange={(event) =>
                  setCajaForm({
                    ...cajaForm,
                    numero_inicial: event.target.value,
                    // Con una sola caja los dos extremos del rango son el mismo
                    // número. Se mantienen sincronizados aquí para que quien
                    // crea una caja no tenga que escribirlo dos veces, que es
                    // como se acababan creando dos.
                    ...(crearVarias ? {} : { numero_final: event.target.value }),
                  })
                }
                error={cajaErrors.numero_inicial}
                placeholder={numeroSugerido || '000001'}
                hint={numeroSugerido ? `Siguiente número libre del cliente: ${numeroSugerido}` : undefined}
                maxLength={6}
              />
              {crearVarias ? (
                <Input
                  label="Número Final (6 dígitos)"
                  value={cajaForm.numero_final}
                  onChange={(event) => setCajaForm({ ...cajaForm, numero_final: event.target.value })}
                  error={cajaErrors.numero_final}
                  placeholder={numeroSugerido || '000001'}
                  maxLength={6}
                />
              ) : (
                <div />
              )}
              {asignacion.tecnica.size === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 md:col-span-2">
                  Sin ningún técnico marcado más abajo, nadie podrá digitar en{' '}
                  {crearVarias && cajasDelRango > 1 ? 'estas cajas' : 'esta caja'} hasta que se le
                  asigne uno.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-silver-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={crearVarias}
                  onChange={(event) => {
                    const varias = event.target.checked;
                    setCrearVarias(varias);
                    // Al volver a una sola caja, el final deja de ir por libre.
                    if (!varias) setCajaForm((prev) => ({ ...prev, numero_final: prev.numero_inicial }));
                  }}
                />
                Crear varias cajas seguidas
              </label>
              {/*
                Cuántas cajas se van a crear, antes de pulsar. Una serie se pide
                por un rango y el rango es fácil de leer mal; ver el número y
                los dos extremos escritos evita enterarse después.
              */}
              {crearVarias && cajasDelRango > 0 && (
                <p className="text-sm text-silver-600 md:col-span-2">
                  Se {cajasDelRango === 1 ? 'creará' : 'crearán'}{' '}
                  <strong>{cajasDelRango}</strong> {cajasDelRango === 1 ? 'caja' : 'cajas'}:{' '}
                  <span className="font-mono">
                    {prefijoCaja}
                    {cajaForm.numero_inicial}
                  </span>{' '}
                  a{' '}
                  <span className="font-mono">
                    {prefijoCaja}
                    {cajaForm.numero_final}
                  </span>
                  .
                </p>
              )}
            </>
          )}
          {/* Al crear viene del acta y va bloqueada, como el número de acta y la
              fecha; arranca abierta si el acta no la tiene o al editar la caja. */}
          <EditableInput
            label="Entidad Remitente"
            value={cajaForm.entidad_remitente_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, entidad_remitente_caja: value })}
            error={cajaErrors.entidad_remitente_caja}
            placeholder={entidadDelActa || 'Ingrese la entidad remitente'}
            defaultUnlocked={editingCaja !== null || !entidadDelActa}
          />
          <EditableInput
            label="Acta de Transferencia"
            value={cajaForm.acta_trans_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, acta_trans_caja: value })}
            error={cajaErrors.acta_trans_caja}
            placeholder={actaModulo || 'Ingrese el número de acta'}
            defaultUnlocked={false}
          />
          <EditableDatePicker
            label="Fecha de Transferencia"
            value={cajaForm.fecha_trans_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, fecha_trans_caja: value })}
            error={cajaErrors.fecha_trans_caja}
            defaultUnlocked={false}
          />
          <Input
            label="Entidad Productora"
            value={cajaForm.entidad_productora_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, entidad_productora_caja: event.target.value })}
            error={cajaErrors.entidad_productora_caja}
          />
          <Input
            label="Unidad Administrativa"
            value={cajaForm.unidad_administrativa_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, unidad_administrativa_caja: event.target.value })}
            error={cajaErrors.unidad_administrativa_caja}
          />
          <Input
            label="Oficina Productora"
            value={cajaForm.oficina_productora_caja}
            onChange={(event) => setCajaForm({ ...cajaForm, oficina_productora_caja: event.target.value })}
            error={cajaErrors.oficina_productora_caja}
          />
          <Select
            label="Objeto"
            placeholder="Sin especificar"
            options={opcionesObjetoCaja}
            value={cajaForm.objeto_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, objeto_caja: value })}
            error={cajaErrors.objeto_caja}
          />
          <Select
            label="Estado"
            placeholder="Sin especificar"
            options={ESTADOS_CAJA.map((estado) => ({ value: estado, label: estado }))}
            value={cajaForm.estado_caja}
            onChange={(value) => setCajaForm({ ...cajaForm, estado_caja: value })}
            hint={editingCaja ? undefined : 'Si se deja en blanco, la caja se crea EN PROCESO'}
          />

          <div className="space-y-2 border-t border-silver-100 pt-4 md:col-span-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-silver-500" />
              <h4 className="text-sm font-semibold text-silver-800">Usuarios asignados a la caja</h4>
            </div>
            <p className="text-xs text-silver-500">
              {editingCaja
                ? 'Marque o desmarque usuarios; los cambios se aplican al guardar.'
                : 'Los usuarios marcados quedan asignados a todas las cajas de la serie.'}
            </p>
            <div className="grid gap-3">
              <ListaUsuariosAsignables
                titulo="Técnicos"
                usuarios={tecnicosQuery.data ?? []}
                seleccionados={asignacion.tecnica}
                onToggle={(id) => toggleAsignacion('tecnica', id)}
                cargando={tecnicosQuery.isPending || cargandoAsignacion}
              />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={borradoMultiple !== null}
        title={`Eliminar ${borradoMultiple?.length ?? 0} ${(borradoMultiple?.length ?? 0) === 1 ? 'caja' : 'cajas'}`}
        description={(() => {
          const cajas = borradoMultiple ?? [];
          const registros = cajas.reduce((suma, caja) => suma + Number(caja.total_fuids ?? 0), 0);
          const cuales = cajas.map((caja) => caja.caja_modulo).join(', ');
          return registros > 0
            ? `Se eliminarán ${cajas.length} caja(s) —${cuales}— junto con ${registros} registro(s) FUID. Esta acción no se puede deshacer.`
            : `Se eliminarán ${cajas.length} caja(s): ${cuales}. Esta acción no se puede deshacer.`;
        })()}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (borradoMultiple) borrarVariasMutation.mutate(borradoMultiple);
        }}
        onCancel={() => setBorradoMultiple(null)}
        loading={borrarVariasMutation.isPending}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar caja"
        description={
          (deleteTarget?.total_fuids ?? 0) > 0
            ? `La caja ${deleteTarget?.caja_modulo ?? ''} tiene ${deleteTarget?.total_fuids ?? 0} registro(s) FUID. Se eliminarán primero todos sus registros (UPD) y después la caja. Esta acción no se puede deshacer.`
            : `¿Estás seguro de que deseas eliminar la caja ${deleteTarget?.caja_modulo ?? ''}? Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
        requireCc
        userCc={user?.cc ?? ''}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
