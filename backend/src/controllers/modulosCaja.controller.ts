import type { Request, Response } from 'express';
import { query, queryResult } from '../config/db.js';
import type { ModuloCaja } from '../types/db.js';

export async function listModulosCaja(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ message: 'No tienes permiso para acceder a estos datos' });
    return;
  }

  const idModuloCaja = String(req.query.id_modulo_caja ?? '');

  if (!idModuloCaja) {
    res.status(400).json({ message: 'El campo id_modulo_caja es requerido' });
    return;
  }

  let sql = '';
  const params: unknown[] = [idModuloCaja];

  if (user.rol === 'LIDER' || user.rol === 'ADMIN') {
    sql = 'SELECT * FROM modulos_caja WHERE id_modulo_caja = ?';
  } else if (user.rol === 'TECNICA') {
    sql = `SELECT mc.* FROM modulos_caja mc
      JOIN asignacion_caja_tecnica act ON mc.id = act.modulo_id
      WHERE act.usuario_id = ? AND mc.id_modulo_caja = ?`;
    params.unshift(user.id);
  } else if (user.rol === 'CALIDAD') {
    sql = `SELECT mc.* FROM modulos_caja mc
      JOIN asignacion_caja_calidad ac ON mc.id = ac.modulo_id
      WHERE ac.usuario_id = ? AND mc.id_modulo_caja = ?`;
    params.unshift(user.id);
  } else {
    res.status(403).json({ message: 'No tienes permiso para acceder a estos datos' });
    return;
  }

  const results = await query<ModuloCaja>(sql, params);
  res.json(results);
}

export async function createModuloCaja(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<ModuloCaja>;
  const {
    caja_modulo,
    entidad_remitente_caja,
    acta_trans_caja,
    fecha_trans_caja,
    id_modulo_caja,
    entidad_productora_caja,
    unidad_administrativa_caja,
    oficina_productora_caja,
    objeto_caja,
    estado_caja,
  } = body;

  if (
    !caja_modulo ||
    !entidad_remitente_caja ||
    !acta_trans_caja ||
    !fecha_trans_caja ||
    !id_modulo_caja ||
    !entidad_productora_caja ||
    !unidad_administrativa_caja ||
    !oficina_productora_caja ||
    !objeto_caja ||
    !estado_caja
  ) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  const result = await queryResult(
    `INSERT INTO modulos_caja (
      caja_modulo, entidad_remitente_caja, acta_trans_caja,
      fecha_trans_caja, id_modulo_caja, entidad_productora_caja,
      unidad_administrativa_caja, oficina_productora_caja, objeto_caja, estado_caja
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      caja_modulo,
      entidad_remitente_caja,
      acta_trans_caja,
      fecha_trans_caja,
      id_modulo_caja,
      entidad_productora_caja,
      unidad_administrativa_caja,
      oficina_productora_caja,
      objeto_caja,
      estado_caja,
    ],
  );

  res.status(201).json({
    message: 'Módulo de caja creado correctamente',
    modulo: {
      id: result.insertId,
      caja_modulo,
      entidad_remitente_caja,
      acta_trans_caja,
      fecha_trans_caja,
      id_modulo_caja,
      entidad_productora_caja,
      unidad_administrativa_caja,
      oficina_productora_caja,
      objeto_caja,
      estado_caja,
    },
  });
}

export async function updateModuloCaja(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const {
    caja_modulo,
    entidad_remitente_caja,
    acta_trans_caja,
    fecha_trans_caja,
    entidad_productora_caja,
    unidad_administrativa_caja,
    oficina_productora_caja,
    objeto_caja,
    estado_caja,
  } = req.body as Partial<ModuloCaja>;

  if (
    !caja_modulo ||
    !entidad_remitente_caja ||
    !acta_trans_caja ||
    !fecha_trans_caja ||
    !entidad_productora_caja ||
    !unidad_administrativa_caja ||
    !oficina_productora_caja ||
    !objeto_caja ||
    !estado_caja
  ) {
    res.status(400).send('Faltan campos requeridos');
    return;
  }

  await query(
    `UPDATE modulos_caja
     SET caja_modulo = ?, entidad_remitente_caja = ?, acta_trans_caja = ?,
         fecha_trans_caja = ?, entidad_productora_caja = ?, unidad_administrativa_caja = ?,
         oficina_productora_caja = ?, objeto_caja = ?, estado_caja = ?
     WHERE id = ?`,
    [
      caja_modulo,
      entidad_remitente_caja,
      acta_trans_caja,
      fecha_trans_caja,
      entidad_productora_caja,
      unidad_administrativa_caja,
      oficina_productora_caja,
      objeto_caja,
      estado_caja,
      id,
    ],
  );
  res.send('Módulo de caja actualizado correctamente');
}

export async function deleteModuloCaja(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await query('DELETE FROM modulos_caja WHERE id = ?', [id]);
  res.send('Módulo de caja eliminado correctamente');
}

export async function changeEstadoCaja(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { estado_caja } = req.body as { estado_caja: string };

  if (!estado_caja) {
    res.status(400).json({ message: 'El campo estado_caja es requerido' });
    return;
  }

  await query('UPDATE modulos_caja SET estado_caja = ? WHERE id = ?', [estado_caja, id]);
  res.json({ message: `Estado cambiado a ${estado_caja} correctamente` });
}

export async function countFuidByCaja(req: Request, res: Response): Promise<void> {
  const cajaModulo = String(req.query.caja_modulo ?? '');

  if (!cajaModulo) {
    res.status(400).json({ error: 'caja_modulo es requerido' });
    return;
  }

  const rows = await query<{ total_registros: number }>(
    'SELECT COUNT(*) AS total_registros FROM fuiddatosreal WHERE caja = ?',
    [cajaModulo],
  );
  res.json({ total: rows[0]?.total_registros ?? 0 });
}

export async function listTecnicaUsersOfCaja(req: Request, res: Response): Promise<void> {
  const { modulo_id } = req.params;
  const results = await query(
    `SELECT u.id, u.nombre, u.sede
     FROM users u
     JOIN asignacion_caja_tecnica act ON u.id = act.usuario_id
     WHERE act.modulo_id = ?`,
    [modulo_id],
  );
  res.json(results);
}

export async function listCalidadUsersOfCaja(req: Request, res: Response): Promise<void> {
  const { modulo_id } = req.params;
  const results = await query(
    `SELECT u.id, u.nombre, u.sede
     FROM users u
     JOIN asignacion_caja_calidad acc ON u.id = acc.usuario_id
     WHERE acc.modulo_id = ?`,
    [modulo_id],
  );
  res.json(results);
}
