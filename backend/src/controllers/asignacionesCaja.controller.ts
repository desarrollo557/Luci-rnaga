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

  const existentes = await query<{ id: number }>('SELECT id FROM users WHERE id IN (?)', [idsUnicos]);
  const existentesSet = new Set(existentes.map((u) => u.id));
  const inexistentes = idsUnicos.filter((id) => !existentesSet.has(id));
  if (inexistentes.length > 0) {
    return {
      error: { status: 400, message: `Los siguientes usuarios no existen: ${inexistentes.join(', ')}` },
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
  const { modulo_id, usuarios } = req.body as { modulo_id: number; usuarios: number[] };

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

  const values = nuevos.map((usuarioId) => [modulo_id, usuarioId]);
  await query('INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id) VALUES ?', [values]);
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

  const cajas = generateRangoCajas(rango_inicio, rango_fin);
  const cajasDb = await query<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo IN (?)', [cajas]);

  if (cajasDb.length === 0) {
    res.status(404).json({ message: 'No se encontraron cajas en el rango especificado' });
    return;
  }

  const values: Array<[number, number]> = [];
  usuarios.forEach((usuarioId) => {
    cajasDb.forEach((caja) => values.push([caja.id, usuarioId]));
  });

  await query('INSERT INTO asignacion_caja_calidad (modulo_id, usuario_id) VALUES ?', [values]);
  res.json({ message: 'Cajas asignadas correctamente a los usuarios de calidad' });
}
