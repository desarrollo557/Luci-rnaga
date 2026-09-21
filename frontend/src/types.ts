export type Role = 'ADMIN' | 'LIDER' | 'TECNICA';

export type UpdFormat = string; // Formato: UPD seguido de 7 dígitos (ej. UPD1234567), validación en runtime via regex

export type DataRow = Record<string, string | number | null | undefined>;

export interface SessionUser {
  cc: string;
  nombre: string;
  /** Perfil principal: decide en qué pantalla aterriza al entrar. */
  rol: Role;
  /** Segundo perfil opcional. Suma permisos al principal; nunca los quita. */
  rol_secundario?: Role | null;
  sede: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  redirect?: string;
  rol: Role;
}

export interface User {
  id: number;
  cc: string;
  nombre: string;
  contrasena?: string;
  rol: Role;
  /** Segundo perfil opcional. Suma permisos al principal; nunca los quita. */
  rol_secundario?: Role | null;
  sede: string | null;
  suspendido_hasta?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SubModulo {
  id: number;
  codigo: string;
  entidad_remitente: string;
  sede_submodulos: string;
}

export interface ModuloCliente {
  id: number;
  codigo: string;
  entidad_remitente: string;
  acta_transferencia_modulo: string;
  fecha_trans_modulo: string | null;
  id_submodulo: number;
  total_cajas?: number;
  upd_siguiente?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ModuloCaja {
  id: number;
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
  /** Quién reabrió la caja a mano y qué día; mientras dure, la técnica corrige sus registros anteriores. */
  reabierta_por?: string | null;
  reabierta_el?: string | null;
  upd_inicio?: string | null;
  total_fuids?: number;
  /** Nombres separados por coma; solo llegan en el listado para líder/admin. */
  tecnicos_asignados?: string | null;
  upd: UpdFormat | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FuidDato {
  id: number;
  fecha_del_dato: string | null;
  n_orden: number | null;
  /** Consecutivo dentro de la caja, calculado en la consulta: es el "N° de orden" que se muestra. */
  n_orden_caja?: number;
  codigo: string | null;
  entidad_remitente: string | null;
  entidad_productora: string | null;
  unidad_administrativa: string | null;
  oficina_productora: string | null;
  objeto: string | null;
  serie: string | null;
  subserie: string | null;
  numero_de_orden_interno: string | null;
  accionado_procesado: string | null;
  accionado_denunciante: string | null;
  identificacion: string | null;
  asunto: string | null;
  radicado: string | null;
  numero_doc: string | null;
  numero_doc_hasta: string | null;
  fecha_inicial: string | null;
  fecha_final: string | null;
  caja: string | null;
  upd: string | null;
  tomo: string | null;
  otro: string | null;
  caja_interna: string | null;
  folios: string | null;
  soporte: string | null;
  frecuencia: string | null;
  elaborado_por: string | null;
  nro_acta_transferible: string | null;
  fecha_transferencia: string | null;
  notas: string | null;
  sede: string | null;
  tiempo: string | null;
  historial_y_cambios: string | null;
  cambio_calidad: string | null;
  sede_calidad: string | null;
  asunto_2: string | null;
  asunto_3: string | null;
  /**
   * Versión del registro para el bloqueo optimista. Se lee al abrir el
   * formulario y se devuelve al guardar; si entretanto otra persona guardó, el
   * backend responde 409 en vez de pisar su cambio.
   */
  version: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FuidConEstado extends FuidDato {
  estado_caja: string | null;
}

export interface Inventario {
  ITEMS: number;
  CODIGO_DEL_CLIENTE: string | null;
  CLIENTE: string | null;
  No_ACTA: string | null;
  FECHA_TRANSFERENCIA: string | null;
  X200: number | null;
  X300: number | null;
  X400: number | null;
  NC: number | null;
  TOTAL_CAJAS: number | null;
  ANEXOS: string | null;
  FECHA_ENTREGA_CUSTODIA: string | null;
  FUNCIONARIO: string | null;
  ESTADO_DEL_INVENTARIO: string | null;
  CAJAS_PROCESADAS: number | null;
  CAJA_INICIAR: string | null;
  CAJ_FIN: string | null;
  REGISTROS_PROCESADOS: number | null;
  FECHA_ENTREGA: string | null;
  INICIO_INVENTARIO: string | null;
  FIN_INVENTARIO: string | null;
  ESTADO_ENTREGA: string | null;
  MES_ENTREGA_PACA: string | null;
  FECHA_CREACION: string | null;
  FECHA_ACTUALIZACION: string | null;
  USUARIO_ACTUALIZACION: string | null;
  ZOHO_FILE_ID: string | null;
  ZOHO_SYNC_STATE: string | null;
  ZOHO_SYNC_AT: string | null;
  ZOHO_SYNC_ERROR: string | null;
  /*
   * Cifras vivas del cliente: lo que hay en el sistema ahora mismo, no lo que el
   * inventario tiene guardado. No son columnas de la tabla, las calcula el
   * listado. La pantalla las compara con las guardadas para decir si el
   * inventario está al día y cuántos registros entraron sin reflejar.
   */
  total_actas?: number;
  cajas_vivas?: number;
  registros_vivos?: number;
}

export interface InventarioFuidResponse {
  inventario: Inventario;
  filas: FuidConEstado[];
  total: number;
  limit: number;
  offset: number;
  q?: string | null;
  stats?: {
    total_filas: number;
    total_cajas: number;
    total_upds: number;
    total_folios: number;
    fecha_inicial_min: string | null;
    fecha_final_max: string | null;
  } | null;
}

export interface Historial {
  id_historial: number;
  id_dato: number;
  fecha_del_dato: string | null;
  n_orden: number | null;
  codigo: string | null;
  entidad_remitente: string | null;
  entidad_productora: string | null;
  unidad_administrativa: string | null;
  oficina_productora: string | null;
  objeto: string | null;
  serie: string | null;
  subserie: string | null;
  asunto: string | null;
  radicado: string | null;
  numero_doc: string | null;
  numero_doc_hasta: string | null;
  fecha_inicial: string | null;
  fecha_final: string | null;
  caja: string | null;
  upd: string | null;
  tomo: string | null;
  otro: string | null;
  caja_interna: string | null;
  folios: string | null;
  soporte: string | null;
  frecuencia: string | null;
  elaborado_por: string | null;
  nro_acta_transferible: string | null;
  fecha_transferencia: string | null;
  notas: string | null;
  sede: string | null;
  tipo_cambio: string | null;
  fecha_cambio: string | null;
  tiempo: string | null;
  historial_cambios: string | null;
  cambio_calidad: string | null;
  sede_calidad: string | null;
}

export const ROLES: Role[] = ['ADMIN', 'LIDER', 'TECNICA'];

/**
 * Perfiles de una cuenta.
 *
 * El principal decide en qué pantalla aterriza la persona al entrar. El segundo,
 * opcional, **solo suma permisos**: nunca quita ninguno. El caso que lo motivó es
 * el administrador que además lleva clientes, que antes necesitaba dos cuentas.
 */
export interface ConPerfiles {
  rol: Role;
  rol_secundario?: Role | null;
}

/** Si la cuenta tiene ese perfil, sea el principal o el segundo. */
export function tieneRol(usuario: ConPerfiles | null | undefined, rol: Role): boolean {
  if (!usuario) return false;
  return usuario.rol === rol || usuario.rol_secundario === rol;
}

/** Si la cuenta tiene alguno de esos perfiles. */
export function tieneAlgunRol(usuario: ConPerfiles | null | undefined, roles: readonly Role[]): boolean {
  return roles.some((rol) => tieneRol(usuario, rol));
}

/** Los perfiles de la cuenta, el principal primero y sin repetir. */
export function rolesDe(usuario: ConPerfiles | null | undefined): Role[] {
  if (!usuario) return [];
  const segundo = usuario.rol_secundario;
  return segundo && segundo !== usuario.rol ? [usuario.rol, segundo] : [usuario.rol];
}

/** Campos del FUID que admiten autocompletado por caja (mismo contrato que el backend). */
export const SUGGESTION_FIELDS = [
  'entidad_productora',
  'codigo',
  'unidad_administrativa',
  'oficina_productora',
  'objeto',
  'serie',
  'asunto_2',
  'subserie',
  'radicado',
  'numero_doc',
  'numero_doc_hasta',
  'caja_interna',
  'notas',
  'entidad_remitente',
  'asunto',
  'tomo',
  'soporte',
  'frecuencia',
  'sede',
  'tiempo',
  'asunto_3',
] as const;
