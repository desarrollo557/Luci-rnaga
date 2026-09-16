import type { Request, Response } from 'express';
import { query, queryOne } from '../config/db.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js';
import type { Historial } from '../types/db.js';

/**
 * Historial de cambios de los registros FUID.
 *
 * Cada edición y cada borrado dejan en la tabla `historial` una copia del
 * registro **tal como estaba antes** del cambio (lo hacen dos triggers). Esa
 * copia por sí sola dice que algo pasó, pero no qué: para saberlo hay que
 * compararla con lo que vino después, que es la siguiente copia del mismo
 * registro o, si fue el último cambio, el registro vivo en `fuiddatosreal`.
 *
 * Esa comparación es la que se hace aquí, y es lo que convierte una lista de
 * filas en un historial legible: "Serie: OFICIOS → TUTELAS".
 */

/** Campos del FUID que se comparan entre versiones, en el orden del formulario. */
const CAMPOS_COMPARABLES = [
  'fecha_del_dato', 'n_orden', 'codigo', 'entidad_remitente', 'entidad_productora',
  'unidad_administrativa', 'oficina_productora', 'objeto', 'serie', 'subserie',
  'asunto', 'radicado', 'numero_doc', 'numero_doc_hasta', 'fecha_inicial', 'fecha_final',
  'caja', 'upd', 'tomo', 'otro', 'caja_interna', 'folios', 'soporte', 'frecuencia',
  'elaborado_por', 'nro_acta_transferible', 'fecha_transferencia', 'notas', 'sede', 'tiempo',
  'historial_cambios', 'cambio_calidad', 'sede_calidad',
] as const;

/**
 * Nombre visible de cada campo.
 *
 * No se reutiliza `ETIQUETA_CAMPO_FUID` porque ese mapa lleva artículo ("El
 * asunto", "Las notas") para encajar en los mensajes de error, y aquí las
 * etiquetas encabezan una comparación: "Notas: N/A → REVISADO" se lee, "Las
 * notas: N/A → REVISADO" no. Los tres últimos campos solo existen en el
 * historial: son el rastro de la revisión.
 */
const ETIQUETAS: Record<string, string> = {
  fecha_del_dato: 'Fecha del dato',
  n_orden: 'N.º de orden',
  codigo: 'Código',
  entidad_remitente: 'Entidad remitente',
  entidad_productora: 'Entidad productora',
  unidad_administrativa: 'Unidad administrativa',
  oficina_productora: 'Oficina productora',
  objeto: 'Objeto',
  serie: 'Serie',
  subserie: 'Subserie',
  asunto: 'Asunto',
  radicado: 'Radicado',
  numero_doc: 'N.º de documento desde',
  numero_doc_hasta: 'N.º de documento hasta',
  fecha_inicial: 'Fecha inicial',
  fecha_final: 'Fecha final',
  caja: 'Caja',
  upd: 'UPD',
  tomo: 'Tomo',
  otro: 'Otro',
  caja_interna: 'Caja interna',
  folios: 'Folios',
  soporte: 'Soporte',
  frecuencia: 'Frecuencia',
  elaborado_por: 'Elaborado por',
  nro_acta_transferible: 'N.º de acta',
  fecha_transferencia: 'Fecha de transferencia',
  notas: 'Notas',
  sede: 'Sede',
  tiempo: 'Tiempo de digitación',
  historial_cambios: 'Estado de revisión',
  cambio_calidad: 'Revisado por',
  sede_calidad: 'Sede de la revisión',
};

/**
 * En `fuiddatosreal` la columna del estado de revisión se llama
 * `historial_y_cambios`; en `historial`, `historial_cambios`. Es la misma.
 */
const EQUIVALENCIAS: Record<string, string> = { historial_cambios: 'historial_y_cambios' };

export interface CambioCampo {
  campo: string;
  etiqueta: string;
  antes: string | null;
  despues: string | null;
}

export interface MovimientoHistorial extends Historial {
  /** Qué cambió respecto al estado siguiente. Vacío en un borrado. */
  cambios: CambioCampo[];
  /** `true` si el registro ya no existe en `fuiddatosreal`. */
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

function normalizar(valor: unknown): string | null {
  if (valor == null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** Campos que cambiaron entre dos versiones del mismo registro. */
function diferencias(antes: Record<string, unknown>, despues: Record<string, unknown> | null): CambioCampo[] {
  if (!despues) return [];
  const cambios: CambioCampo[] = [];
  for (const campo of CAMPOS_COMPARABLES) {
    const valorAntes = normalizar(antes[campo]);
    const clave = EQUIVALENCIAS[campo] ?? campo;
    const valorDespues = normalizar(despues[campo] ?? despues[clave]);
    if (valorAntes !== valorDespues) {
      cambios.push({
        campo,
        etiqueta: ETIQUETAS[campo] ?? campo,
        antes: valorAntes,
        despues: valorDespues,
      });
    }
  }
  return cambios;
}

/**
 * Empareja cada copia con el estado que vino después.
 *
 * Las copias de un mismo registro se ordenan por fecha: el "después" de cada
 * una es la siguiente, y el de la última, el registro vivo. Un borrado no tiene
 * después, porque el registro dejó de existir.
 */
function emparejar(
  filas: Historial[],
  versionesPorDato: Map<number, Historial[]>,
  vivos: Map<number, Record<string, unknown>>,
): MovimientoHistorial[] {
  return filas.map((fila) => {
    const versiones = versionesPorDato.get(fila.id_dato) ?? [];
    const posicion = versiones.findIndex((v) => v.id_historial === fila.id_historial);
    const siguiente = posicion >= 0 ? versiones[posicion + 1] : undefined;
    const vivo = vivos.get(fila.id_dato) ?? null;
    const despues = fila.tipo_cambio === 'ELIMINADO'
      ? null
      : ((siguiente as unknown as Record<string, unknown>) ?? vivo);
    return {
      ...fila,
      cambios: diferencias(fila as unknown as Record<string, unknown>, despues),
      registro_eliminado: !vivo,
    };
  });
}

/** Filtros de la consulta, compartidos por el listado y el total. */
function construirFiltros(req: Request): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  const q = String(req.query.q ?? '').trim();
  if (q) {
    const like = `%${q}%`;
    // `id_dato` es un entero: PostgreSQL no lo compara con LIKE sin convertirlo
    // antes a texto, y `CAST(... AS CHAR)` es sintaxis de MySQL.
    where.push(
      `(caja LIKE ? OR upd LIKE ? OR CAST(id_dato AS TEXT) LIKE ? OR historial_cambios LIKE ?
        OR cambio_calidad LIKE ? OR sede_calidad LIKE ? OR tipo_cambio LIKE ?
        OR elaborado_por LIKE ? OR serie LIKE ? OR asunto LIKE ?)`,
    );
    params.push(like, like, like, like, like, like, like, like, like, like);
  }

  const tipo = String(req.query.tipo ?? '').trim();
  if (tipo) { where.push('tipo_cambio = ?'); params.push(tipo); }

  const sede = String(req.query.sede ?? '').trim();
  if (sede) { where.push('sede_calidad = ?'); params.push(sede); }

  const caja = String(req.query.caja ?? '').trim();
  if (caja) { where.push('caja = ?'); params.push(caja); }

  const desde = String(req.query.desde ?? '').trim();
  if (desde) { where.push('fecha_cambio >= ?'); params.push(`${desde} 00:00:00`); }

  const hasta = String(req.query.hasta ?? '').trim();
  if (hasta) { where.push('fecha_cambio <= ?'); params.push(`${hasta} 23:59:59`); }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * Listado paginado con el detalle de cada cambio.
 *
 * El historial ronda las 46.000 filas, así que filtros y paginación se
 * resuelven en SQL. La comparación se hace solo sobre los registros de la
 * página: se piden sus otras versiones y su estado vivo en dos consultas más,
 * no una por fila.
 */
export async function listHistorial(req: Request, res: Response): Promise<void> {
  const page = Math.max(0, Number(req.query.page) || 0);
  const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const { whereSql, params } = construirFiltros(req);

  const [rows, totalRow, tipos, sedes] = await Promise.all([
    query<Historial>(
      `SELECT * FROM historial ${whereSql} ORDER BY fecha_cambio DESC, id_historial DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, page * pageSize],
    ),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM historial ${whereSql}`, params),
    query<{ v: string }>(
      "SELECT DISTINCT tipo_cambio AS v FROM historial WHERE tipo_cambio IS NOT NULL AND tipo_cambio <> '' ORDER BY v",
    ),
    query<{ v: string }>(
      "SELECT DISTINCT sede_calidad AS v FROM historial WHERE sede_calidad IS NOT NULL AND sede_calidad <> '' ORDER BY v",
    ),
  ]);

  const ids = [...new Set(rows.map((r) => r.id_dato))];
  const versionesPorDato = new Map<number, Historial[]>();
  const vivos = new Map<number, Record<string, unknown>>();

  if (ids.length > 0) {
    const [versiones, actuales] = await Promise.all([
      query<Historial>(
        'SELECT * FROM historial WHERE id_dato IN (?) ORDER BY id_dato, fecha_cambio, id_historial',
        [ids],
      ),
      query<Record<string, unknown>>('SELECT * FROM fuiddatosreal WHERE id IN (?)', [ids]),
    ]);
    for (const v of versiones) {
      const lista = versionesPorDato.get(v.id_dato) ?? [];
      lista.push(v);
      versionesPorDato.set(v.id_dato, lista);
    }
    for (const a of actuales) vivos.set(Number(a.id), a);
  }

  res.json({
    data: emparejar(rows, versionesPorDato, vivos),
    total: totalRow?.n ?? 0,
    page,
    pageSize,
    tipos: tipos.map((t) => t.v),
    sedes: sedes.map((s) => s.v),
  } satisfies HistorialPage);
}

export interface LineaDeTiempo {
  id_dato: number;
  registro_eliminado: boolean;
  actual: Record<string, unknown> | null;
  movimientos: MovimientoHistorial[];
}

/**
 * Todo lo que le ha pasado a un registro, de lo más antiguo a lo más reciente.
 *
 * Es la vista que faltaba: en el listado se ve un cambio suelto, y aquí la vida
 * entera del FUID, quién lo tocó y qué dejó distinto cada vez.
 */
export async function historialDeRegistro(req: Request, res: Response): Promise<void> {
  const idDato = Number(req.params.idDato);
  if (!Number.isInteger(idDato) || idDato <= 0) {
    res.status(400).json({ error: 'El identificador del registro debe ser un número entero positivo' });
    return;
  }

  const [versiones, actual] = await Promise.all([
    query<Historial>(
      'SELECT * FROM historial WHERE id_dato = ? ORDER BY fecha_cambio, id_historial',
      [idDato],
    ),
    queryOne<Record<string, unknown>>('SELECT * FROM fuiddatosreal WHERE id = ?', [idDato]),
  ]);

  if (versiones.length === 0 && !actual) {
    res.status(404).json({ error: 'No hay historial para ese registro' });
    return;
  }

  const versionesPorDato = new Map<number, Historial[]>([[idDato, versiones]]);
  const vivos = new Map<number, Record<string, unknown>>();
  if (actual) vivos.set(idDato, actual);

  res.json({
    id_dato: idDato,
    registro_eliminado: !actual,
    actual: actual ?? null,
    movimientos: emparejar(versiones, versionesPorDato, vivos),
  } satisfies LineaDeTiempo);
}
