import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { getConnection, query, queryOne, queryResult } from '../config/db.js';
import type { ModuloCaja } from '../types/db.js';
import { formatUpd, isUpdValid, nextUpd, normalizeUpd, toNumeric, UPD_MAX } from '../utils/updFormat.js';
import { asignarUsuariosACajas, validarUsuariosDeRol } from './asignacionesCaja.controller.js';
import { audit } from '../services/audit.service.js';
import { fueraDeSuSede, sedeDeActa, sedeDeCaja, tieneCajaAsignada } from '../services/jerarquia.service.js';
import { cambiarEstadoCaja } from '../services/cicloCaja.service.js';

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
    // Incluye los nombres de los usuarios asignados a cada caja para mostrarlos en la lista.
    sql = `SELECT mc.*, (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS total_fuids,
      (SELECT string_agg(u.nombre, ', ' ORDER BY u.nombre)
         FROM asignacion_caja_tecnica a JOIN users u ON u.id = a.usuario_id
         WHERE a.modulo_id = mc.id) AS tecnicos_asignados
      FROM modulos_caja mc
      WHERE mc.id_modulo_caja = ?`;
  } else if (user.rol === 'TECNICA') {
    sql = `SELECT mc.*, (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS total_fuids
      FROM modulos_caja mc
      JOIN asignacion_caja_tecnica act ON mc.id = act.modulo_id
      WHERE act.usuario_id = ? AND mc.id_modulo_caja = ?`;
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
    `SELECT MAX(CAST(SUBSTRING(caja_modulo FROM LENGTH(CAST(? AS text)) + 1) AS INTEGER)) AS max_num
     FROM modulos_caja
     WHERE caja_modulo LIKE CAST(? AS text) || '%'`,
    [prefijoNormalizado, prefijoNormalizado],
  );

  const siguiente = (row?.max_num ?? 0) + 1;
  res.json({ prefijo: prefijoNormalizado, siguiente: `${prefijoNormalizado}${String(siguiente).padStart(6, '0')}` });
}

const UPD_LIMITE_MENSAJE =
  'Se alcanzó el último UPD posible (UPD9999999). Indique manualmente el número con el que continúa.';

/**
 * Primer UPD libre (no usado en ningún registro) a partir del número indicado, sin
 * pasar de los 7 dígitos. Los UPD se guardan con ancho fijo (UPD + 7 dígitos), así
 * que el BETWEEN de cadenas equivale al numérico y aprovecha el índice único.
 */
async function siguienteUpdLibre(desde: number): Promise<string | null> {
  const VENTANA = 1000;
  let candidato = Math.max(0, desde);
  while (candidato <= UPD_MAX) {
    const fin = Math.min(candidato + VENTANA - 1, UPD_MAX);
    const usados = await query<{ upd: string }>(
      'SELECT upd FROM fuiddatosreal WHERE upd BETWEEN ? AND ?',
      [formatUpd(candidato), formatUpd(fin)],
    );
    const ocupados = new Set(usados.map((u) => toNumeric(u.upd)));
    for (let n = candidato; n <= fin; n++) {
      if (!ocupados.has(n)) return formatUpd(n);
    }
    candidato = fin + 1;
  }
  return null;
}

/** Siguiente UPD libre después del indicado; null si es inválido o ya era el último posible. */
async function siguienteUpdDespuesDe(upd: string): Promise<string | null> {
  const siguiente = nextUpd(upd);
  if (!siguiente) return null;
  return siguienteUpdLibre(toNumeric(siguiente));
}

export async function getNextUpdByCaja(req: Request, res: Response): Promise<void> {
  const cajaModulo = String(req.params.cajaModulo ?? '');
  if (!cajaModulo) {
    res.status(400).json({ error: 'El parámetro cajaModulo es requerido' });
    return;
  }

  const user = req.session.user;

  // Técnico: su consecutivo propio en esta caja.
  //   1) Con historial (ultimo_upd) -> el siguiente del suyo.
  //   2) Sin historial pero con upd_inicio -> ese mismo, que es el primero a usar.
  //   3) Sin ninguno -> requiere_inicio: la interfaz le pide el número de arranque.
  // NO cae al fallback genérico/cliente para evitar conflictos entre técnicos.
  if (user?.rol === 'TECNICA') {
    const caja = await queryOne<{ id: number | null }>('SELECT id FROM modulos_caja WHERE caja_modulo = ?', [cajaModulo]);
    if (caja?.id) {
      const asignacion = await queryOne<{ upd_inicio: string | null; ultimo_upd: string | null }>(
        'SELECT upd_inicio, ultimo_upd FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id = ?',
        [caja.id, user.id],
      );

      const ultimoUsado = await queryOne<{ upd: string | null }>(
        `SELECT upd FROM fuiddatosreal
         WHERE caja = ? AND upd IS NOT NULL AND upd <> ''
         ORDER BY CAST(SUBSTRING(upd FROM 4) AS INTEGER) DESC
         LIMIT 1`,
        [cajaModulo],
      );

      const base = ultimoUsado?.upd ?? asignacion?.ultimo_upd ?? null;
      if (base) {
        const siguiente = await siguienteUpdDespuesDe(base);
        if (siguiente) {
          res.json({ upd: siguiente, requiere_inicio: false });
          return;
        }
        // Se llegó a UPD9999999: no hay siguiente de 7 dígitos, el técnico fija un nuevo arranque.
        res.json({ upd: null, requiere_inicio: true, limite_alcanzado: true, message: UPD_LIMITE_MENSAJE });
        return;
      }
      if (asignacion?.upd_inicio) {
        // El arranque se validó como libre al fijarlo; si entre tanto alguien lo usó,
        // se ofrece el primer libre a partir de él.
        const inicio = normalizeUpd(asignacion.upd_inicio);
        const libre = isUpdValid(inicio) ? await siguienteUpdLibre(toNumeric(inicio)) : null;
        if (libre) {
          res.json({ upd: libre, requiere_inicio: false });
          return;
        }
        res.json({ upd: null, requiere_inicio: true, limite_alcanzado: true, message: UPD_LIMITE_MENSAJE });
        return;
      }
    }
    res.json({ upd: null, requiere_inicio: true });
    return;
  }

  // Fallback genérico (sin técnico o técnica sin rango): último UPD usado en la caja
  // (orden numérico por el sufijo de 7 dígitos) + 1.
  const last = await queryOne<{ upd: string | null }>(
    `SELECT upd FROM fuiddatosreal
     WHERE caja = ? AND upd IS NOT NULL AND upd <> ''
     ORDER BY CAST(SUBSTRING(upd FROM 4) AS INTEGER) DESC
     LIMIT 1`,
    [cajaModulo],
  );
  if (last?.upd) {
    const siguiente = await siguienteUpdDespuesDe(last.upd);
    res.json(siguiente ? { upd: siguiente } : { upd: null, limite_alcanzado: true, message: UPD_LIMITE_MENSAJE });
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
    // Se ofrece el primer UPD libre desde el sugerido del cliente, nunca uno ya usado.
    const sugerido = normalizeUpd(cliente?.upd_siguiente);
    upd = isUpdValid(sugerido) ? await siguienteUpdLibre(toNumeric(sugerido)) : null;
  }
  res.json({ upd });
}

/**
 * El técnico fija el UPD con el que arranca la caja. Recibe SOLO el número: el
 * prefijo 'UPD' lo pone el servidor, de modo que la interfaz nunca pide siglas.
 */
export async function setUpdInicioTecnica(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (user?.rol !== 'TECNICA') {
    res.status(403).json({ error: 'Solo el rol TECNICA puede fijar su UPD de inicio' });
    return;
  }

  const cajaModulo = String(req.params.cajaModulo ?? '');
  const numeroBruto = String((req.body as { numero?: unknown }).numero ?? '').trim();

  if (!/^\d{1,7}$/.test(numeroBruto)) {
    res.status(400).json({ error: 'El número de UPD debe tener entre 1 y 7 dígitos', code: 'UPD_NUMERO_INVALIDO' });
    return;
  }

  const upd = formatUpd(Number(numeroBruto));

  const caja = await queryOne<{ id: number }>('SELECT id FROM modulos_caja WHERE caja_modulo = ?', [cajaModulo]);
  if (!caja) {
    res.status(404).json({ error: 'La caja no existe' });
    return;
  }

  const asignacion = await queryOne<{ id: number; ultimo_upd: string | null }>(
    'SELECT id, ultimo_upd FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id = ?',
    [caja.id, user.id],
  );
  if (!asignacion) {
    res.status(403).json({ error: 'No tiene asignada esta caja' });
    return;
  }

  // fuiddatosreal.upd es UNIQUE: avisar antes de que el técnico digite todo el
  // formulario y choque contra el 409 al guardar.
  const enUso = await queryOne<{ id: number }>('SELECT id FROM fuiddatosreal WHERE upd = ? LIMIT 1', [upd]);
  if (enUso) {
    res.status(409).json({ error: `El ${upd} ya está usado por otro registro`, code: 'UPD_YA_USADO' });
    return;
  }

  await query('UPDATE asignacion_caja_tecnica SET upd_inicio = ?, ultimo_upd = NULL WHERE id = ?', [
    upd,
    asignacion.id,
  ]);

  res.json({ upd, message: `La caja arranca en ${upd}` });
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

  const acta = await sedeDeActa(id_modulo_caja);
  if (!acta.existe) {
    res.status(404).json({ message: 'El acta indicada no existe' });
    return;
  }
  if (fueraDeSuSede(req.session.user, acta.sede)) {
    res.status(403).json({ message: 'Solo puede crear cajas en actas de clientes de su sede' });
    return;
  }

  // El número de caja identifica la caja en toda la base (los FUID la referencian
  // por ese código), así que no puede repetirse ni siquiera en otra acta.
  const yaExiste = await queryOne<{ id: number }>(
    'SELECT id FROM modulos_caja WHERE caja_modulo = ? LIMIT 1',
    [caja_modulo],
  );
  if (yaExiste) {
    res.status(409).json({ message: `Ya existe una caja con el número ${caja_modulo}` });
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

/** Crea una serie de cajas desde numero_inicial hasta numero_final (6 dígitos cada uno).
 *  El prefijo se toma del módulo cliente (código + "C"). */
export async function createCajasSerie(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    id_modulo_caja: number;
    numero_inicial: string;
    numero_final: string;
    entidad_remitente_caja: string;
    acta_trans_caja: string;
    fecha_trans_caja: string | null;
    entidad_productora_caja: string;
    unidad_administrativa_caja: string;
    oficina_productora_caja: string;
    objeto_caja: string;
    estado_caja: string;
    /** Usuarios que quedan asignados a todas las cajas de la serie (opcional). */
    usuarios_tecnica?: number[];
  };

  const {
    id_modulo_caja,
    numero_inicial,
    numero_final,
    entidad_remitente_caja,
    acta_trans_caja,
    fecha_trans_caja,
    entidad_productora_caja,
    unidad_administrativa_caja,
    oficina_productora_caja,
    objeto_caja,
    estado_caja,
    usuarios_tecnica,
  } = body;

  // El cuerpo ya viene validado por `createSerieCajasSchema`: los campos
  // obligatorios están, los descriptivos en blanco llegan como `N/A` y los dos
  // números tienen seis dígitos. Aquí solo queda lo que depende de comparar el
  // rango consigo mismo.
  const ini = parseInt(numero_inicial, 10);
  const fin = parseInt(numero_final, 10);
  if (ini > fin) {
    res.status(400).json({ message: 'El número inicial no puede ser mayor que el final' });
    return;
  }
  if (fin - ini > 500) {
    res.status(400).json({ message: 'El rango no puede exceder 500 cajas por operación' });
    return;
  }

  const actaDestino = await sedeDeActa(id_modulo_caja);
  if (!actaDestino.existe) {
    res.status(404).json({ message: 'Módulo cliente no encontrado' });
    return;
  }
  if (fueraDeSuSede(req.session.user, actaDestino.sede)) {
    res.status(403).json({ message: 'Solo puede crear cajas en actas de clientes de su sede' });
    return;
  }

  // Usuarios a asignar (se validan antes de crear nada para no dejar cajas a medias)
  const tecnica = await validarUsuariosDeRol(usuarios_tecnica ?? [], 'TECNICA');
  if (tecnica.error) {
    res.status(400).json({ message: tecnica.error });
    return;
  }

  // Obtener código del módulo cliente para el prefijo
  const modulo = await queryOne<{ codigo: string }>(
    'SELECT codigo FROM moduloscliente WHERE id = ?',
    [id_modulo_caja],
  );
  if (!modulo) {
    res.status(404).json({ message: 'Módulo cliente no encontrado' });
    return;
  }
  const prefijo = `${modulo.codigo.padStart(3, '0')}C`;

  // Verificar que ningún número del rango exista ya, en esta o en otra acta: el
  // número de caja identifica la caja en toda la base (los FUID la referencian
  // por ese código), así que no puede repetirse.
  const existing = await query<{ caja_modulo: string; id_modulo_caja: number }>(
    `SELECT caja_modulo, id_modulo_caja FROM modulos_caja
     WHERE caja_modulo LIKE CAST(? AS text) || '%'
       AND CAST(SUBSTRING(caja_modulo FROM LENGTH(CAST(? AS text)) + 1) AS INTEGER) BETWEEN ? AND ?`,
    [prefijo, prefijo, ini, fin],
  );
  if (existing.length > 0) {
    const existentes = existing.map((e) => e.caja_modulo).join(', ');
    const enOtraActa = existing.some((e) => Number(e.id_modulo_caja) !== Number(id_modulo_caja));
    res.status(409).json({
      message: enOtraActa
        ? `Ya existen cajas con esos números en otra acta del cliente: ${existentes}. Use el siguiente número disponible.`
        : `Ya existen cajas en ese rango: ${existentes}`,
    });
    return;
  }

  // Insertar en lote
  const values = [];
  for (let n = ini; n <= fin; n++) {
    const cajaModulo = `${prefijo}${String(n).padStart(6, '0')}`;
    values.push([
      cajaModulo,
      entidad_remitente_caja,
      acta_trans_caja,
      fecha_trans_caja,
      id_modulo_caja,
      entidad_productora_caja,
      unidad_administrativa_caja,
      oficina_productora_caja,
      objeto_caja,
      estado_caja,
    ]);
  }

  await query(
    `INSERT INTO modulos_caja (
      caja_modulo, entidad_remitente_caja, acta_trans_caja,
      fecha_trans_caja, id_modulo_caja, entidad_productora_caja,
      unidad_administrativa_caja, oficina_productora_caja, objeto_caja, estado_caja
    ) VALUES ?`,
    [values],
  );

  // Asignar los usuarios indicados a todas las cajas recién creadas
  if (tecnica.ids.length > 0) {
    const creadas = await query<{ id: number }>(
      `SELECT id FROM modulos_caja
       WHERE id_modulo_caja = ? AND CAST(SUBSTRING(caja_modulo FROM 5) AS INTEGER) BETWEEN ? AND ?`,
      [id_modulo_caja, ini, fin],
    );
    const cajaIds = creadas.map((c) => c.id);
    await asignarUsuariosACajas(cajaIds, tecnica.ids);
  }

  const resumenAsignacion =
    tecnica.ids.length > 0 ? ` y se asignaron ${tecnica.ids.length} técnico(s)` : '';

  res.status(201).json({
    message: `Se crearon ${values.length} cajas correctamente (${prefijo}${String(ini).padStart(6, '0')} a ${prefijo}${String(fin).padStart(6, '0')})${resumenAsignacion}`,
    cantidad: values.length,
    asignados: { tecnica: tecnica.ids.length },
    primer_caja: `${prefijo}${String(ini).padStart(6, '0')}`,
    ultima_caja: `${prefijo}${String(fin).padStart(6, '0')}`,
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

  const cajaActual = await sedeDeCaja(id);
  if (!cajaActual.existe) {
    res.status(404).json({ message: 'La caja no existe' });
    return;
  }
  if (fueraDeSuSede(req.session.user, cajaActual.sede)) {
    res.status(403).json({ message: 'Solo puede editar cajas de clientes de su sede' });
    return;
  }

  // El número de caja no puede coincidir con el de otra caja de la base.
  const repetida = await queryOne<{ id: number }>(
    'SELECT id FROM modulos_caja WHERE caja_modulo = ? AND id <> ? LIMIT 1',
    [caja_modulo, id],
  );
  if (repetida) {
    res.status(409).json({ message: `Ya existe otra caja con el número ${caja_modulo}` });
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
  const user = req.session.user;

  const caja = await queryOne<{ id: number; caja_modulo: string; sede: string | null }>(
    `SELECT mc.id, mc.caja_modulo, sm.sede_submodulos AS sede
     FROM modulos_caja mc
     LEFT JOIN moduloscliente m ON m.id = mc.id_modulo_caja
     LEFT JOIN sub_modulos sm ON sm.id = m.id_submodulo
     WHERE mc.id = ?`,
    [id],
  );
  if (!caja) {
    res.status(404).json({ message: 'La caja no existe o ya fue eliminada' });
    return;
  }
  // Un líder solo administra las cajas de los clientes de su sede.
  if (user?.rol === 'LIDER' && caja.sede && caja.sede !== user.sede) {
    res.status(403).json({ message: 'Solo puede eliminar cajas de clientes de su sede' });
    return;
  }

  // Borrado jerárquico en una sola transacción: primero los registros FUID (UPD)
  // de la caja, luego sus asignaciones de técnica y por último la caja.
  // Si existe otra caja con el mismo número (duplicado pendiente de limpiar), los
  // FUID se conservan porque también pertenecen a esa otra caja.
  const [otras] = await query<{ total: number }>(
    'SELECT COUNT(*) AS total FROM modulos_caja WHERE caja_modulo = ? AND id <> ?',
    [caja.caja_modulo, id],
  );
  const numeroCompartido = (otras?.total ?? 0) > 0;

  const conn = await getConnection();
  let fuidsEliminados = 0;
  try {
    await conn.beginTransaction();
    if (!numeroCompartido) {
      // El trigger after_delete_fuiddatosreal deja copia de cada registro en historial.
      const [resultadoFuid] = await conn.query<mysql.ResultSetHeader>(
        'DELETE FROM fuiddatosreal WHERE caja = ?',
        [caja.caja_modulo],
      );
      fuidsEliminados = resultadoFuid.affectedRows;
    }
    await conn.query('DELETE FROM asignacion_caja_tecnica WHERE modulo_id = ?', [id]);
    await conn.query('DELETE FROM modulos_caja WHERE id = ?', [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  void audit({
    entidad: 'modulos_caja',
    entidadId: id,
    accion: 'ELIMINAR',
    detalle: `Caja ${caja.caja_modulo} (${fuidsEliminados} registro(s) FUID eliminados)`,
    usuario: user,
  });
  res.json({
    message: numeroCompartido
      ? `Caja ${caja.caja_modulo} eliminada. Sus registros FUID se conservan porque existe otra caja con el mismo número.`
      : `Caja ${caja.caja_modulo} eliminada junto con ${fuidsEliminados} registro(s) FUID`,
    fuids_eliminados: fuidsEliminados,
  });
}

export async function changeEstadoCaja(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { estado_caja } = req.body as { estado_caja: string };

  if (!estado_caja) {
    res.status(400).json({ message: 'El campo estado_caja es requerido' });
    return;
  }

  const user = req.session.user;
  if (!user || !(await tieneCajaAsignada(user, id))) {
    res.status(403).json({ message: 'Solo puede cambiar el estado de las cajas que tiene asignadas' });
    return;
  }

  /*
   * El estado normalmente se deduce de la digitación; esto es la corrección a
   * mano para los casos que la deducción no cubre. Al finalizar, la jornada y la
   * persona salen del último registro de la caja, no de quien pulsa ni del día
   * en que pulsa, para que el seguimiento atribuya la caja al día en que se
   * trabajó de verdad.
   */
  await cambiarEstadoCaja(query, id, estado_caja);
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

/** Estadísticas del técnico logueado: cajas asignadas, FUIDs creados, último UPD, etc. */
export async function getTecnicaStats(req: Request, res: Response): Promise<void> {
  const user = req.session.user;
  if (!user || user.rol !== 'TECNICA') {
    res.status(403).json({ error: 'Solo para técnicos' });
    return;
  }

  // Cajas asignadas al técnico
  const cajasAsignadas = await query<{
    id: number;
    caja_modulo: string;
    estado_caja: string | null;
    fecha_finalizacion: string | null;
  }>(
    `SELECT mc.id, mc.caja_modulo, mc.estado_caja, mc.fecha_finalizacion
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
      // Con el estado y el acta a la que pertenece, el panel puede ofrecer
      // "continuar" la caja abierta sin pasar por clientes, actas y cajas.
      estado_caja: c.estado_caja,
      fecha_finalizacion: c.fecha_finalizacion,
      fuid_creados: updPorCaja[c.caja_modulo]?.count ?? 0,
      ultimo_upd_caja: updPorCaja[c.caja_modulo]?.ultimo_upd ?? null,
      rango_inicio: rangosMap[c.id]?.inicio ?? null,
      rango_ultimo: rangosMap[c.id]?.ultimo ?? null,
    })),
  });
}
