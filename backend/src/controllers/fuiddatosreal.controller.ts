import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { pool, query, queryOne } from '../config/db.js';
import type { FuidDato } from '../types/db.js';
import type { FuidCreateDto, FuidUpdateDto } from '../types/index.js';
import { fuidValues, fuidOnDuplicateUpdate, isSuggestionField } from '../services/fuid.service.js';

export async function listFuid(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user) {
    res.status(403).send('Acceso denegado: usuario no autenticado');
    return;
  }

  if (user.rol === 'LIDER' || user.rol === 'CALIDAD' || user.rol === 'ADMIN') {
    const results = await query<FuidDato>('SELECT * FROM fuiddatosreal');
    res.json(results);
    return;
  }

  if (user.rol === 'TECNICA') {
    const nombreCompleto = `${user.nombre} (${user.cc})`;
    const results = await query<FuidDato>('SELECT * FROM fuiddatosreal WHERE elaborado_por = ?', [nombreCompleto]);
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [check] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM fuiddatosreal WHERE upd = ?',
      [body.upd],
    );
    const count = (check[0] as { count: number } | undefined)?.count ?? 0;
    if (count > 0) {
      await conn.rollback();
      res.status(400).json({ error: 'El valor de UPD ya existe en la base de datos' });
      return;
    }

    const values = fuidValues(body);
    const placeholders = fuidValues(body).map(() => '?').join(', ');
    const columns = [
      'fecha_del_dato', 'n_orden', 'codigo', 'entidad_remitente', 'entidad_productora',
      'unidad_administrativa', 'oficina_productora', 'objeto', 'serie', 'subserie',
      'numero_de_orden_interno', 'accionado_procesado', 'accionado_denunciante', 'identificacion',
      'asunto', 'radicado', 'numero_doc', 'numero_doc_hasta', 'fecha_inicial', 'fecha_final',
      'caja', 'upd', 'tomo', 'otro', 'caja_interna', 'folios', 'soporte', 'frecuencia',
      'elaborado_por', 'nro_acta_transferible', 'fecha_transferencia', 'notas', 'sede', 'tiempo',
      'historial_y_cambios', 'cambio_calidad', 'sede_calidad', 'asunto_2', 'asunto_3',
    ];

    const sql = `INSERT INTO fuiddatosreal (${columns.join(', ')})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${fuidOnDuplicateUpdate()}`;

    await conn.query(sql, values);
    await conn.commit();
    res.status(200).json({ message: 'Registro insertado o actualizado correctamente' });
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    console.error('Error al insertar o actualizar el registro:', error);
    res.status(500).json({ error: 'Error al insertar o actualizar el registro', message: error instanceof Error ? error.message : String(error) });
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
  const nombreCompletoMayus = `${user.nombre.toUpperCase()} (${cc})`;
  const isCreator =
    rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'CALIDAD' &&
    (registro.elaborado_por?.toUpperCase() !== nombreCompletoMayus);

  if (isCreator) {
    res.status(403).json({ error: 'No autorizado para actualizar este registro' });
    return;
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
    rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'CALIDAD' &&
    (registro.elaborado_por?.toUpperCase() !== nombreCompletoMayus);

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

  if (rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'TECNICA') {
    res.status(403).json({ success: false, error: 'Acceso denegado. Solo LIDER, ADMIN o TECNICA pueden realizar esta acción.' });
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
