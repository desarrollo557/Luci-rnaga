import type { Request, Response } from 'express';
import { query } from '../config/db.js';

/** Valida que la caja exista y devuelve solo los usuarios válidos y no duplicados. */
async function resolveAsignables(
  tabla: 'asignacion_caja_tecnica' | 'asignacion_caja_calidad',
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

  const rolEsperado = tabla === 'asignacion_caja_calidad' ? 'CALIDAD' : 'TECNICA';
  const rolIncorrecto = idsUnicos.filter((id) => {
    const u = existentes.find((e) => e.id === id);
    return u?.rol !== rolEsperado;
  });
  if (rolIncorrecto.length > 0) {
    const nombres = rolIncorrecto.map((id) => existentes.find((e) => e.id === id)?.nombre ?? id);
    return {
      error: {
        status: 400,
        message: `Los siguientes usuarios no tienen el rol ${rolEsperado}: ${nombres.join(', ')}`,
      },
      nuevos: [],
      duplicados: [],
    };
  }

  const asignados = await query<{ usuario_id: number }>(
    `SELECT usuario_id FROM ${tabla} WHERE modulo_id = ? AND usuario_id IN (?)`,
    [moduloId, idsUnicos],
  );
  const asignadosSet = new Set(asignados.map((a) => a.usuario_id));
  const duplicados = idsUnicos.filter((id) => asignadosSet.has(id));
  const nuevos = idsUnicos.filter((id) => !asignadosSet.has(id));

  return { error: null, nuevos, duplicados };
}

// ===== Asignación de cajas TÉCNICA =====

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

  const { error, nuevos, duplicados } = await resolveAsignables('asignacion_caja_tecnica', modulo_id, usuarios);
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

export async function assignCajaTecnicaConRango(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuarios, upd_inicio } = req.body as {
    modulo_id: number;
    usuarios: number[];
    upd_inicio: Record<number, string>;
  };

  if (!modulo_id || !usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'El campo modulo_id y la lista de usuarios son requeridos' });
    return;
  }
  if (!upd_inicio || Object.keys(upd_inicio).length === 0) {
    res.status(400).json({ message: 'Se requiere el rango UPD (upd_inicio) para cada técnico' });
    return;
  }

  const regex = /^UPD\d{7}$/;
  for (const [usuarioId, upd] of Object.entries(upd_inicio)) {
    if (!upd || !regex.test(upd.trim())) {
      res.status(400).json({ message: `El rango UPD para el usuario ${usuarioId} debe tener el formato UPD0000000 (7 dígitos)` });
      return;
    }
  }

  const { error, nuevos, duplicados } = await resolveAsignables('asignacion_caja_tecnica', modulo_id, usuarios);
  if (error) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (nuevos.length === 0) {
    res.status(409).json({ message: 'Los usuarios seleccionados ya están asignados a esta caja' });
    return;
  }

  const values = nuevos.map((usuarioId) => [modulo_id, usuarioId, upd_inicio[usuarioId]?.trim() ?? null]);
  await query('INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id, upd_inicio) VALUES ?', [values]);
  res.json({
    message: duplicados.length > 0
      ? `Asignación guardada (${duplicados.length} ya estaban asignados)`
      : 'Usuarios asignados correctamente a técnica con sus rangos UPD',
  });
}

export async function updateRangoCajaTecnica(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuario_id, upd_inicio } = req.body as {
    modulo_id: number;
    usuario_id: number;
    upd_inicio: string;
  };

  if (!modulo_id || !usuario_id || !upd_inicio) {
    res.status(400).json({ message: 'El campo modulo_id, usuario_id y upd_inicio son requeridos' });
    return;
  }

  const regex = /^UPD\d{7}$/;
  if (!regex.test(upd_inicio)) {
    res.status(400).json({ message: 'El rango UPD debe tener el formato UPD0000000 (7 dígitos)' });
    return;
  }

  const [caja] = await query<{ id: number }>('SELECT id FROM modulos_caja WHERE id = ?', [modulo_id]);
  if (!caja) {
    res.status(404).json({ message: 'La caja especificada no existe' });
    return;
  }

  const [usuario] = await query<{ id: number }>('SELECT id FROM users WHERE id = ?', [usuario_id]);
  if (!usuario) {
    res.status(404).json({ message: 'El usuario especificado no existe' });
    return;
  }

  const [asignacion] = await query<{ id: number }>(
    'SELECT id FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id = ?',
    [modulo_id, usuario_id],
  );
  if (!asignacion) {
    res.status(404).json({ message: 'El técnico no está asignado a esta caja' });
    return;
  }

  await query('UPDATE asignacion_caja_tecnica SET upd_inicio = ? WHERE modulo_id = ? AND usuario_id = ?', [
    upd_inicio,
    modulo_id,
    usuario_id,
  ]);
  res.json({ message: 'Rango UPD asignado correctamente' });
}

export async function removeCajaTecnica(req: Request, res: Response): Promise<void> {
  const { usuarios } = req.body as { usuarios: number[] };
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
    return;
  }

  await query('DELETE FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id IN (?)', [modulo_id, usuarios]);
  res.json({ message: 'Usuarios eliminados correctamente de técnica' });
}

// ===== Asignación de cajas CALIDAD =====

export async function assignCajaCalidad(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuarios } = req.body as { modulo_id: number; usuarios: number[] };

  if (!modulo_id || !usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'El campo modulo_id y la lista de usuarios son requeridos' });
    return;
  }

  const { error, nuevos, duplicados } = await resolveAsignables('asignacion_caja_calidad', modulo_id, usuarios);
  if (error) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (nuevos.length === 0) {
    res.status(409).json({ message: 'Los usuarios seleccionados ya están asignados a esta caja' });
    return;
  }

  const values = nuevos.map((usuarioId) => [modulo_id, usuarioId]);
  await query('INSERT INTO asignacion_caja_calidad (modulo_id, usuario_id) VALUES ?', [values]);
  res.json({
    message: duplicados.length > 0
      ? `Asignación guardada (${duplicados.length} ya estaban asignados)`
      : 'Usuarios asignados correctamente a calidad',
  });
}

export async function removeCajaCalidad(req: Request, res: Response): Promise<void> {
  const { usuarios } = req.body as { usuarios: number[] };
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
    return;
  }

  await query('DELETE FROM asignacion_caja_calidad WHERE modulo_id = ? AND usuario_id IN (?)', [modulo_id, usuarios]);
  res.json({ message: 'Usuarios eliminados correctamente de calidad' });
}

/** Genera la lista de cajas entre dos extremos del formato XXXC###### (sufijo de 6 dígitos). */
export function generateRangoCajas(rangoInicio: string, rangoFin: string): string[] {
  const inicioPrefix = rangoInicio.slice(0, 4);
  const inicioSuffix = rangoInicio.slice(4);
  const finSuffix = rangoFin.slice(4);

  const cajas: string[] = [];
  let currentSuffix = inicioSuffix;

  while (currentSuffix <= finSuffix) {
    cajas.push(`${inicioPrefix}${currentSuffix}`);
    currentSuffix = (parseInt(currentSuffix, 10) + 1).toString().padStart(6, '0');
  }
  return cajas;
}

export async function assignCajaCalidadRango(req: Request, res: Response): Promise<void> {
  const { modulo_id, usuarios, rango_inicio, rango_fin } = req.body as {
    modulo_id: number;
    usuarios: number[];
    rango_inicio: string;
    rango_fin: string;
  };

  if (!modulo_id || !usuarios || usuarios.length === 0 || !rango_inicio || !rango_fin) {
    res.status(400).json({ message: 'El campo modulo_id, usuarios, rango_inicio y rango_fin son requeridos' });
    return;
  }

  const regex = /^\d{3}C\d{6}$/;
  if (!regex.test(rango_inicio) || !regex.test(rango_fin)) {
    res.status(400).json({ message: 'El rango de cajas debe seguir el formato correcto' });
    return;
  }

  const inicioPrefix = rango_inicio.slice(0, 4);
  const finPrefix = rango_fin.slice(0, 4);
  const inicioSuffix = rango_inicio.slice(4);
  const finSuffix = rango_fin.slice(4);

  if (inicioPrefix !== finPrefix || inicioSuffix > finSuffix) {
    res.status(400).json({
      message: 'El rango de cajas no es válido, asegúrese de que "Desde" no sea mayor que "Hasta"',
    });
    return;
  }

  const idsUnicos = [...new Set(usuarios.map(Number).filter((n) => Number.isInteger(n)))];
  if (idsUnicos.length === 0) {
    res.status(400).json({ message: 'La lista de usuarios no es válida' });
    return;
  }

  const calidad = await query<{ id: number; nombre: string; rol: string }>(
    'SELECT id, nombre, rol FROM users WHERE id IN (?)',
    [idsUnicos],
  );
  const rolIncorrecto = idsUnicos.filter((id) => {
    const u = calidad.find((c) => c.id === id);
    return u?.rol !== 'CALIDAD';
  });
  if (rolIncorrecto.length > 0) {
    const nombres = rolIncorrecto.map((id) => calidad.find((c) => c.id === id)?.nombre ?? id);
    res.status(400).json({ message: `Los siguientes usuarios no tienen el rol CALIDAD: ${nombres.join(', ')}` });
    return;
  }

  const cajas = generateRangoCajas(rango_inicio, rango_fin);
  const cajasDb = await query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo IN (?)', [cajas]);

  if (cajasDb.length === 0) {
    res.status(404).json({ message: 'No se encontraron cajas en el rango especificado' });
    return;
  }

  // Evitar duplicados contra el trigger duplicidad_modulo_caja_calidad
  const yaAsignadas = await query<{ modulo_id: number }>(
    `SELECT DISTINCT modulo_id FROM asignacion_caja_calidad WHERE modulo_id IN (?) AND usuario_id IN (?)`,
    [cajasDb.map((c) => c.id), idsUnicos],
  );
  const yaSet = new Set(yaAsignadas.map((a) => a.modulo_id));
  const cajasNuevas = cajasDb.filter((c) => !yaSet.has(c.id));
  if (cajasNuevas.length === 0) {
    res.status(409).json({ message: 'Los usuarios seleccionados ya están asignados a todas las cajas del rango' });
    return;
  }

  const values: Array<[number, number]> = [];
  idsUnicos.forEach((usuarioId) => {
    cajasNuevas.forEach((caja) => values.push([caja.id, usuarioId]));
  });

  await query('INSERT INTO asignacion_caja_calidad (modulo_id, usuario_id) VALUES ?', [values]);
  res.json({
    message: yaSet.size > 0
      ? `Cajas asignadas correctamente (${yaSet.size} ya estaban asignadas)`
      : 'Cajas asignadas correctamente a los usuarios de calidad',
  });
}
