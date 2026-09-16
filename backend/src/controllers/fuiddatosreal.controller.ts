import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { getConnection, query, queryOne, queryResult } from '../config/db.js';
import type { FuidDato } from '../types/db.js';
import type { FuidCreateDto, FuidUpdateDto } from '../types/index.js';
import { fuidValues, isSuggestionField } from '../services/fuid.service.js';
import { audit } from '../services/audit.service.js';
import { fechaHoyLocal } from '../utils/format.js';
import { validarOrdenDeFechasParcial } from '../validators/fuiddatosreal.validator.js';

// La fecha del dato la fija el navegador en hora local; aquí se compara con la
// fecha local de Colombia para que "hoy" coincida también después de las 7 p. m.
const fechaActual = (): string => fechaHoyLocal();

/** Error de MySQL por violación de la restricción UNIQUE (backstop de consumo). */
function isErDupEntry(error: unknown): boolean {
  // 23505 es unique_violation en PostgreSQL, el equivalente del 1062 de MySQL.
  return (error as { code?: string }).code === '23505';
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

  if (user.rol === 'TECNICA') {
    // El técnico ve los FUIDs de las cajas que le fueron asignadas, sin
    // importar quién los digitó (la caja es del equipo asignado).
    // EXISTS en lugar de JOIN: si el mismo número de caja existiera en más de un
    // registro de modulos_caja, el JOIN devolvería cada FUID repetido.
    const sql = caja
      ? `SELECT f.* FROM fuiddatosreal f
         WHERE f.caja = ? AND EXISTS (
           SELECT 1 FROM modulos_caja mc
           JOIN asignacion_caja_tecnica ac ON ac.modulo_id = mc.id
           WHERE mc.caja_modulo = f.caja AND ac.usuario_id = ?
         )
         LIMIT ? OFFSET ?`
      : `SELECT f.* FROM fuiddatosreal f
         WHERE EXISTS (
           SELECT 1 FROM modulos_caja mc
           JOIN asignacion_caja_tecnica ac ON ac.modulo_id = mc.id
           WHERE mc.caja_modulo = f.caja AND ac.usuario_id = ?
         )
         LIMIT ? OFFSET ?`;
    const params = caja ? [caja, user.id, limit, offset] : [user.id, limit, offset];
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
    `SELECT caja, COUNT(*) AS total, string_agg(id::text, ',') AS ids
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

  // Se devuelve el registro, no el array de la consulta: un id inexistente daba
  // 200 con `[]`, que el cliente no puede distinguir de un registro válido.
  // El resto de controladores (getUser, getInventario, getModuloCajaById) ya
  // seguían este contrato.
  if (results.length === 0) {
    res.status(404).json({ error: 'Registro FUID no encontrado' });
    return;
  }

  res.json(results[0]);
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

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

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

    // El técnico avanza su consecutivo propio: actualiza ultimo_upd de su asignación
    // solo cuando el registro insertado trae un UPD. Si el usuario editó a mano un valor
    // más alto, se conserva el máximo real para no romper la secuencia del siguiente.
    if (user.rol === 'TECNICA' && body.caja && body.upd) {
      await conn.query(
        `UPDATE asignacion_caja_tecnica act
         SET ultimo_upd = CASE
           WHEN act.ultimo_upd IS NULL
             OR CAST(SUBSTRING(? FROM 4) AS INTEGER) >= CAST(SUBSTRING(act.ultimo_upd FROM 4) AS INTEGER)
             THEN ?
           ELSE act.ultimo_upd
         END
         FROM modulos_caja mc
         WHERE mc.id = act.modulo_id AND act.usuario_id = ? AND mc.caja_modulo = ?`,
        [body.upd, body.upd, user.id, body.caja],
      );
    }

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
    res.status(404).json({ error: 'El registro no existe o ya fue eliminado' });
    return;
  }

  const { cc, rol } = user;

  /**
   * El líder edita sin restricciones, por decisión de negocio: es quien responde
   * por el inventario del cliente y tiene que poder corregir cualquier registro,
   * lo haya digitado quien lo haya digitado y sea de la fecha que sea. El
   * administrador va con él porque administra el sistema entero.
   *
   * Todo cambio queda registrado en el historial con su autor, así que levantar
   * el bloqueo no deja el dato sin rastro.
   */
  const editaSinRestriccion = rol === 'LIDER' || rol === 'ADMIN';

  // Para el resto, un registro solo se corrige el mismo día en que se digitó:
  // así el trabajo cerrado de días anteriores no se toca por descuido.
  if (!editaSinRestriccion && registro.fecha_del_dato !== fechaActual()) {
    res.status(403).json({ error: 'Los registros de días anteriores no pueden ser modificados' });
    return;
  }

  // Una edición que solo cambia una de las dos fechas no puede compararlas entre
  // sí en el schema: la otra hay que leerla del registro ya guardado.
  const errorOrden = validarOrdenDeFechasParcial(body, registro);
  if (errorOrden) {
    res.status(400).json({ error: 'Datos inválidos', details: [{ field: 'fecha_final', message: errorOrden }] });
    return;
  }

  /**
   * Quién puede editar el registro de otra persona.
   *
   * El líder y el administrador, porque responden por el inventario. La técnica
   * solo corrige lo suyo.
   */
  const nombreCompletoMayus = `${user.nombre.toUpperCase()} (${cc})`;
  const revisaLoDeOtros = editaSinRestriccion;
  const loDigitoEstaPersona = registro.elaborado_por?.toUpperCase() === nombreCompletoMayus;

  if (!revisaLoDeOtros && !loDigitoEstaPersona) {
    res.status(403).json({
      error: 'Solo puede modificar los registros que usted digitó',
    });
    return;
  }

  // Bloqueo optimista: el UPDATE solo aplica si el registro sigue en la versión
  // que el cliente leyó, y la sube en el mismo paso. Si dos personas
  // editan a la vez, la segunda no pisa el trabajo de la primera en silencio.
  const values = [...fuidValues(body as FuidCreateDto), id, body.version];
  const sql = `UPDATE fuiddatosreal SET
    fecha_del_dato = ?, n_orden = ?, codigo = ?, entidad_remitente = ?, entidad_productora = ?,
    unidad_administrativa = ?, oficina_productora = ?, objeto = ?, serie = ?, subserie = ?,
    numero_de_orden_interno = ?, accionado_procesado = ?, accionado_denunciante = ?,
    identificacion = ?, asunto = ?, radicado = ?, numero_doc = ?, numero_doc_hasta = ?,
    fecha_inicial = ?, fecha_final = ?, caja = ?, upd = ?, tomo = ?, otro = ?, caja_interna = ?,
    folios = ?, soporte = ?, frecuencia = ?, elaborado_por = ?, nro_acta_transferible = ?,
    fecha_transferencia = ?, notas = ?, sede = ?, tiempo = ?, historial_y_cambios = ?,
    cambio_calidad = ?, sede_calidad = ?, asunto_2 = ?, asunto_3 = ?,
    version = version + 1
    WHERE id = ? AND version = ?`;

  try {
    const resultado = await queryResult(sql, values);

    // La existencia del registro ya se comprobó arriba, así que no haber tocado
    // ninguna fila solo puede significar que la versión cambió mientras tanto.
    if (resultado.affectedRows === 0) {
      res.status(409).json({
        error: 'Este registro fue modificado por otro usuario. Recarga para ver los cambios más recientes.',
        code: 'VERSION_DESACTUALIZADA',
      });
      return;
    }

    if (user.rol === 'TECNICA' && body.caja && body.upd) {
      await query(
        `UPDATE asignacion_caja_tecnica act
         SET ultimo_upd = CASE
           WHEN act.ultimo_upd IS NULL
             OR CAST(SUBSTRING(? FROM 4) AS INTEGER) >= CAST(SUBSTRING(act.ultimo_upd FROM 4) AS INTEGER)
             THEN ?
           ELSE act.ultimo_upd
         END
         FROM modulos_caja mc
         WHERE mc.id = act.modulo_id AND act.usuario_id = ? AND mc.caja_modulo = ?`,
        [body.upd, body.upd, user.id, body.caja],
      );
    }
  } catch (error) {
    if (isErDupEntry(error)) {
      res.status(409).json({ error: 'El UPD ya fue usado', code: 'UPD_YA_USADO' });
      return;
    }
    console.error('Error al actualizar el registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
    return;
  }

  // Se devuelve la versión ya incrementada para que el cliente pueda seguir
  // editando el mismo registro sin tener que recargarlo.
  res.status(200).json({ message: 'Registro actualizado', version: body.version + 1 });
}

export async function deleteFuid(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.session.user;
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  const registro = await queryOne<FuidDato>('SELECT * FROM fuiddatosreal WHERE id = ?', [id]);
  if (!registro) {
    res.status(404).json({ error: 'El registro no existe o ya fue eliminado' });
    return;
  }

  // Jerarquía: ADMIN borra cualquier registro; LIDER los de su sede; TECNICA solo
  // los que digitó el mismo día (fecha local de Colombia).
  const { rol } = user;
  if (rol === 'LIDER' && registro.sede && registro.sede !== user.sede) {
    res.status(403).json({ error: 'Solo puede eliminar registros de su sede' });
    return;
  }
  if (rol === 'TECNICA') {
    const autor = `${user.nombre.toUpperCase()} (${user.cc})`;
    if ((registro.elaborado_por ?? '').toUpperCase() !== autor) {
      res.status(403).json({ error: 'Solo puede eliminar los registros que usted digitó' });
      return;
    }
    if (registro.fecha_del_dato !== fechaActual()) {
      res.status(403).json({
        error: 'Los registros de días anteriores no pueden ser eliminados; solicítelo a su líder',
      });
      return;
    }
  }

  // El trigger after_delete_fuiddatosreal conserva una copia en historial.
  await query('DELETE FROM fuiddatosreal WHERE id = ?', [id]);
  void audit({
    entidad: 'fuiddatosreal',
    entidadId: id,
    accion: 'ELIMINAR',
    detalle: `FUID ${registro.upd ?? `#${id}`} de la caja ${registro.caja ?? '—'}`,
    usuario: user,
  });
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

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // El técnico solo puede marcar OK en cajas que le fueron asignadas.
    if (rol === 'TECNICA') {
      const [cajasAutorizadas] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT f.id FROM fuiddatosreal f
         JOIN modulos_caja mc ON mc.caja_modulo = f.caja
         JOIN asignacion_caja_tecnica ac ON ac.modulo_id = mc.id
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

    // La versión sube también aquí: marcar OK es un cambio real del registro, y
    // si no se contara, alguien que lo tuviera abierto podría guardar encima y
    // borrar el visto bueno de la revisión sin que nadie lo detectara.
    const [result] = await conn.query(
      `UPDATE fuiddatosreal
       SET historial_y_cambios = 'OK', cambio_calidad = ?, sede_calidad = ?, version = version + 1
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
