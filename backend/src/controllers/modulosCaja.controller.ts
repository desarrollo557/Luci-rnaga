import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { getConnection, query, queryOne, queryResult, withTransaction } from '../config/db.js';
import type { ModuloCaja } from '../types/db.js';
import { formatUpd, isUpdValid, nextUpd, normalizeUpd, toNumeric, UPD_MAX } from '../utils/updFormat.js';
import { asignarUsuariosACajas, validarUsuariosDeRol } from './asignacionesCaja.controller.js';
import { audit } from '../services/audit.service.js';
import { fueraDeSuSede, sedeDeActa, sedeDeCaja, tieneCajaAsignada } from '../services/jerarquia.service.js';
import { CAJA_EN_PROCESO, cambiarEstadoCaja } from '../services/cicloCaja.service.js';
import { fechaHoyLocal } from '../utils/format.js';
import { tieneAlgunRol } from '../utils/roles.js';

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
       WHERE mc.id_modulo_caja = ?
       ORDER BY substring(mc.caja_modulo from 'C([0-9]{6})$')::int ASC`;
  } else if (user.rol === 'TECNICA') {
    sql = `SELECT mc.*, (SELECT COUNT(*) FROM fuiddatosreal f WHERE f.caja = mc.caja_modulo) AS total_fuids
      FROM modulos_caja mc
      JOIN asignacion_caja_tecnica act ON mc.id = act.modulo_id
      WHERE act.usuario_id = ? AND mc.id_modulo_caja = ?
      ORDER BY substring(mc.caja_modulo from 'C([0-9]{6})$')::int ASC`;
    params.unshift(user.id);
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

/** Un día de trabajo sobre una caja, por persona. */
export interface JornadaDeCaja {
  /** Día al que la persona atribuyó el trabajo, que es como lo cuenta el seguimiento. */
  fecha: string | null;
  colaborador: string | null;
  registros: number;
  upd_desde: string | null;
  upd_hasta: string | null;
  /** Primer y último guardado de ese día, por reloj. */
  primera: string | null;
  ultima: string | null;
  /** Lo que la persona declaró al dejar la caja, o `null` si no declaró nada. */
  resultado: 'TERMINADA' | 'CONTINUA' | null;
  /** Cuántos registros llevaba en el momento de declarar. */
  registros_declarados: number | null;
}

/**
 * El historial de digitación de una caja, día por día y persona por persona.
 *
 * Nace de algo que contó un auxiliar: dejó una caja a medias una tarde, la
 * retomó al día siguiente, y en la pantalla de la caja solo quedaba una fecha
 * —"Actualizada"— que se había movido al día nuevo. El trabajo de la víspera
 * seguía guardado, registro por registro, pero no había dónde verlo, y desde
 * fuera parecía que la caja se había empezado hoy.
 *
 * **Se calcula a partir de los registros, no se guarda aparte.** Podría
 * llevarse un contador por caja y día que se fuera sumando al digitar, pero
 * entonces habría dos versiones de la verdad que pueden separarse —un registro
 * borrado, uno corregido de fecha— y, sobre todo, el histórico anterior a esa
 * cuenta nacería en cero. Los registros ya tienen quién, cuándo y con qué UPD;
 * el historial es una lectura de eso, y por eso vale igual para lo digitado
 * hace un año que para lo de esta mañana.
 *
 * Se agrupa por `fecha_del_dato` y no por `created_at` porque esa es la fecha
 * con la que el seguimiento de inventario cuenta la producción: si aquí se
 * agrupara por el reloj, las dos pantallas dirían cosas distintas del mismo
 * día. Las horas sí salen del reloj, que es lo que no se puede escribir a mano.
 *
 * Los registros sin fecha —los que vienen de la base antigua— salen agrupados
 * al final en lugar de quedarse fuera: que no se sepa de qué día son no es
 * motivo para que desaparezcan de la cuenta.
 *
 * Lo único que no se calcula es `resultado`: si la persona dio la caja por
 * terminada ese día o la dejó para continuarla. Eso no está en los registros
 * porque no se puede deducir de ellos, así que se trae de `jornada_caja`, que
 * es donde queda lo que se declaró.
 */
export async function listJornadasDeCaja(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const jornadas = await query<JornadaDeCaja>(
    `WITH caja AS (SELECT caja_modulo FROM modulos_caja WHERE id = ?)
     SELECT f.fecha_del_dato AS fecha,
            f.elaborado_por  AS colaborador,
            COUNT(*)         AS registros,
            -- Los UPD tienen todos el mismo ancho ("UPD" + 7 cifras), así que el
            -- menor y el mayor por texto son también el menor y el mayor por
            -- número. Se descartan los que no siguen el formato para que un
            -- valor suelto no ensanche el rango de toda la jornada.
            MIN(f.upd) FILTER (WHERE f.upd ~ '^UPD[0-9]{7}$') AS upd_desde,
            MAX(f.upd) FILTER (WHERE f.upd ~ '^UPD[0-9]{7}$') AS upd_hasta,
            MIN(f.created_at) AS primera,
            MAX(f.created_at) AS ultima,
            MAX(j.resultado)  AS resultado,
            MAX(j.registros)  AS registros_declarados
       FROM fuiddatosreal f
       JOIN caja c ON f.caja = c.caja_modulo
       LEFT JOIN jornada_caja j
              ON j.caja_modulo = f.caja
             AND j.fecha = f.fecha_del_dato
             AND j.colaborador = f.elaborado_por
      GROUP BY f.fecha_del_dato, f.elaborado_por
      ORDER BY f.fecha_del_dato ASC NULLS LAST, MIN(f.created_at) ASC NULLS FIRST`,
    [id],
  );
  res.json(jornadas);
}

/**
 * Lo que quien digita puede declarar al dejar una caja: que la terminó.
 *
 * Existió también "CONTINUA" —"la continúo otro día"— y se retiró: como
 * ninguna caja se cierra sola, no hace falta declarar que se sigue; continuarla
 * es seguir digitando. Las filas antiguas con ese valor se conservan en
 * `jornada_caja` como historia; declararlo hoy se rechaza.
 */
export const JORNADA_TERMINADA = 'TERMINADA';

/**
 * Cierre de jornada: "esta caja la terminé".
 *
 * Es la única forma en que una caja se cierra: ninguna se cierra sola, ni al
 * pasar a otra caja ni al cambiar de jornada. Quien no declara nada deja la
 * caja abierta y la continúa cuando quiera sin pedir nada. Declararlo la
 * cierra en el momento, atribuida al día de su último registro, y deja la
 * jornada anotada con la cifra que la persona vio al cerrar.
 *
 * Por eso esta declaración se guarda aparte y no se calcula: es el único dato
 * de la jornada que solo tiene la persona. Se guarda también cuántos registros
 * llevaba ese día en el momento de declarar. Es redundante con los registros
 * —se puede volver a contar— y aun así se guarda: es la cifra que la persona
 * vio y dio por buena al cerrar, y si más tarde alguien corrige o borra un
 * registro, la cuenta viva cambia pero lo que se declaró aquel día no.
 *
 * Declarar dos veces el mismo día no duplica nada: se actualiza la cifra. Y
 * una vez terminada, si hace falta volver a ella, la técnica la reabre desde
 * la caja (`changeEstadoCaja`); al reabrirla vuelve a indicar el UPD con el
 * que continúa.
 */
export async function declararJornadaDeCaja(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { resultado } = req.body as { resultado?: string };

  if (resultado !== JORNADA_TERMINADA) {
    res.status(400).json({
      message: `El campo resultado debe ser ${JORNADA_TERMINADA}`,
    });
    return;
  }

  const user = req.session.user;
  if (!user) {
    res.status(403).json({ message: 'Acceso denegado' });
    return;
  }
  // El líder cierra cualquier caja; la técnica, solo las suyas.
  if (user.rol === 'TECNICA' && !(await tieneCajaAsignada(user, id))) {
    res.status(403).json({ message: 'Solo puede cerrar la jornada de las cajas que tiene asignadas' });
    return;
  }

  const caja = await queryOne<{ caja_modulo: string }>(
    'SELECT caja_modulo FROM modulos_caja WHERE id = ?',
    [id],
  );
  if (!caja) {
    res.status(404).json({ message: 'Módulo de caja no encontrado' });
    return;
  }

  /*
   * El mismo texto con el que se firma cada registro (`elaborado_por`). Tiene
   * que coincidir carácter a carácter: es la única forma de cruzar la jornada
   * declarada con los registros que la componen, y con lo que agrupa el
   * seguimiento de inventario.
   */
  const colaborador = `${user.nombre.toUpperCase()} (${user.cc})`;
  const hoy = fechaHoyLocal();

  await withTransaction(async (conn) => {
    const [conteo] = await conn.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM fuiddatosreal
        WHERE caja = ? AND elaborado_por = ? AND fecha_del_dato = ?`,
      [caja.caja_modulo, colaborador, hoy],
    );

    await conn.queryResult(
      `INSERT INTO jornada_caja (caja_modulo, fecha, colaborador, resultado, usuario_id, registros)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (caja_modulo, fecha, colaborador)
       DO UPDATE SET resultado = EXCLUDED.resultado,
                     registros = EXCLUDED.registros,
                     declarada_en = now()`,
      [caja.caja_modulo, hoy, colaborador, resultado, user.id, Number(conteo?.n ?? 0)],
    );

    /*
     * Y la caja se cierra, atribuida a la jornada de su último registro.
     */
    await cambiarEstadoCaja(
      async (sql, params) => (await conn.queryResult(sql, params)).affectedRows,
      id,
      'FINALIZADO',
    );
  });

  void audit({
    entidad: 'modulos_caja',
    entidadId: id,
    // El mismo tipo de evento para los dos: lo que cambia es lo que se declaró,
    // y eso va en el detalle, que es lo que se lee en el historial.
    accion: 'CAMBIAR_ESTADO',
    detalle: `Caja ${caja.caja_modulo} dada por terminada por quien la digitó`,
    usuario: user,
  });

  res.json({
    message: 'Caja dada por terminada',
    fecha: hoy,
    resultado,
  });
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
  //      Pasa la primera vez en la caja y cada vez que la caja se reabre: al
  //      reabrirla se borra el arranque para que indique con qué UPD continúa
  //      (`SQL_REINICIAR_ARRANQUE_UPD`).
  // NO cae al fallback genérico/cliente para evitar conflictos entre técnicos.
  if (user?.rol === 'TECNICA') {
    const caja = await queryOne<{ id: number | null }>('SELECT id FROM modulos_caja WHERE caja_modulo = ?', [cajaModulo]);
    const asignacion = caja?.id
      ? await queryOne<{ upd_inicio: string | null; ultimo_upd: string | null }>(
          'SELECT upd_inicio, ultimo_upd FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id = ?',
          [caja.id, user.id],
        )
      : undefined;

    if (asignacion?.ultimo_upd) {
      const siguiente = await siguienteUpdDespuesDe(asignacion.ultimo_upd);
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
    // Sin arranque. Si ya había digitado en esta caja es que se reabrió, y se
    // le dice para que sepa por qué se lo vuelven a pedir.
    const yaDigito = await queryOne<{ n: number | string }>(
      'SELECT COUNT(*) AS n FROM fuiddatosreal WHERE caja = ? AND elaborado_por = ?',
      [cajaModulo, `${user.nombre.toUpperCase()} (${user.cc})`],
    );
    res.json({
      upd: null,
      requiere_inicio: true,
      message:
        Number(yaDigito?.n ?? 0) > 0
          ? 'La caja se reabrió: indica el número del UPD con el que continúas.'
          : undefined,
    });
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

  /*
   * Queda constancia de cuántas cajas se crearon y con qué rango.
   *
   * No estaba, y se notó: al aparecer cajas de dos en dos no había forma de
   * saber desde el registro si alguien había pedido dos o si el sistema había
   * creado una de más. Solo se auditaba el borrado, que es la mitad de la
   * historia.
   */
  void audit({
    entidad: 'modulos_caja',
    entidadId: id_modulo_caja,
    accion: 'CREAR',
    detalle:
      values.length === 1
        ? `Caja ${prefijo}${String(ini).padStart(6, '0')}`
        : `Serie de ${values.length} cajas, de ${prefijo}${String(ini).padStart(6, '0')} a ${prefijo}${String(fin).padStart(6, '0')}`,
    usuario: req.session.user,
  });

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
  if (!user) {
    res.status(403).json({ message: 'Acceso denegado' });
    return;
  }
  if (estado_caja !== 'EN PROCESO' && estado_caja !== 'FINALIZADO') {
    res.status(400).json({ message: 'El estado debe ser EN PROCESO o FINALIZADO' });
    return;
  }

  const caja = await queryOne<{ caja_modulo: string }>(
    'SELECT caja_modulo FROM modulos_caja WHERE id = ?',
    [id],
  );
  if (!caja) {
    res.status(404).json({ message: 'Módulo de caja no encontrado' });
    return;
  }

  /*
   * La técnica cambia el estado de sus cajas en los dos sentidos: las termina
   * y las reabre sin pedir permiso a nadie. El líder cambia las de su sede y
   * el administrador cualquiera.
   */
  const gestiona = tieneAlgunRol(user, ['LIDER', 'ADMIN']);
  if (gestiona) {
    const ubicacion = await sedeDeCaja(id);
    if (fueraDeSuSede(user, ubicacion.sede)) {
      res.status(403).json({ message: 'Solo puede cambiar el estado de las cajas de su sede' });
      return;
    }
  } else if (!(await tieneCajaAsignada(user, id))) {
    res.status(403).json({ message: 'Solo puede cambiar el estado de las cajas que tiene asignadas' });
    return;
  }

  /*
   * Terminar la caja la cierra atribuida a la jornada de su último registro,
   * no a quien pulsa ni al día en que pulsa, y deja ese cierre anotado en
   * `jornada_caja` para que el seguimiento lo cuente ese día.
   *
   * Reabrirla la deja en proceso y borra el arranque de UPD de las técnicas
   * asignadas, para que al volver a digitar indiquen con qué UPD continúan.
   * Si quien reabre es el líder o el administrador, la reapertura queda además
   * firmada y la técnica puede corregir sus registros de días anteriores
   * mientras siga abierta; la reapertura de la propia técnica no firma nada.
   */
  const reapertura =
    gestiona && estado_caja === CAJA_EN_PROCESO
      ? { por: `${user.nombre.toUpperCase()} (${user.cc})`, el: fechaHoyLocal() }
      : undefined;
  await cambiarEstadoCaja(
    async (sql, params) => (await queryResult(sql, params)).affectedRows,
    id,
    estado_caja,
    reapertura,
  );

  void audit({
    entidad: 'modulos_caja',
    entidadId: id,
    accion: 'CAMBIAR_ESTADO',
    detalle: reapertura
      ? `Caja ${caja.caja_modulo} reabierta por el líder para corregir registros`
      : `Caja ${caja.caja_modulo}: estado cambiado a ${estado_caja} a mano`,
    usuario: user,
  });

  res.json({
    message: reapertura
      ? 'Caja reabierta: la técnica puede corregir sus registros mientras siga abierta'
      : estado_caja === CAJA_EN_PROCESO
        ? 'Caja reabierta: indica el UPD con el que continúas'
        : `Estado cambiado a ${estado_caja} correctamente`,
  });
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

  /*
   * Cajas asignadas al técnico, con de quién son y de qué acta salen.
   *
   * Una caja suelta no dice nada: "051C000516" no deja saber a qué cliente hay
   * que entregarla ni con qué acta entró, y esas son las dos preguntas que se
   * hacen al mirar el panel. El acta cuelga del cliente y la caja del acta, así
   * que las dos salen del mismo camino de tablas y no cuestan una consulta
   * aparte.
   *
   * Los JOIN son LEFT porque una caja heredada puede no tener acta relacionada,
   * y esa caja también está asignada y también hay que verla.
   */
  const cajasAsignadas = await query<{
    id: number;
    caja_modulo: string;
    estado_caja: string | null;
    fecha_finalizacion: string | null;
    codigo_cliente: string | null;
    entidad_cliente: string | null;
    acta: string | null;
  }>(
    `SELECT mc.id, mc.caja_modulo, mc.estado_caja, mc.fecha_finalizacion,
            mcl.codigo AS codigo_cliente,
            COALESCE(sm.entidad_remitente, mcl.entidad_remitente) AS entidad_cliente,
            mcl.acta_transferencia_modulo AS acta
     FROM modulos_caja mc
     JOIN asignacion_caja_tecnica act ON act.modulo_id = mc.id
     LEFT JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
     LEFT JOIN sub_modulos sm ON sm.id = mcl.id_submodulo
     WHERE act.usuario_id = ?
     ORDER BY mcl.codigo NULLS LAST, mcl.acta_transferencia_modulo, mc.caja_modulo`,
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

    // Lo suyo en sus cajas, de siempre: cuánto lleva y hasta qué UPD llegó. El
    // desglose por día va aparte, en `produccion_por_dia`.
    const fuidResult = await query<{ total: number; ultimo_upd: string | null }>(
      `SELECT COUNT(*) as total, MAX(upd) as ultimo_upd
       FROM fuiddatosreal
       WHERE caja IN (${placeholders}) AND elaborado_por = ?`,
      [...cajaModulos, autor],
    );
    fuidStats = fuidResult[0] || { total: 0, ultimo_upd: null };

    /*
     * Lo suyo caja por caja: cuántos registros lleva en cada una, cuántos de
     * hoy y hasta qué UPD llegó.
     *
     * Con esto el panel puede sumar por acta y por cliente sin pedir nada más:
     * cada caja ya sabe de qué acta y de qué cliente es.
     */
    const updRows = await query<{ caja: string; count: number; ultimo_upd: string | null }>(
      `SELECT caja, COUNT(*) as count, MAX(upd) as ultimo_upd
       FROM fuiddatosreal
       WHERE caja IN (${placeholders}) AND elaborado_por = ?
       GROUP BY caja`,
      [...cajaModulos, autor],
    );
    updPorCaja = Object.fromEntries(
      updRows.map((r) => [r.caja, { count: Number(r.count ?? 0), ultimo_upd: r.ultimo_upd }]),
    );
  }

  /*
   * Lo suyo día por día y caja por caja, para los últimos noventa días.
   *
   * Con esto el panel puede contestar "cuánto hice el martes" y, dentro de ese
   * día, en qué clientes, actas y cajas: la caja ya sabe de qué acta y de qué
   * cliente es, así que el desglose sale de aquí sin pedir nada más.
   *
   * Noventa días y no todo el histórico porque esto es el panel de trabajo, no
   * el informe de producción: se mira la semana, el mes, a lo sumo el trimestre.
   * El total de la persona no se toca, que va aparte y sí cuenta todo.
   */
  let produccionPorDia: Array<{ dia: string; caja: string; registros: number }> = [];
  if (cajaModulos.length > 0) {
    const autor = `${user.nombre} (${user.cc})`;
    const placeholders = cajaModulos.map(() => '?').join(',');
    const filas = await query<{ dia: string; caja: string; registros: number | string }>(
      `SELECT fecha_del_dato AS dia, caja, COUNT(*) AS registros
         FROM fuiddatosreal
        WHERE caja IN (${placeholders})
          AND elaborado_por = ?
          AND fecha_del_dato IS NOT NULL
          AND fecha_del_dato >= (CURRENT_DATE - INTERVAL '90 days')
        GROUP BY fecha_del_dato, caja
        ORDER BY fecha_del_dato DESC`,
      [...cajaModulos, autor],
    );
    produccionPorDia = filas.map((f) => ({
      dia: String(f.dia).slice(0, 10),
      caja: f.caja,
      registros: Number(f.registros ?? 0),
    }));
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
      fuid_creados: Number(fuidStats.total ?? 0),
      ultimo_upd_global: fuidStats.ultimo_upd,
    },
    produccion_por_dia: produccionPorDia,
    detalle_cajas: cajasAsignadas.map((c) => ({
      id: c.id,
      caja_modulo: c.caja_modulo,
      // De quién es la caja y con qué acta entró: es lo que permite reconocerla
      // en el panel sin abrirla.
      codigo_cliente: c.codigo_cliente,
      entidad_cliente: c.entidad_cliente,
      acta: c.acta,
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
