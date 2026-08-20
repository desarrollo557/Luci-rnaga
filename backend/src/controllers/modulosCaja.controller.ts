import type { Request, Response } from 'express';
import { query, queryOne, queryResult } from '../config/db.js';
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
    sql = `SELECT mc.*, (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS total_fuids
      FROM modulos_caja mc
      WHERE mc.id_modulo_caja = ?`;
  } else if (user.rol === 'TECNICA') {
    sql = `SELECT mc.*, (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS total_fuids
      FROM modulos_caja mc
      JOIN asignacion_caja_tecnica act ON mc.id = act.modulo_id
      WHERE act.usuario_id = ? AND mc.id_modulo_caja = ?`;
    params.unshift(user.id);
  } else if (user.rol === 'CALIDAD') {
    sql = `SELECT mc.*, (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS total_fuids
      FROM modulos_caja mc
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

export async function getModuloCajaById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const results = await query<ModuloCaja>('SELECT * FROM modulos_caja WHERE id = ?', [id]);

  if (results.length === 0) {
    res.status(404).json({ message: 'Módulo de caja no encontrado' });
    return;
  }

  res.json(results[0]);
}

export async function getNextCajaNumero(req: Request, res: Response): Promise<void> {
  const prefijo = String(req.params.prefijo ?? '');
  // Prefijo esperado: 3 dígitos + "C" (ej. "051C"). Sin la "C" la agregamos.
  const base = prefijo.toUpperCase().replace(/C$/, '');
  if (!/^\d{1,3}$/.test(base)) {
    res.status(400).json({ message: 'El prefijo debe tener el formato de código del módulo (ej. 051)' });
    return;
  }
  const prefijoNormalizado = `${base.padStart(3, '0')}C`;

  const row = await queryOne<{ max_num: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(caja_modulo, LENGTH(?) + 1) AS UNSIGNED)) AS max_num
     FROM modulos_caja
     WHERE caja_modulo LIKE CONCAT(?, '%')`,
    [prefijoNormalizado, prefijoNormalizado],
  );

  const siguiente = (row?.max_num ?? 0) + 1;
  res.json({ prefijo: prefijoNormalizado, siguiente: `${prefijoNormalizado}${String(siguiente).padStart(6, '0')}` });
}

function incrementUPD(upd: string): string {
  const match = upd.match(/^UPD(\d{7})$/i);
  if (!match) return upd;
  const num = parseInt(match[1], 10) + 1;
  return `UPD${String(num).padStart(7, '0')}`;
}

export async function getNextUpdByCaja(req: Request, res: Response): Promise<void> {
  const cajaModulo = String(req.params.cajaModulo ?? '');
  if (!cajaModulo) {
    res.status(400).json({ error: 'El parámetro cajaModulo es requerido' });
    return;
  }

  const user = req.session.user;

  // Técnico con rango asignado: su consecutivo propio en esta caja.
  if (user?.rol === 'TECNICA') {
    const caja = await queryOne<{ id: number | null }>('SELECT id FROM modulos_caja WHERE caja_modulo = ?', [cajaModulo]);
    if (caja?.id) {
      const asignacion = await queryOne<{ upd_inicio: string | null; ultimo_upd: string | null }>(
        'SELECT upd_inicio, ultimo_upd FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id = ?',
        [caja.id, user.id],
      );
      if (asignacion?.ultimo_upd) {
        res.json({ upd: incrementUPD(asignacion.ultimo_upd) });
        return;
      }
      if (asignacion?.upd_inicio) {
        res.json({ upd: asignacion.upd_inicio });
        return;
      }
    }
  }

  // Fallback genérico (sin técnico o técnica sin rango): último UPD usado en la caja
  // (orden numérico por el sufijo de 7 dígitos) + 1.
  const last = await queryOne<{ upd: string | null }>(
    `SELECT upd FROM fuiddatosreal
     WHERE caja = ? AND upd IS NOT NULL AND upd <> ''
     ORDER BY CAST(SUBSTRING(upd, 4) AS UNSIGNED) DESC
     LIMIT 1`,
    [cajaModulo],
  );
  if (last?.upd) {
    res.json({ upd: incrementUPD(last.upd) });
    return;
  }

  // Sin registros: usar el siguiente UPD global del cliente (moduloscliente.upd_siguiente)
  const caja = await queryOne<{ id_modulo_caja: number | null }>(
    'SELECT id_modulo_caja FROM modulos_caja WHERE caja_modulo = ?',
    [cajaModulo],
  );
  let upd: string | null = null;
  if (caja?.id_modulo_caja) {
    const cliente = await queryOne<{ upd_siguiente: string | null }>(
      'SELECT upd_siguiente FROM moduloscliente WHERE id = ?',
      [caja.id_modulo_caja],
    );
    upd = cliente?.upd_siguiente ?? null;
  }
  res.json({ upd });
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

  // Insert caja
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
    `SELECT u.id, u.nombre, u.sede, act.upd_inicio, act.ultimo_upd
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

/** Estadísticas del técnico logueado: cajas asignadas, FUIDs creados, último UPD, etc. */
export async function getTecnicaStats(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user || user.rol !== 'TECNICA') {
    res.status(403).json({ error: 'Solo para técnicos' });
    return;
  }

  // Cajas asignadas al técnico
  const cajasAsignadas = await query<{ id: number; caja_modulo: string }>(
    `SELECT mc.id, mc.caja_modulo
     FROM modulos_caja mc
     JOIN asignacion_caja_tecnica act ON act.modulo_id = mc.id
     WHERE act.usuario_id = ?`,
    [user.id],
  );

  const cajaModulos = cajasAsignadas.map((c) => c.caja_modulo);

  let fuidStats: { total: number; ultimo_upd: string | null } = { total: 0, ultimo_upd: null };
  let updPorCaja: Record<string, { count: number; ultimo_upd: string | null }> = {};

  if (cajaModulos.length > 0) {
    // Total FUIDs creados por este técnico en sus cajas
    // Usamos elaborado_por para identificar al técnico (formato: "Nombre (CC)")
    const autor = `${user.nombre} (${user.cc})`;
    const placeholders = cajaModulos.map(() => '?').join(',');
    
    const fuidResult = await query<{ total: number; ultimo_upd: string | null }>(
      `SELECT COUNT(*) as total, MAX(upd) as ultimo_upd
       FROM fuiddatosreal
       WHERE caja IN (${placeholders}) AND elaborado_por = ?`,
      [...cajaModulos, autor],
    );
    fuidStats = fuidResult[0] || { total: 0, ultimo_upd: null };

    // UPDs por caja para este técnico
    const updRows = await query<{ caja: string; count: number; ultimo_upd: string | null }>(
      `SELECT caja, COUNT(*) as count, MAX(upd) as ultimo_upd
       FROM fuiddatosreal
       WHERE caja IN (${placeholders}) AND elaborado_por = ?
       GROUP BY caja`,
      [...cajaModulos, autor],
    );
    updPorCaja = Object.fromEntries(updRows.map((r) => [r.caja, { count: r.count, ultimo_upd: r.ultimo_upd }]));
  }

  // Rango UPD actual del técnico en cada caja (desde asignacion_caja_tecnica)
  const rangos = await query<{ modulo_id: number; upd_inicio: string | null; ultimo_upd: string | null }>(
    `SELECT modulo_id, upd_inicio, ultimo_upd
     FROM asignacion_caja_tecnica
     WHERE usuario_id = ?`,
    [user.id],
  );
  const rangosMap = Object.fromEntries(rangos.map((r) => [r.modulo_id, { inicio: r.upd_inicio, ultimo: r.ultimo_upd }]));

  res.json({
    usuario: { id: user.id, nombre: user.nombre, cc: user.cc },
    resumen: {
      cajas_asignadas: cajasAsignadas.length,
      fuid_creados: fuidStats.total,
      ultimo_upd_global: fuidStats.ultimo_upd,
    },
    detalle_cajas: cajasAsignadas.map((c) => ({
      id: c.id,
      caja_modulo: c.caja_modulo,
      fuid_creados: updPorCaja[c.caja_modulo]?.count ?? 0,
      ultimo_upd_caja: updPorCaja[c.caja_modulo]?.ultimo_upd ?? null,
      rango_inicio: rangosMap[c.id]?.inicio ?? null,
      rango_ultimo: rangosMap[c.id]?.ultimo ?? null,
    })),
  });
}
