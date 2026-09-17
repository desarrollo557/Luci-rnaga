import axios from 'axios';
import type {
  DataRow,
  FuidConEstado,
  FuidDato,
  Historial,
  Inventario,
  InventarioFuidResponse,
  LoginResponse,
  ModuloCaja,
  ModuloCliente,
  Role,
  SessionUser,
  SubModulo,
  User,
} from '@/types';

const PUBLIC_AUTH_PATHS = ['/login', '/currentUser', '/checkAuth'];

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/** Claves cuyo valor nunca se pasa a mayúsculas: credenciales. */
const CLAVES_SIN_MAYUSCULAS = new Set(['contrasena', 'password', 'contrasena_actual', 'nueva_contrasena']);

function aMayusculas(valor: unknown): unknown {
  if (typeof valor === 'string') return valor.toUpperCase();
  if (Array.isArray(valor)) return valor.map(aMayusculas);
  if (valor !== null && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([clave, contenido]) => [
        clave,
        CLAVES_SIN_MAYUSCULAS.has(clave) ? contenido : aMayusculas(contenido),
      ]),
    );
  }
  return valor;
}

// Regla de negocio: todo lo que se envía a guardar va en MAYÚSCULAS. El backend
// aplica la misma regla, así que ningún dato llega en minúsculas a la base.
api.interceptors.request.use((config) => {
  if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
    config.data = aMayusculas(config.data);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const url = error.config?.url ?? '';
      if (status === 401 && !PUBLIC_AUTH_PATHS.some((p) => url.includes(p))) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

interface ApiErrorDetail {
  field?: string;
  message?: string;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: ApiErrorDetail[];
}

/**
 * Extrae un mensaje legible a partir de un error de API. Prioriza los detalles
 * de validación del backend, luego el mensaje general y por último un fallback.
 * Nunca devuelve una cadena vacía.
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Error de conexión. Inténtalo de nuevo.';
    }
    const data: unknown = error.response.data;
    if (typeof data === 'string' && data.trim() !== '') {
      return data;
    }
    if (typeof data === 'object' && data !== null) {
      const body = data as ApiErrorBody;
      if (Array.isArray(body.details) && body.details.length > 0) {
        // Solo el mensaje: los del backend ya son frases completas que nombran
        // el campo como se ve en pantalla ("El asunto automático es
        // requerido"). Anteponerles la columna dejaba avisos como
        // "asunto_2: El asunto automático es requerido", que le dice al
        // digitador un nombre técnico que no aparece en ningún formulario.
        const parts = body.details
          .map((detail) => detail?.message)
          .filter((part): part is string => Boolean(part));
        if (parts.length > 0) return parts.join(' · ');
      }
      if (body.error) return body.error;
      if (body.message) return body.message;
    }
    return 'Error en el servidor';
  }
  return 'Error en el servidor';
}

/**
 * Extrae el `code` de un error de API (ej: 'SIN_RANGO', 'AGOTADO',
 * 'CAJA_SIN_SUBMODULO', 'UPD_YA_USADO') para el manejo de estados en la UI.
 * Devuelve undefined cuando el error no trae un código reconocible.
 */
export function getApiErrorCode(error: unknown): string | undefined {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === 'object' && data !== null) {
      const code = (data as { code?: unknown }).code;
      return typeof code === 'string' && code !== '' ? code : undefined;
    }
  }
  return undefined;
}

export interface UserInput {
  cc: string;
  nombre: string;
  contrasena?: string;
  rol: Role;
  /** Segundo perfil opcional. Suma permisos al principal; nunca los quita. */
  rol_secundario?: Role | '' | null;
  sede: string;
}

export interface SubModuloInput {
  codigo: string;
  entidad_remitente: string;
  sede_submodulos: string;
}

export interface ModuloClienteInput {
  codigo: string;
  entidad_remitente: string;
  acta_transferencia_modulo: string;
  fecha_trans_modulo: string | null;
  id_submodulo: number;
}

export interface UsuarioAsignado {
  id: number;
  nombre: string;
  sede: string | null;
  upd_inicio?: string | null;
  ultimo_upd?: string | null;
}

export interface ModuloCajaInput {
  caja_modulo: string;
  entidad_remitente_caja: string;
  acta_trans_caja: string;
  fecha_trans_caja: string | null;
  id_modulo_caja: number;
  entidad_productora_caja: string;
  unidad_administrativa_caja: string;
  oficina_productora_caja: string;
  objeto_caja: string;
  estado_caja: string;
  /** Jornada a la que se atribuyó la caja terminada; la pone el servidor. */
  fecha_finalizacion?: string | null;
}

export interface SerieCajasInput {
  id_modulo_caja: number;
  numero_inicial: string;
  numero_final: string;
  entidad_remitente_caja: string;
  acta_trans_caja: string;
  fecha_trans_caja: string | null;
  entidad_productora_caja: string;
  unidad_administrativa_caja: string;
  oficina_productora_caja: string;
  objeto_caja: string;
  estado_caja: string;
  /** Usuarios que quedan asignados a todas las cajas creadas. */
  usuarios_tecnica?: number[];
}

export interface AsignacionCajaInput {
  modulo_id: number;
  usuarios: number[];
}

export const authApi = {
  login: (cc: string, contrasena: string) =>
    api.post<LoginResponse>('/login', { cc, contrasena }),
  logout: () => api.post<{ success: boolean }>('/logout'),
  currentUser: () => api.get<SessionUser>('/currentUser'),
  checkAuth: () => api.get<string>('/checkAuth'),
};

export const usersApi = {
  list: () => api.get<User[]>('/users'),
  get: (id: number) => api.get<User>(`/users/${id}`),
  create: (data: UserInput) => api.post<User>('/users', data),
  update: (id: number, data: Partial<UserInput>) => api.put<User>(`/users/${id}`, data),
  remove: (id: number) => api.delete(`/users/${id}`),
  suspender: (id: number, suspendidoHasta: string | null) =>
    api.patch(`/users/${id}/suspension`, { suspendido_hasta: suspendidoHasta }),
  byRol: (rol: Role, params?: { sede?: string }) =>
    api.get<User[]>(`/usuarios/${rol}`, { params }),
};

export const modulosClienteApi = {
  list: (subModuloId?: string | number) =>
    api.get<ModuloCliente[]>('/moduloscliente', {
      params: subModuloId ? { subModuloId } : undefined,
    }),
  get: (moduloId: string | number) => api.get<ModuloCliente>(`/moduloscliente/${moduloId}`),
  create: (data: ModuloClienteInput) => api.post<ModuloCliente>('/moduloscliente', data),
  update: (moduloId: string | number, data: ModuloClienteInput) =>
    api.put<ModuloCliente>(`/moduloscliente/${moduloId}`, data),
  remove: (moduloId: string | number) => api.delete(`/moduloscliente/${moduloId}`),
  countCajas: (moduloClienteId: string | number) =>
    api.get<{ total: number }>('/moduloscliente/count_cajas', {
      params: { modulo_cliente_id: moduloClienteId },
    }),
};

export const subModulosApi = {
  list: () => api.get<SubModulo[]>('/sub_modulos'),
  create: (data: SubModuloInput) => api.post<SubModulo>('/sub_modulos', data),
  update: (id: string | number, data: SubModuloInput) => api.put<SubModulo>(`/sub_modulos/${id}`, data),
  remove: (id: string | number) => api.delete(`/sub_modulos/${id}`),
};

export const modulosCajaApi = {
  list: (
    idModuloCaja: string | number,
    params?: { limit?: number; offset?: number }
  ) =>
    api.get<ModuloCaja[]>('/modulos_caja', {
      params: { id_modulo_caja: idModuloCaja, ...params },
    }),
  get: (id: string | number) => api.get<ModuloCaja>(`/modulos_caja/${id}`),
  create: (data: ModuloCajaInput) => api.post<ModuloCaja>('/modulos_caja', data),
  update: (id: string | number, data: Omit<ModuloCajaInput, 'id_modulo_caja'>) =>
    api.put<ModuloCaja>(`/modulos_caja/${id}`, data),
  remove: (id: string | number) =>
    api.delete<{ message: string; fuids_eliminados: number }>(`/modulos_caja/${id}`),
  cambiarEstado: (id: string | number, estado_caja: string) =>
    api.patch(`/modulos_caja/${id}/cambiarEstado`, { estado_caja }),
  usuariosTecnica: (moduloId: string | number) =>
    api.get<UsuarioAsignado[]>(`/modulos_caja/${moduloId}/usuarios`),
  countFuidDatosReal: (cajaModulo: string) =>
    api.get<{ total: number }>('/modulos_caja/count_fuiddatosreal', {
      params: { caja_modulo: cajaModulo },
    }),
  siguienteNumero: (prefijo: string) =>
    api.get<{ prefijo: string; siguiente: string }>(`/modulos_caja/next/${prefijo}`),
  siguienteUpd: (cajaModulo: string) =>
    api.get<{ upd: string | null; requiere_inicio?: boolean; limite_alcanzado?: boolean; message?: string }>(
      `/modulos_caja/next-upd/${encodeURIComponent(cajaModulo)}`,
    ),
  /** Fija el UPD con el que el técnico arranca la caja. Se envía solo el número. */
  fijarUpdInicio: (cajaModulo: string, numero: string) =>
    api.put<{ upd: string; message: string }>(
      `/modulos_caja/${encodeURIComponent(cajaModulo)}/upd-inicio`,
      { numero },
    ),
  getTecnicaStats: () => api.get<{
    usuario: { id: number; nombre: string; cc: string };
    resumen: { cajas_asignadas: number; fuid_creados: number; ultimo_upd_global: string | null };
    detalle_cajas: Array<{
      id: number;
      caja_modulo: string;
      estado_caja: string | null;
      fecha_finalizacion: string | null;
      fuid_creados: number;
      ultimo_upd_caja: string | null;
      rango_inicio: string | null;
      rango_ultimo: string | null;
    }>;
  }>('/modulos_caja/tecnica-stats'),
  createSerie: (data: SerieCajasInput) =>
    api.post<{ message: string; cantidad: number; asignados: { tecnica: number } }>(
      '/modulos_caja/serie',
      data,
    ),
};

export const asignacionCajaTecnicaApi = {
  asignar: (data: AsignacionCajaInput) => api.post('/asignacion_caja_tecnica', data),
  eliminar: (moduloId: string | number, usuarios: number[]) =>
    api.post(`/asignacion_caja_tecnica/${moduloId}/eliminar`, { usuarios }),
};

export const fuidApi = {
  list: (params?: { caja?: string; limit?: number; offset?: number }) =>
    api.get<FuidDato[]>('/fuiddatosreal', { params }),
  get: (id: string | number) => api.get<FuidDato>(`/fuiddatosreal/${id}`),
  create: (data: DataRow) => api.post<FuidDato>('/fuiddatosreal', data),
  update: (id: string | number, data: DataRow) => api.put<FuidDato>(`/fuiddatosreal/${id}`, data),
  remove: (id: string | number) => api.delete(`/fuiddatosreal/${id}`),
  checkDuplicateUpd: (upd: string) =>
    api.get<DataRow>(`/fuiddatosreal/check-duplicate-upd?upd=${encodeURIComponent(upd)}`),
  checkCajaDuplicates: (caja: string) =>
    api.get<DataRow>(`/fuiddatosreal/check-caja-duplicates?caja=${encodeURIComponent(caja)}`),
  marcarOk: (ids: Array<string | number>) =>
    api.post<{ success: boolean }>('/fuiddatosreal/marcar-ok', { ids }),
  suggestions: (caja: string, campo: string, q?: string) =>
    api.get<DataRow[]>(`/fuiddatosreal/${caja}/suggestions/${campo}`, {
      params: q ? { q } : undefined,
    }),
};



export interface InventarioSyncOutcome {
  state: 'SUBIDO' | 'ERROR' | 'PENDIENTE';
  fileId?: string | null;
  error?: string | null;
  syncedAt?: string | null;
}

export interface InventarioSaveResponse {
  message: string;
  id: number;
  sync: InventarioSyncOutcome;
}

/**
 * Respuesta del recálculo. Trae el antes y el después de las dos cifras que le
 * importan a quien pulsa el botón, para poder decirle qué cambió en vez de un
 * "listo" que no dice nada.
 */
export interface InventarioRecalculoResponse {
  message: string;
  sync: InventarioSyncOutcome;
  antes: { totalCajas: number | null; registros: number | null };
  ahora: { totalCajas: number; registros: number };
}

export interface ClienteParaInventario {
  codigo: string;
  entidad_remitente: string;
  acta_transferencia_modulo: string;
  fecha_trans_modulo: string | null;
}

/** Un acta de transferencia del cliente, con el recuento y el rango de sus cajas. */
export interface ActaDelCliente {
  id: number;
  acta: string | null;
  fecha: string | null;
  totalCajas: number;
  cajaIniciar: string | null;
  cajaFin: string | null;
  /** Registros FUID digitados en las cajas de esta acta. */
  registros: number;
  /**
   * De esos, los creados después de la última lectura del inventario: el trabajo
   * que el inventario todavía no cuenta. Se calcula comparando la marca de
   * creación de cada registro contra esa lectura, no se estima.
   */
  registrosSinReflejar: number;
}

export interface ClienteParaInventarioResponse {
  cliente: ClienteParaInventario;
  /** Todas las actas del cliente. Un cliente puede tener más de una. */
  actas: ActaDelCliente[];
  cajas: Array<{ caja_modulo: string }>;
  /** Totales del cliente completo, sin acotar a un acta. */
  totalCajas: number;
  cajaIniciar: string | null;
  cajaFin: string | null;
}

export const inventarioApi = {
  list: () => api.get<Inventario[]>('/inventario'),
  get: (id: string | number) => api.get<Inventario>(`/inventario/${id}`),
  /** Con `acta` la vista previa se acota a esa acta; sin ella, al cliente entero. */
  fuid: (
    id: string | number,
    params?: { limit?: number; offset?: number; q?: string; acta?: string | null },
  ) => {
    const query: Record<string, unknown> = { ...params };
    if (!query.q) delete query.q;
    if (!query.acta) delete query.acta;
    return api.get<InventarioFuidResponse>(`/inventario/${id}/fuid`, { params: query });
  },
  /** Vuelve a leer las cifras del cliente y las guarda en su inventario. */
  recalcular: (id: string | number) => api.post<InventarioRecalculoResponse>(`/inventario/${id}/recalcular`),
  create: (data: DataRow) => api.post<InventarioSaveResponse>('/inventario', data),
  update: (id: string | number, data: DataRow) => api.put<InventarioSaveResponse>(`/inventario/${id}`, data),
  remove: (id: string | number) => api.delete(`/inventario/${id}`),
  sync: (id: string | number) => api.post<InventarioSaveResponse>(`/inventario/${id}/sync`),
  /**
   * El mismo Excel que se sube a Zoho, para guardarlo en el equipo.
   *
   * Con `acta` se baja solo el FUID de esa acta de transferencia; sin ella, el
   * del cliente completo.
   */
  descargarExcel: (id: string | number, acta?: string | null) =>
    api.get(`/inventario/${id}/excel`, {
      responseType: 'blob',
      params: acta ? { acta } : undefined,
    }),
  /**
   * El FUID de un cliente por su código, sin depender de que exista el registro
   * de inventario. Es lo que usan el árbol de actas y el formulario, donde se
   * puede querer el documento antes de guardar nada.
   */
  descargarExcelDeCliente: (codigo: string, acta?: string | null) =>
    api.get(`/inventario/clientes/${encodeURIComponent(codigo)}/excel`, {
      responseType: 'blob',
      params: acta ? { acta } : undefined,
    }),
  clientesParaInventario: () =>
    api.get<Array<Pick<ClienteParaInventario, 'codigo' | 'entidad_remitente'>>>('/inventario/clientes'),
  clienteParaInventario: (codigo: string) =>
    api.get<ClienteParaInventarioResponse>(`/inventario/clientes/${encodeURIComponent(codigo)}`),
};

export const historialApi = {
  list: (filtros: HistorialFiltros = {}) =>
    api.get<HistorialPage>('/historial', { params: filtros }),
  /** Todo lo que le ha pasado a un registro, de lo más antiguo a lo más reciente. */
  registro: (idDato: number) => api.get<LineaDeTiempo>(`/historial/registro/${idDato}`),
};

export const plantillaApi = {
  generar: (fileName: string, filtros: { caja?: string; entidad_remitente?: string; vacia?: boolean }) =>
    api.post('/generarPlantilla', { fileName, filtros }, { responseType: 'blob' }),
};

export interface EstadisticasProduccion {
  total_fuids: number;
  total_cajas: number;
  cajas_en_proceso: number;
  cajas_finalizadas: number;
  fuids_aprobados: number;
  fuids_pendientes: number;
  cajas_con_fuids: number;
  cajas_sin_fuids: number;
  promedio_fuids_por_caja: number;
  total_modulos_cliente: number;
  total_usuarios: number;
  total_actas: number;
  total_clientes: number;
  por_estado_caja: Array<{ estado: string; total: number }>;
  fuids_por_mes: Array<{ mes: string; total: number; aprobados: number }>;
  fuids_por_sede: Array<{ sede: string; total: number }>;
  digitadores: Digitador[];
  usuarios_por_rol: Array<{ rol: string; total: number }>;
  cajas_por_estado: Array<{ estado: string; total: number }>;
  avance_por_submodulo: Array<{ submodulo: string; entidad: string; total: number; aprobados: number }>;
  actividad_reciente: Array<{ dia: string; total: number }>;
  generado_en: string;
}

export interface Digitador {
  nombre: string;
  cc: string | null;
  rol: string | null;
  sede: string | null;
  total: number;
  aprobados: number;
  cajas: number;
  ultimo_registro: string | null;
}

/** Un campo que cambió entre dos versiones del mismo registro. */
export interface CambioCampo {
  campo: string;
  etiqueta: string;
  antes: string | null;
  despues: string | null;
}

/**
 * Una entrada del historial: la copia del registro antes del cambio, más el
 * detalle de qué quedó distinto después.
 */
export interface MovimientoHistorial extends Historial {
  cambios: CambioCampo[];
  registro_eliminado: boolean;
}

export interface HistorialPage {
  data: MovimientoHistorial[];
  total: number;
  page: number;
  pageSize: number;
  tipos: string[];
  sedes: string[];
}

/** La vida completa de un registro FUID. */
export interface LineaDeTiempo {
  id_dato: number;
  registro_eliminado: boolean;
  actual: Record<string, unknown> | null;
  movimientos: MovimientoHistorial[];
}

export interface HistorialFiltros {
  page?: number;
  pageSize?: number;
  q?: string;
  tipo?: string;
  sede?: string;
  caja?: string;
  desde?: string;
  hasta?: string;
}

/** Un día de trabajo de una persona dentro de un cliente. */
export interface DiaDeDigitador {
  dia: string;
  registros: number;
  cajas: number;
}

export interface DigitadorDeCliente {
  nombre: string;
  cc: string | null;
  rol: string | null;
  sede: string | null;
  registros: number;
  cajas: string[];
  primer_dia: string;
  ultimo_dia: string;
  por_dia: DiaDeDigitador[];
}

/** Una caja del cliente, con lo que se ha digitado en ella. */
export interface CajaDeCliente {
  caja: string;
  estado: string | null;
  acta: string | null;
  registros: number;
  aprobados: number;
  ultimo_dia: string | null;
  personas: string[];
}

/** Producción de un cliente, abierta por caja, por persona y por día. */
export interface ClienteConDetalle {
  codigo: string;
  cliente: string;
  actas: number;
  cajas: number;
  cajas_finalizadas: number;
  cajas_en_proceso: number;
  cajas_sin_registros: number;
  registros: number;
  aprobados: number;
  pendientes: number;
  digitadores: DigitadorDeCliente[];
  detalle_cajas: CajaDeCliente[];
}

/** Los filtros vacíos no se envían: llegarían como cadena vacía al servidor. */
function sinVacios(filtros: Record<string, string | undefined>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(filtros)) if (valor) params[clave] = valor;
  return params;
}

export const reportesApi = {
  fuidConEstadoCaja: () => api.get<FuidConEstado[]>('/fuid-con-estado-caja'),
  /** Quién digitó, en qué caja y qué día, dentro de cada cliente. */
  produccionDetallada: (filtros: { desde?: string; hasta?: string; persona?: string } = {}) =>
    api.get<ClienteConDetalle[]>('/estadisticas/detalle', { params: filtros }),
  /**
   * Seguimiento de inventario en el formato oficial F-PSD-IDA-001.
   *
   * Sin fechas trae todo lo digitado; con ellas, solo ese periodo. Los filtros
   * vacíos no se envían para que no lleguen como cadena vacía al servidor.
   */
  descargarSeguimiento: (filtros: { desde?: string; hasta?: string; persona?: string } = {}) =>
    api.get('/seguimiento-inventario/excel', { responseType: 'blob', params: sinVacios(filtros) }),
  /**
   * Cuántas jornadas y registros llevará el seguimiento con esos filtros. Se pide
   * antes de generar, para que la pantalla diga qué está armando.
   */
  resumenSeguimiento: (filtros: { desde?: string; hasta?: string; persona?: string } = {}) =>
    api.get<{ jornadas: number; registros: number }>('/seguimiento-inventario/resumen', {
      params: sinVacios(filtros),
    }),
  resumenCajasAgrupado: () => api.get<Array<{
    caja_inicial: string;
    caja_fin: string;
    upd_inicio: string | null;
    upd_fin: string | null;
    cajas_encontradas: number;
    total_registros: number;
  }>>('/resumen-cajas-agrupado'),
  estadisticas: () => api.get<EstadisticasProduccion>('/estadisticas'),
};

export default api;
