import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { pool, query, queryOne } from '../config/db.js';
import type { FuidDato } from '../types/db.js';
import type { FuidCreateDto, FuidUpdateDto } from '../types/index.js';
import { fuidValues, isSuggestionField } from '../services/fuid.service.js';
import { membershipCheck, resolveSubModuloByCaja } from '../services/rangosUpd.service.js';

const fechaActual = (): string => new Date().toISOString().slice(0, 10);

/** True cuando el enforcement de rangos UPD está activo para el despliegue gradual. */
const rangosUpdEnforce = (): boolean => process.env.RANGOS_UPD_ENFORCE === 'true';

/** Error de MySQL por violación de la restricción UNIQUE (backstop de consumo). */
function isErDupEntry(error: unknown): boolean {
  const e = error as { errno?: number; code?: string };
  return e.errno === 1062 || e.code === 'ER_DUP_ENTRY';
}

export async function listFuid(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).send('Acceso denegado: usuario no autenticado');
    return;
  }

  const caja = String(req.query.caja ?? '');
  const rawLimit = Number(req.query.limit ?? 500);
  const rawOffset = Number(req.query.offset ?? 0);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 0), 5000) : 500;
  const offset = Number.isInteger(rawOffset) ? Math.max(rawOffset, 0) : 0;

  if (user.rol === 'LIDER' || user.rol === 'ADMIN') {
    const results = caja
      ? await query<FuidDato>(
          'SELECT * FROM fuiddatosreal WHERE caja = ? LIMIT ? OFFSET ?',
          [caja, limit, offset],
        )
      : await query<FuidDato>('SELECT * FROM fuiddatosreal LIMIT ? OFFSET ?', [limit, offset]);
    res.json(results);
    return;
  }

  if (user.rol === 'TECNICA' || user.rol === 'CALIDAD') {
    // El técnico/calidad ve los FUIDs de las cajas que le fueron asignadas,
    // sin importar quién los digitó (la caja es del equipo asignado).
    const tabla = user.rol === 'CALIDAD' ? 'asignacion_caja_calidad' : 'asignacion_caja_tecnica';
    const sql = caja
      ? `SELECT f.* FROM fuiddatosreal f
         JOIN modulos_caja mc ON mc.caja_modulo = f.caja
         JOIN ${tabla} ac ON ac.modulo_id = mc.id
         WHERE ac.usuario_id = ? AND f.caja = ?
         LIMIT ? OFFSET ?`
      : `SELECT f.* FROM fuiddatosreal f
         JOIN modulos_caja mc ON mc.caja_modulo = f.caja
         JOIN ${tabla} ac ON ac.modulo_id = mc.id
         WHERE ac.usuario_id = ?
         LIMIT ? OFFSET ?`;
    const params = caja ? [user.id, caja, limit, offset] : [user.id, limit, offset];
    const results = await query<FuidDato>(sql, params);
    res.json(results);
    return;
  }

  res.status(403).send('Acceso denegado');
}

export async function checkDuplicateUpd(req: Request, res: Response): Promise<void> {
  const upd = String(req.query.upd ?? '');
  if (!upd) {
    res.status(400).json({ error: 'El parámetro upd es requerido' });
    return;
  }
  const row = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM fuiddatosreal WHERE upd = ?', [upd]);
  res.json({ exists: (row?.count ?? 0) > 0 });
}

export async function checkCajaDuplicates(req: Request, res: Response): Promise<void> {
  const caja = String(req.query.caja ?? '');
  if (!caja) {
    res.status(400).json({ error: 'El parámetro caja es requerido' });
    return;
  }
  const duplicates = await query<{
    caja: string;
    total: number;
    ids: string;
  }>(
    `SELECT caja, COUNT(*) AS total, GROUP_CONCAT(id) AS ids
     FROM fuiddatosreal
     WHERE caja = ?
     GROUP BY caja, n_orden, codigo, entidad_productora
     HAVING COUNT(*) > 1`,
    [caja],
  );
  res.json({ duplicates });
}

export async function getFuid(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const results = await query<FuidDato>('SELECT * FROM fuiddatosreal WHERE id = ?', [id]);
  res.json(results);
}

export async function createFuid(req: Request, res: Response): Promise<void> {
  const body = req.body as FuidCreateDto;
  const user = req.session.user;

  if (!user || !['LIDER', 'ADMIN', 'TECNICA'].includes(user.rol)) {
    res.status(403).json({ error: 'Acceso denegado' });
    return;
  }

  // El técnico solo puede digitar en las cajas que le fueron asignadas.
  if (user.rol === 'TECNICA') {
    const caja = body.caja;
    const [cajaAsignada] = await query<{ id: number }>(
      `SELECT mc.id FROM modulos_caja mc
       JOIN asignacion_caja_tecnica act ON act.modulo_id = mc.id
       WHERE act.usuario_id = ? AND mc.caja_modulo = ? LIMIT 1`,
      [user.id, caja],
    );
    if (!cajaAsignada) {
      res.status(403).json({ error: 'No tiene asignada la caja especificada' });
      return;
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Enforcement de consumo (solo TECNICA y con el flag activo): el UPD debe
    // pertenecer a un rango activo del usuario para el sub-módulo de la caja.
    if (user.rol === 'TECNICA' && rangosUpdEnforce()) {
      const subModuloId = await resolveSubModuloByCaja(body.caja ?? '');
      if (subModuloId === null) {
        await conn.rollback();
        res.status(409).json({ error: 'La caja no tiene sub-módulo asociado', code: 'CAJA_SIN_SUBMODULO' });
        return;
      }
      const miembro = await membershipCheck(user.id, subModuloId, body.upd ?? '');
      if (!miembro) {
        await conn.rollback();
        res.status(409).json({
          error: 'El UPD no pertenece a un rango activo asignado para este sub-módulo',
          code: 'UPD_FUERA_DE_RANGO',
        });
        return;
      }
    }

    const values = fuidValues(body);
    const placeholders = values.map(() => '?').join(', ');
    const columns = [
      'fecha_del_dato', 'n_orden', 'codigo', 'entidad_remitente', 'entidad_productora',
      'unidad_administrativa', 'oficina_productora', 'objeto', 'serie', 'subserie',
      'numero_de_orden_interno', 'accionado_procesado', 'accionado_denunciante', 'identificacion',
      'asunto', 'radicado', 'numero_doc', 'numero_doc_hasta', 'fecha_inicial', 'fecha_final',
      'caja', 'upd', 'tomo', 'otro', 'caja_interna', 'folios', 'soporte', 'frecuencia',
      'elaborado_por', 'nro_acta_transferible', 'fecha_transferencia', 'notas', 'sede', 'tiempo',
      'historial_y_cambios', 'cambio_calidad', 'sede_calidad', 'asunto_2', 'asunto_3',
    ];

    // INSERT plano: la restricción UNIQUE unique_upd es el backstop de consumo
    // atómico; un duplicado dispara ER_DUP_ENTRY → 409 en el catch.
    const sql = `INSERT INTO fuiddatosreal (${columns.join(', ')})
      VALUES (${placeholders})`;

    await conn.query(sql, values);
    await conn.commit();
    res.status(200).json({ message: 'Registro insertado correctamente' });
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    if (isErDupEntry(error)) {
      res.status(409).json({ error: 'El UPD ya fue usado', code: 'UPD_YA_USADO' });
      return;
    }
    console.error('Error al insertar el registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
}

export async function updateFuid(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as FuidUpdateDto;
  const user = req.session.user;

  if (!user) {
    res.status(403).json({ error: 'No autorizado para actualizar este registro' });
    return;
  }

  const results = await query<FuidDato>('SELECT * FROM fuiddatosreal WHERE id = ?', [id]);
  const registro = results[0];
  if (!registro) {
    res.status(403).json({ error: 'No autorizado para actualizar este registro' });
    return;
  }

  const { cc, rol } = user;

  if (rol === 'CALIDAD') {
    const [cajaAsignada] = await query<{ id: number }>(
      `SELECT mc.id FROM modulos_caja mc
       JOIN asignacion_caja_calidad ac ON ac.modulo_id = mc.id
       WHERE ac.usuario_id = ? AND mc.caja_modulo = ? LIMIT 1`,
      [user.id, registro.caja],
    );
    if (!cajaAsignada) {
      res.status(403).json({ error: 'No autorizado para actualizar este registro' });
      return;
    }
  }

  if (rol === 'TECNICA' && registro.fecha_del_dato !== fechaActual()) {
    res.status(403).json({ error: 'Los registros de días anteriores no pueden ser modificados' });
    return;
  }

  const nombreCompletoMayus = `${user.nombre.toUpperCase()} (${cc})`;
  const isCreator =
    rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'CALIDAD' &&
    (registro.elaborado_por?.toUpperCase() !== nombreCompletoMayus);

  if (isCreator) {
    res.status(403).json({ error: 'No autorizado para actualizar este registro' });
    return;
  }

  // Enforcement de consumo en edición (TECNICA + flag): solo valida membresía
  // cuando cambian caja o upd; si no cambian, no se valida (no rompe la edición
  // de registros legados ni de campos ajenos al rango).
  const nuevaCaja = body.caja ?? registro.caja ?? '';
  const nuevoUpd = body.upd ?? registro.upd ?? '';
  const cambiaCajaOUpd =
    (body.caja !== undefined && body.caja !== registro.caja) ||
    (body.upd !== undefined && body.upd !== registro.upd);

  if (rol === 'TECNICA' && rangosUpdEnforce() && cambiaCajaOUpd) {
    const subModuloId = await resolveSubModuloByCaja(nuevaCaja);
    if (subModuloId === null) {
      res.status(409).json({ error: 'La caja no tiene sub-módulo asociado', code: 'CAJA_SIN_SUBMODULO' });
      return;
    }
    const miembro = await membershipCheck(user.id, subModuloId, nuevoUpd);
    if (!miembro) {
      res.status(409).json({
        error: 'El UPD no pertenece a un rango activo asignado para este sub-módulo',
        code: 'UPD_FUERA_DE_RANGO',
      });
      return;
    }
  }

  const values = [...fuidValues(body as FuidCreateDto), id];
  const sql = `UPDATE fuiddatosreal SET
    fecha_del_dato = ?, n_orden = ?, codigo = ?, entidad_remitente = ?, entidad_productora = ?,
    unidad_administrativa = ?, oficina_productora = ?, objeto = ?, serie = ?, subserie = ?,
    numero_de_orden_interno = ?, accionado_procesado = ?, accionado_denunciante = ?,
    identificacion = ?, asunto = ?, radicado = ?, numero_doc = ?, numero_doc_hasta = ?,
    fecha_inicial = ?, fecha_final = ?, caja = ?, upd = ?, tomo = ?, otro = ?, caja_interna = ?,
    folios = ?, soporte = ?, frecuencia = ?, elaborado_por = ?, nro_acta_transferible = ?,
    fecha_transferencia = ?, notas = ?, sede = ?, tiempo = ?, historial_y_cambios = ?,
    cambio_calidad = ?, sede_calidad = ?, asunto_2 = ?, asunto_3 = ?
    WHERE id = ?`;

  await query(sql, values);
  res.status(200).json({ message: 'Registro actualizado' });
}

export async function deleteFuid(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.session.user;
  if (!user) {
    res.status(403).json({ error: 'No autorizado para eliminar este registro' });
    return;
  }

  const results = await query<FuidDato>('SELECT * FROM fuiddatosreal WHERE id = ?', [id]);
  const registro = results[0];
  if (!registro) {
    res.status(403).json({ error: 'No autorizado para eliminar este registro' });
    return;
  }

  const { cc, rol } = user;
  const nombreCompletoMayus = `${user.nombre.toUpperCase()} (${cc})`;
  const isCreator =
    rol !== 'LIDER' && rol !== 'ADMIN' &&
    (registro.elaborado_por?.toUpperCase() !== nombreCompletoMayus);

  if (rol === 'TECNICA' && registro.fecha_del_dato !== fechaActual()) {
    res.status(403).json({ error: 'Los registros de días anteriores no pueden ser modificados' });
    return;
  }

  if (isCreator) {
    res.status(403).json({ error: 'No autorizado para eliminar este registro' });
    return;
  }

  await query('DELETE FROM fuiddatosreal WHERE id = ?', [id]);
  res.status(200).json({ message: 'Registro eliminado' });
}

export async function suggestions(req: Request, res: Response): Promise<void> {
  const { caja, campo } = req.params;
  const q = String(req.query.q ?? '');

  if (!q || !caja || !isSuggestionField(campo)) {
    res.status(400).json({ error: 'Datos incompletos o campo no válido' });
    return;
  }

  const sql = `SELECT DISTINCT ${campo} FROM fuiddatosreal WHERE caja = ? AND ${campo} LIKE ? LIMIT 8`;
  const rows = await query<Record<string, string>>(sql, [caja, `${q}%`]);
  res.json(rows.map((row) => row[campo]));
}

export async function saveSuggestionValue(req: Request, res: Response): Promise<void> {
  const { caja, campo } = req.params;
  const { valor } = req.body as { valor: string };

  if (!valor || !caja || !isSuggestionField(campo)) {
    res.status(400).json({ error: 'Datos incompletos o campo no válido' });
    return;
  }

  const check = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM fuiddatosreal WHERE caja = ? AND ${campo} = ?`,
    [caja, valor],
  );

  if ((check?.count ?? 0) === 0) {
    await query(`INSERT INTO fuiddatosreal (caja, ${campo}) VALUES (?, ?)`, [caja, valor]);
    res.status(201).json({ message: `Valor guardado en ${campo}` });
  } else {
    res.status(200).json({ message: `El valor ya existe en ${campo}` });
  }
}

export async function marcarOk(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as { ids: number[] };
  const user = req.session.user;

  if (!user) {
    res.status(403).json({ success: false, error: 'Acceso denegado.' });
    return;
  }
  const { rol, nombre, cc, sede } = user;

  if (rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'TECNICA' && rol !== 'CALIDAD') {
    res.status(403).json({ success: false, error: 'Acceso denegado. Solo LIDER, ADMIN, TECNICA o CALIDAD pueden realizar esta acción.' });
    return;
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: 'Se requiere un array de IDs válido y no vacío.' });
    return;
  }

  const cambioCalidad = `${nombre} (${cc})`;
  const sedeCalidad = sede;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // El técnico/calidad solo puede marcar OK en cajas que le fueron asignadas.
    if (rol === 'TECNICA' || rol === 'CALIDAD') {
      const tabla = rol === 'CALIDAD' ? 'asignacion_caja_calidad' : 'asignacion_caja_tecnica';
      const [cajasAutorizadas] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT f.id FROM fuiddatosreal f
         JOIN modulos_caja mc ON mc.caja_modulo = f.caja
         JOIN ${tabla} ac ON ac.modulo_id = mc.id
         WHERE ac.usuario_id = ? AND f.id IN (?)`,
        [user.id, ids],
      );
      const autorizados = new Set((cajasAutorizadas as Array<{ id: number }>).map((r) => r.id));
      const noAutorizados = ids.filter((id) => !autorizados.has(id));
      if (noAutorizados.length > 0) {
        await conn.rollback();
        res.status(403).json({
          success: false,
          error: `No tiene asignadas ${noAutorizados.length} de las cajas seleccionadas`,
        });
        return;
      }
    }

    const [result] = await conn.query(
      `UPDATE fuiddatosreal
       SET historial_y_cambios = 'OK', cambio_calidad = ?, sede_calidad = ?
       WHERE id IN (?)`,
      [cambioCalidad, sedeCalidad, ids],
    );
    const affected = (result as unknown as { affectedRows: number }).affectedRows;

    if (affected !== ids.length) {
      await conn.rollback();
      res.status(400).json({ success: false, error: 'Algunos IDs no existen o no pudieron actualizarse', affectedRows: affected, expected: ids.length });
      return;
    }

    await conn.commit();
    res.status(200).json({ success: true, message: `${ids.length} registros actualizados correctamente.` });
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    console.error('Error al actualizar registros:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar registros' });
  } finally {
    conn.release();
  }
}
