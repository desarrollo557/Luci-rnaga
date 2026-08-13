export type Role = 'ADMIN' | 'LIDER' | 'TECNICA' | 'CALIDAD';

export type DataRow = Record<string, string | number | null | undefined>;

export interface SessionUser {
  cc: string;
  nombre: string;
  rol: Role;
  sede: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  redirect?: string;
}

export interface User {
  cc: string;
  nombre: string;
  contrasena: string;
  rol: Role;
  sede: string;
}

export interface ModuloCliente extends DataRow {
  modulo_id?: string | null;
  nombre_modulo?: string | null;
  ubicacion?: string | null;
}

export interface ModuloCaja extends DataRow {
  caja_id?: string | null;
  modulo_id?: string | null;
  nombre_caja?: string | null;
}

export interface FuidDato extends DataRow {
  id?: string | number | null;
  caja?: string | null;
  estado_caja?: string | null;
}

export interface Inventario extends DataRow {
  ITEMS?: string | null;
  descripcion?: string | null;
  cantidad?: number | null;
}

export interface Historial extends DataRow {
  id?: string | number | null;
  descripcion?: string | null;
  fecha?: string | null;
}