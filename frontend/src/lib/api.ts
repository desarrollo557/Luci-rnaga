import axios from 'axios';
import type {
  DataRow,
  FuidDato,
  Historial,
  Inventario,
  LoginResponse,
  ModuloCaja,
  ModuloCliente,
  Role,
  SessionUser,
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
  create: (data: User) => api.post<User>('/users', data),
  update: (cc: string, data: Partial<User>) => api.put<User>(`/users/${cc}`, data),
  remove: (cc: string) => api.delete(`/users/${cc}`),
  byRol: (rol: Role) => api.get<User[]>(`/usuarios/${rol}`),
};

export const modulosClienteApi = {
  list: () => api.get<ModuloCliente[]>('/moduloscliente'),
  get: (moduloId: string | number) => api.get<ModuloCliente>(`/moduloscliente/${moduloId}`),
  create: (data: DataRow) => api.post<ModuloCliente>('/moduloscliente', data),
  update: (moduloId: string | number, data: DataRow) =>
    api.put<ModuloCliente>(`/moduloscliente/${moduloId}`, data),
  remove: (moduloId: string | number) => api.delete(`/moduloscliente/${moduloId}`),
  usuarios: (moduloId: string | number) => api.get<User[]>(`/moduloscliente/${moduloId}/usuarios`),
  countCajas: () => api.get<{ count: number }>('/moduloscliente/count_cajas'),
};

export const subModulosApi = {
  list: () => api.get<ModuloCliente[]>('/sub_modulos'),
  create: (data: DataRow) => api.post<ModuloCliente>('/sub_modulos', data),
  update: (id: string | number, data: DataRow) => api.put<ModuloCliente>(`/sub_modulos/${id}`, data),
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
  list: () => api.get<ModuloCaja[]>('/modulos_caja'),
  get: (id: string | number) => api.get<ModuloCaja>(`/modulos_caja/${id}`),
  create: (data: DataRow) => api.post<ModuloCaja>('/modulos_caja', data),
  update: (id: string | number, data: DataRow) => api.put<ModuloCaja>(`/modulos_caja/${id}`, data),
  remove: (id: string | number) => api.delete(`/modulos_caja/${id}`),
  usuariosTecnica: (moduloId: string | number) => api.get<User[]>(`/modulos_caja/${moduloId}/usuarios`),
  usuariosCalidad: (moduloId: string | number) => api.get<User[]>(`/modulos_caja_calidad/${moduloId}/usuarios`),
  countFuidDatosReal: () => api.get<{ count: number }>('/modulos_caja/count_fuiddatosreal'),
};

export const asignacionCajaTecnicaApi = {
  asignar: (data: DataRow) => api.post('/asignacion_caja_tecnica', data),
  eliminar: (moduloId: string | number) => api.post(`/asignacion_caja_tecnica/${moduloId}/eliminar`),
};

export const asignacionCajaCalidadApi = {
  asignar: (data: DataRow) => api.post('/asignacion_caja_calidad', data),
  eliminar: (moduloId: string | number) => api.post(`/asignacion_caja_calidad/${moduloId}/eliminar`),
  asignarRango: (data: DataRow) => api.post('/asignacion_caja_calidad/rango', data),
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

export const inventarioApi = {
  list: () => api.get<Inventario[]>('/inventario'),
  get: (id: string | number) => api.get<Inventario>(`/inventario/${id}`),
  create: (data: DataRow) => api.post<Inventario>('/inventario', data),
  update: (id: string | number, data: DataRow) => api.put<Inventario>(`/inventario/${id}`, data),
  remove: (id: string | number) => api.delete(`/inventario/${id}`),
};

export const historialApi = {
  list: () => api.get<Historial[]>('/historial'),
};

export const plantillaApi = {
  generar: (fileName: string, filtros: { caja?: string; entidad_remitente?: string }) =>
    api.post('/generarPlantilla', { fileName, filtros }, { responseType: 'blob' }),
};

export const reportesApi = {
  fuidConEstadoCaja: () => api.get<FuidDato[]>('/fuid-con-estado-caja'),
};

export default api;
