import type { Request, Response } from 'express';
import { queryOne } from '../config/db.js';
import { checkRangeSchema } from '../validators/rangosUpd.validator.js';
import {
  assignRango,
  avanceRangosUpd as avanceRangosUpdService,
  avanceTecnica as avanceTecnicaService,
  checkOverlap,
  findActiveRanges,
  findUsedUpds,
  listarRangos as listarRangosService,
  resolveNextUpd,
  resolveSubModuloByCaja,
  revocarRango as revocarRangoService,
} from '../services/rangosUpd.service.js';
import type { RangoUpdEstadoFiltro } from '../services/rangosUpd.service.js';
import type { AssignRangeDto } from '../types/index.js';
import { formatUpd } from '../utils/updFormat.js';

/**
 * Valida los query params de GET /check con el schema. La ruta es GET, por lo que
 * no pasa por el middleware validate (que solo parsea req.body): se replica aquí
 * el mismo contrato de error 400 con detalles.
 */
function parseCheckQuery(
  req: Request,
  res: Response,
): { usuario_id: number; sub_modulo_id: number; upd_inicio: string; upd_fin: string } | null {
  const result = checkRangeSchema.safeParse(req.query);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    res.status(400).json({ error: 'Datos inválidos', details });
    return null;
  }
  return result.data;
}

export async function asignarRango(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ error: 'Acceso denegado: usuario no autenticado' });
    return;
  }

  const data = req.body as AssignRangeDto;

  // El asignatario debe existir y tener rol TECNICA; el sub-módulo debe existir.
  const asignatario = await queryOne<{ id: number; rol: string }>('SELECT id, rol FROM users WHERE id = ?', [
    data.usuario_id,
  ]);
  if (!asignatario) {
    res.status(404).json({ error: 'El usuario asignatario no existe' });
    return;
  }
  if (asignatario.rol !== 'TECNICA') {
    res.status(400).json({ error: 'El usuario asignatario debe tener el rol TECNICA' });
    return;
  }
  const subModulo = await queryOne<{ id: number }>('SELECT id FROM sub_modulos WHERE id = ?', [data.sub_modulo_id]);
  if (!subModulo) {
    res.status(404).json({ error: 'El sub-módulo no existe' });
    return;
  }

  const result = await assignRango(data, user.id);
  if (!result.ok) {
    const body: Record<string, unknown> = { error: result.error.message, code: result.error.code };
    if (result.error.code === 'USADOS') {
      body.used = result.error.used;
    } else {
      body.overlap = result.error.overlap;
    }
    res.status(result.status).json(body);
    return;
  }

  res.status(201).json({ message: 'Rango asignado correctamente', rango: result.rango });
}

export async function checkRango(req: Request, res: Response): Promise<void> {
  const data = parseCheckQuery(req, res);
  if (!data) return;

  const used = (await findUsedUpds(data)).map((n) => formatUpd(n));
  const overlap = await checkOverlap(data.usuario_id, data.sub_modulo_id, data.upd_inicio, data.upd_fin);

  const errors: string[] = [];
  if (used.length > 0) {
    errors.push(`El rango contiene UPDs ya usados: ${used.slice(0, 10).join(', ')}`);
  }
  if (overlap.length > 0) {
    errors.push('El rango se solapa con un rango activo del mismo técnico y sub-módulo');
  }

  res.json({ ok: used.length === 0 && overlap.length === 0, used, overlap, errors });
}

export async function revocarRango(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'El id del rango debe ser un entero positivo' });
    return;
  }

  const result = await revocarRangoService(id);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  res.json({ message: 'Rango revocado correctamente' });
}

/** GET /rangos-upd — lista rangos (con técnico y sub-módulo) para gestión/revocación.
 *  LIDER ve solo sus asignaciones; ADMIN ve todas. Filtros opcionales por query. */
export async function listarRangos(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ error: 'Acceso denegado: usuario no autenticado' });
    return;
  }

  // Mismo criterio que avanceRangosUpd: LIDER scoped a asignado_por, ADMIN ve todo.
  const asignadoPor = user.rol === 'ADMIN' ? undefined : user.id;

  const rawSub = req.query.sub_modulo_id;
  let subModuloId: number | undefined;
  if (rawSub !== undefined && rawSub !== '') {
    subModuloId = Number(rawSub);
    if (!Number.isInteger(subModuloId) || subModuloId <= 0) {
      res.status(400).json({ error: 'El parámetro sub_modulo_id debe ser un entero positivo' });
      return;
    }
  }

  let estado: RangoUpdEstadoFiltro = 'all';
  const rawEstado = req.query.estado;
  if (rawEstado !== undefined && rawEstado !== '') {
    const value = String(rawEstado);
    if (value !== 'activo' && value !== 'agotado' && value !== 'revocado' && value !== 'all') {
      res.status(400).json({ error: 'El parámetro estado debe ser: activo, agotado, revocado o all' });
      return;
    }
    estado = value;
  }

  const rangos = await listarRangosService(asignadoPor, subModuloId, estado);
  res.json({ rangos });
}

export async function siguienteUpd(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ error: 'Acceso denegado: usuario no autenticado' });
    return;
  }

  const caja = String(req.query.caja ?? '').trim();
  if (!caja) {
    res.status(400).json({ error: 'El parámetro caja es requerido' });
    return;
  }

  const subModuloId = await resolveSubModuloByCaja(caja);
  if (subModuloId === null) {
    res.status(409).json({ error: 'La caja no tiene un sub-módulo asociado', code: 'CAJA_SIN_SUBMODULO' });
    return;
  }

  const rangos = await findActiveRanges(user.id, subModuloId);
  if (rangos.length === 0) {
    res.status(409).json({ error: 'No tiene un rango activo para el sub-módulo de la caja', code: 'SIN_RANGO' });
    return;
  }

  const resultado = await resolveNextUpd(user.id, subModuloId);
  if (!resultado) {
    res.status(409).json({ error: 'Los rangos activos están agotados', code: 'AGOTADO' });
    return;
  }

  res.json({ upd: resultado.upd, sub_modulo_id: resultado.sub_modulo_id });
}

export async function avanceRangosUpd(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ error: 'Acceso denegado: usuario no autenticado' });
    return;
  }

  // LIDER ve solo sus asignaciones; ADMIN ve las de todos los líderes.
  const asignadoPor = user.rol === 'ADMIN' ? undefined : user.id;

  const rawSub = req.query.sub_modulo_id;
  let subModuloId: number | undefined;
  if (rawSub !== undefined && rawSub !== '') {
    subModuloId = Number(rawSub);
    if (!Number.isInteger(subModuloId) || subModuloId <= 0) {
      res.status(400).json({ error: 'El parámetro sub_modulo_id debe ser un entero positivo' });
      return;
    }
  }

  const result = await avanceRangosUpdService(asignadoPor, subModuloId);
  res.json(result);
}

/**
 * GET /rangos-upd/mi-avance — Avance del técnico autenticado (rol TECNICA).
 * Devuelve su propio progreso: total asignado, finalizadas, pendientes, %.
 * Opcional: filtrar por sub_modulo_id.
 */
export async function miAvance(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ error: 'Acceso denegado: usuario no autenticado' });
    return;
  }
  if (user.rol !== 'TECNICA') {
    res.status(403).json({ error: 'Acceso denegado: solo el rol TECNICA puede ver su avance' });
    return;
  }

  const rawSub = req.query.sub_modulo_id;
  let subModuloId: number | undefined;
  if (rawSub !== undefined && rawSub !== '') {
    subModuloId = Number(rawSub);
    if (!Number.isInteger(subModuloId) || subModuloId <= 0) {
      res.status(400).json({ error: 'El parámetro sub_modulo_id debe ser un entero positivo' });
      return;
    }
  }

  const result = await avanceTecnicaService(user.id, subModuloId);
  res.json(result);
}