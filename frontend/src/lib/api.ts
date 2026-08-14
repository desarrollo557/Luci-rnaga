import axios from 'axios';
import type {
  DataRow,
  FuidConEstado,
  FuidDato,
  Historial,
  Inventario,
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
        const parts = body.details
          .map((detail) => (detail?.field ? `${detail.field}: ${detail.message}` : detail?.message))
          .filter((part): part is string => Boolean(part));
        if (parts.length > 0) return parts.join(', ');
      }
      if (body.error) return body.error;
      if (body.message) return body.message;
    }
    return 'Error en el servidor';
  }
  return 'Error en el servidor';
}

export interface UserInput {
  cc: string;
  nombre: string;
  contrasena: string;
  rol: Role;
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

export type RolAsignacion = 'tecnica' | 'calidad';

export interface UsuarioAsignado {
  id: number;
  nombre: string;
  sede: string | null;
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
}

export interface AsignacionCajaInput {
  modulo_id: number;
  usuarios: number[];
}

export interface AsignacionCajaRangoInput {
  modulo_id: number;
  usuarios: number[];
  rango_inicio: string;
  rango_fin: string;
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
  get: (cc: string) => api.get<User>(`/users/${cc}`),
  create: (data: UserInput) => api.post<User>('/users', data),
  update: (cc: string, data: Partial<UserInput>) => api.put<User>(`/users/${cc}`, data),
  remove: (cc: string) => api.delete(`/users/${cc}`),
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
  usuarios: (moduloId: string | number, rol?: RolAsignacion) =>
    api.get<UsuarioAsignado[]>(`/moduloscliente/${moduloId}/usuarios`, {
      params: rol ? { rol } : undefined,
    }),
  agregarUsuarios: (moduloId: string | number, rol: RolAsignacion, data: { usuarios: number[] }) =>
    api.post(`/moduloscliente/${moduloId}/agregar`, data, { params: { rol } }),
  eliminarUsuarios: (
    moduloId: string | number,
    rol: RolAsignacion,
    data: { usuarios: number[] },
  ) => api.post(`/moduloscliente/${moduloId}/eliminar`, data, { params: { rol } }),
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

export const asignacionTecnicaApi = {
  asignar: (data: DataRow) => api.post('/asignacion_tecnica', data),
  eliminar: (moduloId: string | number) =>
    api.post(`/asignacion_tecnica/${moduloId}/eliminar`),
  usuarios: (moduloId: string | number) => api.get<User[]>(`/asignacion_tecnica/${moduloId}/usuarios`),
};

export const asignacionCalidadApi = {
  asignar: (data: DataRow) => api.post('/asignacion_calidad', data),
  eliminar: (moduloId: string | number) => api.post(`/asignacion_calidad/${moduloId}/eliminar`),
  usuarios: (moduloId: string | number) => api.get<User[]>(`/asignacion_calidad/${moduloId}/usuarios`),
};

export const modulosCajaApi = {
  list: (idModuloCaja: string | number) =>
    api.get<ModuloCaja[]>('/modulos_caja', {
      params: { id_modulo_caja: idModuloCaja },
    }),
  get: (id: string | number) => api.get<ModuloCaja>(`/modulos_caja/${id}`),
  create: (data: ModuloCajaInput) => api.post<ModuloCaja>('/modulos_caja', data),
  update: (id: string | number, data: Omit<ModuloCajaInput, 'id_modulo_caja'>) =>
    api.put<ModuloCaja>(`/modulos_caja/${id}`, data),
  remove: (id: string | number) => api.delete(`/modulos_caja/${id}`),
  cambiarEstado: (id: string | number, estado_caja: string) =>
    api.patch(`/modulos_caja/${id}/cambiarEstado`, { estado_caja }),
  usuariosTecnica: (moduloId: string | number) =>
    api.get<UsuarioAsignado[]>(`/modulos_caja/${moduloId}/usuarios`),
  usuariosCalidad: (moduloId: string | number) =>
    api.get<UsuarioAsignado[]>(`/modulos_caja_calidad/${moduloId}/usuarios`),
  countFuidDatosReal: (cajaModulo: string) =>
    api.get<{ total: number }>('/modulos_caja/count_fuiddatosreal', {
      params: { caja_modulo: cajaModulo },
    }),
};

export const asignacionCajaTecnicaApi = {
  asignar: (data: AsignacionCajaInput) => api.post('/asignacion_caja_tecnica', data),
  eliminar: (moduloId: string | number, usuarios: number[]) =>
    api.post(`/asignacion_caja_tecnica/${moduloId}/eliminar`, { usuarios }),
};

export const asignacionCajaCalidadApi = {
  asignar: (data: AsignacionCajaInput) => api.post('/asignacion_caja_calidad', data),
  eliminar: (moduloId: string | number, usuarios: number[]) =>
    api.post(`/asignacion_caja_calidad/${moduloId}/eliminar`, { usuarios }),
  asignarRango: (data: AsignacionCajaRangoInput) => api.post('/asignacion_caja_calidad/rango', data),
};

export const fuidApi = {
  list: () => api.get<FuidDato[]>('/fuiddatosreal'),
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
  setValue: (caja: string, campo: string, valor: unknown) =>
    api.post(`/fuiddatosreal/${caja}/${campo}`, { valor }),
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

export interface ClienteParaInventario {
  codigo: string;
  entidad_remitente: string;
  acta_transferencia_modulo: string;
  fecha_trans_modulo: string | null;
}

export interface ClienteParaInventarioResponse {
  cliente: ClienteParaInventario;
  cajas: Array<{ caja_modulo: string }>;
  totalCajas: number;
  cajaIniciar: string | null;
  cajaFin: string | null;
}

export const inventarioApi = {
  list: () => api.get<Inventario[]>('/inventario'),
  get: (id: string | number) => api.get<Inventario>(`/inventario/${id}`),
  create: (data: DataRow) => api.post<InventarioSaveResponse>('/inventario', data),
  update: (id: string | number, data: DataRow) => api.put<InventarioSaveResponse>(`/inventario/${id}`, data),
  remove: (id: string | number) => api.delete(`/inventario/${id}`),
  sync: (id: string | number) => api.post<InventarioSaveResponse>(`/inventario/${id}/sync`),
  clientesParaInventario: () =>
    api.get<Array<Pick<ClienteParaInventario, 'codigo' | 'entidad_remitente'>>>('/inventario/clientes'),
  clienteParaInventario: (codigo: string) =>
    api.get<ClienteParaInventarioResponse>(`/inventario/clientes/${encodeURIComponent(codigo)}`),
};

export const historialApi = {
  list: () => api.get<Historial[]>('/historial'),
};

export const plantillaApi = {
  generar: (fileName: string, filtros: { caja?: string; entidad_remitente?: string }) =>
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
  por_estado_caja: Array<{ estado: string; total: number }>;
  fuids_por_mes: Array<{ mes: string; total: number }>;
  fuids_por_sede: Array<{ sede: string; total: number }>;
  top_digitadores: Array<{ nombre: string; total: number }>;
  usuarios_por_rol: Array<{ rol: string; total: number }>;
}

export const reportesApi = {
  fuidConEstadoCaja: () => api.get<FuidConEstado[]>('/fuid-con-estado-caja'),
  estadisticas: () => api.get<EstadisticasProduccion>('/estadisticas'),
};

export default api;
