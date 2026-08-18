export interface SessionUser {
  id: number;
  cc: string;
  nombre: string;
  rol: string;
  sede: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

export interface LoginRequest {
  cc: string;
  contrasena: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  redirect?: string;
}

export interface CreateUserDto {
  cc: string;
  nombre: string;
  contrasena: string;
  rol: string;
  sede: string;
  suspendido_hasta?: string | null;
}

export interface UpdateUserDto {
  cc: string;
  nombre: string;
  contrasena: string;
  rol: string;
  sede: string;
  suspendido_hasta?: string | null;
}

export interface FuidCreateDto {
  fecha_del_dato?: string | null;
  n_orden?: number | null;
  codigo?: string | null;
  entidad_remitente?: string | null;
  entidad_productora?: string | null;
  unidad_administrativa?: string | null;
  oficina_productora?: string | null;
  objeto?: string | null;
  serie?: string | null;
  subserie?: string | null;
  numero_de_orden_interno?: string | null;
  accionado_procesado?: string | null;
  accionado_denunciante?: string | null;
  identificacion?: string | null;
  asunto?: string | null;
  radicado?: string | null;
  numero_doc?: string | null;
  numero_doc_hasta?: string | null;
  fecha_inicial?: string | null;
  fecha_final?: string | null;
  caja?: string | null;
  upd?: string | null;
  tomo?: string | null;
  otro?: string | null;
  caja_interna?: string | null;
  folios?: string | null;
  soporte?: string | null;
  frecuencia?: string | null;
  elaborado_por?: string | null;
  nro_acta_transferible?: string | null;
  fecha_transferencia?: string | null;
  notas?: string | null;
  sede?: string | null;
  tiempo?: string | null;
  historial_y_cambios?: string | null;
  cambio_calidad?: string | null;
  sede_calidad?: string | null;
  asunto_2?: string | null;
  asunto_3?: string | null;
}

export type FuidUpdateDto = Partial<FuidCreateDto>;
