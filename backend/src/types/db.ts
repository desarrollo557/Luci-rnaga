export interface User {
  id: number;
  cc: string;
  nombre: string;
  contrasena: string;
  rol: string;
  sede: string | null;
  suspendido_hasta: string | null;
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
  total_fuids?: number;
}

export interface FuidDato {
  id: number;
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
  FECHA_CREACION: string | Date | null;
  ZOHO_FILE_ID: string | null;
  ZOHO_SYNC_STATE: string | null;
  ZOHO_SYNC_AT: string | null;
  ZOHO_SYNC_ERROR: string | null;
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

export type Rol = 'ADMIN' | 'LIDER' | 'TECNICA' | 'CALIDAD';
