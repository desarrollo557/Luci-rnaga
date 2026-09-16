import type { Request, Response } from 'express';
import { query } from '../config/db.js';
import { fueraDeSuSede, sedeDeCaja } from '../services/jerarquia.service.js';

/**
 * Asignación de técnicos a cajas.
 *
 * Es la única asignación que existe en el software: el perfil de calidad se
 * retiró, y con él su tabla `asignacion_caja_calidad` y la asignación por
 * rango de cajas que solo usaba ese perfil.
 */

/**
 * Comprueba que la caja exista y que el líder pueda gestionarla (su sede).
 * Responde 404/403 y devuelve false cuando no se debe continuar.
 */
async function cajaGestionable(req: Request, res: Response, cajaId: string | number): Promise<boolean> {
  const caja = await sedeDeCaja(cajaId);
  if (!caja.existe) {
    res.status(404).json({ message: 'La caja especificada no existe' });
    return false;
  }
  if (fueraDeSuSede(req.session.user, caja.sede)) {
    res.status(403).json({ message: 'Solo puede gestionar asignaciones de cajas de su sede' });
    return false;
  }
  return true;
}

/** Valida que la caja exista y devuelve solo los técnicos válidos y no duplicados. */
async function resolveAsignables(
  moduloId: number,
  usuarios: number[],
): Promise<{ error: { status: number; message: string } | null; nuevos: number[]; duplicados: number[] }> {
  const cajas = await query<{ id: number }>('SELECT id FROM modulos_caja WHERE id = ?', [moduloId]);
  if (cajas.length === 0) {
    return { error: { status: 404, message: 'La caja especificada no existe' }, nuevos: [], duplicados: [] };
  }

  const idsUnicos = [...new Set(usuarios.map(Number).filter((n) => Number.isInteger(n)))];
  if (idsUnicos.length === 0) {
    return { error: { status: 400, message: 'La lista de usuarios no es válida' }, nuevos: [], duplicados: [] };
  }

  const existentes = await query<{ id: number; nombre: string; rol: string }>(
    'SELECT id, nombre, rol FROM users WHERE id IN (?)',
    [idsUnicos],
  );
  const existentesSet = new Set(existentes.map((u) => u.id));
  const inexistentes = idsUnicos.filter((id) => !existentesSet.has(id));
  if (inexistentes.length > 0) {
    return {
      error: { status: 400, message: `Los siguientes usuarios no existen: ${inexistentes.join(', ')}` },
      nuevos: [],
      duplicados: [],
    };
  }

  const rolIncorrecto = idsUnicos.filter((id) => existentes.find((e) => e.id === id)?.rol !== 'TECNICA');
  if (rolIncorrecto.length > 0) {
    const nombres = rolIncorrecto.map((id) => existentes.find((e) => e.id === id)?.nombre ?? id);
    return {
      error: {
        status: 400,
        message: `Los siguientes usuarios no tienen el rol TECNICA: ${nombres.join(', ')}`,
      },
      nuevos: [],
      duplicados: [],
    };
  }

  const asignados = await query<{ usuario_id: number }>(
    'SELECT usuario_id FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id IN (?)',
    [moduloId, idsUnicos],
  );
  const asignadosSet = new Set(asignados.map((a) => a.usuario_id));
  const duplicados = idsUnicos.filter((id) => asignadosSet.has(id));
  const nuevos = idsUnicos.filter((id) => !asignadosSet.has(id));

  return { error: null, nuevos, duplicados };
}

/** Valida que todos los usuarios existan y tengan el rol esperado; devuelve los ids únicos. */
export async function validarUsuariosDeRol(
  usuarios: number[],
  rolEsperado: 'TECNICA',
): Promise<{ error: string | null; ids: number[] }> {
  const ids = [...new Set(usuarios.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { error: null, ids: [] };

  const existentes = await query<{ id: number; nombre: string; rol: string }>(
    'SELECT id, nombre, rol FROM users WHERE id IN (?)',
    [ids],
  );
  const mapa = new Map(existentes.map((u) => [u.id, u]));
  const inexistentes = ids.filter((id) => !mapa.has(id));
  if (inexistentes.length > 0) {
    return { error: `Los siguientes usuarios no existen: ${inexistentes.join(', ')}`, ids: [] };
  }
  const rolIncorrecto = ids.filter((id) => mapa.get(id)?.rol !== rolEsperado);
  if (rolIncorrecto.length > 0) {
    const nombres = rolIncorrecto.map((id) => mapa.get(id)?.nombre ?? id);
    return { error: `Los siguientes usuarios no tienen el rol ${rolEsperado}: ${nombres.join(', ')}`, ids: [] };
  }
  return { error: null, ids };
}

/** Asigna en lote los técnicos (ya validados) a cada una de las cajas indicadas. */
export async function asignarUsuariosACajas(cajaIds: number[], usuarios: number[]): Promise<void> {
  if (cajaIds.length === 0 || usuarios.length === 0) return;
  const values = cajaIds.flatMap((cajaId) => usuarios.map((usuarioId) => [cajaId, usuarioId]));
  await query('INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id) VALUES ?', [values]);
}

export async function assignCajaTecnica(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuarios, upd_inicio } = req.body as {
    modulo_id: number;
    usuarios: number[];
    upd_inicio?: string | null;
  };

  if (!modulo_id || !usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'El campo modulo_id y la lista de usuarios son requeridos' });
    return;
  }
  if (!(await cajaGestionable(req, res, modulo_id))) return;

  const { error, nuevos, duplicados } = await resolveAsignables(modulo_id, usuarios);
  if (error) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (nuevos.length === 0) {
    res.status(409).json({ message: 'Los usuarios seleccionados ya están asignados a esta caja' });
    return;
  }

  const updInicio = upd_inicio?.trim() ? upd_inicio.trim() : null;
  const values = nuevos.map((usuarioId) => [modulo_id, usuarioId, updInicio]);
  await query('INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id, upd_inicio) VALUES ?', [values]);
  res.json({
    message: duplicados.length > 0
      ? `Asignación guardada (${duplicados.length} ya estaban asignados)`
      : 'Usuarios asignados correctamente a técnica',
  });
}

export async function removeCajaTecnica(req: Request, res: Response): Promise<void> {
  const { usuarios } = req.body as { usuarios: number[] };
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
    return;
  }
  if (!(await cajaGestionable(req, res, modulo_id))) return;

  await query('DELETE FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id IN (?)', [modulo_id, usuarios]);
  res.json({ message: 'Usuarios eliminados correctamente de técnica' });
}
