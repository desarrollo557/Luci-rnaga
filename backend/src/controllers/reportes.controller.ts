import type { Request, Response } from 'express';
import { query } from '../config/db.js';

export interface FuidConEstado {
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
  estado_caja: string | null;
}

export async function fuidConEstadoCaja(_req: Request, res: Response): Promise<void> {
  const rows = await query<FuidConEstado>(
    `SELECT
      f.id, f.fecha_del_dato, f.n_orden, f.codigo, f.entidad_remitente, f.entidad_productora,
      f.unidad_administrativa, f.oficina_productora, f.objeto, f.serie, f.subserie,
      f.numero_de_orden_interno, f.accionado_procesado, f.accionado_denunciante, f.identificacion,
      f.asunto, f.radicado, f.numero_doc, f.numero_doc_hasta, f.fecha_inicial,
      f.fecha_final, f.caja, f.upd, f.tomo, f.otro, f.caja_interna, f.folios,
      f.soporte, f.frecuencia, f.elaborado_por, f.nro_acta_transferible,
      f.fecha_transferencia, f.notas, f.sede, f.tiempo,
      mc.estado_caja
    FROM fuiddatosreal f
    LEFT JOIN modulos_caja mc ON f.caja = mc.caja_modulo`,
  );
  res.json(rows);
}
