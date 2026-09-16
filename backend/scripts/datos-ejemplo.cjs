/**
 * Carga datos de ejemplo en la base para ver el software en funcionamiento.
 *
 *   node backend/scripts/datos-ejemplo.cjs            → inserta
 *   node backend/scripts/datos-ejemplo.cjs --borrar   → deja la base como estaba
 *
 * Todo lo que crea cuelga de los clientes con código 9xx, así que se identifica
 * y se retira sin tocar los datos de trabajo. Los registros se reparten entre
 * varios meses, personas y cajas a propósito: con todo en un mismo día las
 * gráficas de producción no tienen nada que dibujar y el historial no muestra
 * evolución.
 *
 * No se inventan cifras: se insertan registros y el software calcula sus
 * estadísticas a partir de ellos, igual que con los datos reales.
 */
require('dotenv').config();
const { Client } = require('pg');

const SEDE = 'BARRANQUILLA';

/** Clientes de ejemplo. El código 9xx los distingue de los reales. */
const CLIENTES = [
  { codigo: '901', entidad: 'ALCALDIA DE SOLEDAD' },
  { codigo: '902', entidad: 'HOSPITAL UNIVERSITARIO DEL ATLANTICO' },
  { codigo: '903', entidad: 'NOTARIA SEGUNDA DE BARRANQUILLA' },
];

/** Quienes digitan, con el formato "NOMBRE (CC)" que guarda `elaborado_por`. */
const PERSONAS = [
  { nombre: 'DEV TECNICO (987654321)', sede: SEDE },
  { nombre: 'DEV LIDER (123456789)', sede: SEDE },
  { nombre: 'SALLY PINEDA (1046812542)', sede: SEDE },
];

/** Series y subseries de una tabla de retención documental corriente. */
const SERIES = [
  ['HISTORIAS LABORALES', 'HOJAS DE VIDA'],
  ['CONTRATOS', 'CONTRATOS DE PRESTACION DE SERVICIOS'],
  ['ACTAS', 'ACTAS DE COMITE'],
  ['RESOLUCIONES', 'RESOLUCIONES DE NOMBRAMIENTO'],
  ['TUTELAS', 'RESPUESTAS A TUTELAS'],
  ['HISTORIAS CLINICAS', 'EPICRISIS'],
];

const ASUNTOS = [
  ['CONTRATO', 'PRESTACION DE SERVICIOS PROFESIONALES'],
  ['TUTELA', 'RESPUESTA A LA ACCION DE TUTELA'],
  ['ACTA', 'COMITE DE ARCHIVO'],
  ['RESOLUCION', 'NOMBRAMIENTO EN PERIODO DE PRUEBA'],
  ['HISTORIA LABORAL', 'DOCUMENTOS DE INGRESO'],
  ['CERTIFICADO', 'CERTIFICACION LABORAL'],
];

const UNIDADES = ['SECRETARIA GENERAL', 'TALENTO HUMANO', 'JURIDICA', 'FINANCIERA'];
const OFICINAS = ['ARCHIVO CENTRAL', 'GESTION DOCUMENTAL', 'CONTRATACION'];
const SOPORTES = ['N/A', 'CD', 'PLANOS'];
const FRECUENCIAS = ['N/A', 'ALTA', 'MEDIA', 'BAJA'];

/** Aleatorio con semilla fija: dos ejecuciones producen el mismo reparto. */
let semilla = 20260915;
function azar() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
}
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

/** Días hábiles hacia atrás desde hoy, para repartir la digitación. */
function diasDeTrabajo(cantidad) {
  const dias = [];
  const cursor = new Date();
  while (dias.length < cantidad) {
    cursor.setDate(cursor.getDate() - 1);
    const semana = cursor.getDay();
    if (semana !== 0 && semana !== 6) dias.push(cursor.toISOString().slice(0, 10));
  }
  return dias.reverse();
}

async function borrar(c) {
  const codigos = CLIENTES.map((x) => x.codigo);
  // El historial se limpia DESPUÉS de los registros: al borrar un FUID salta el
  // trigger que guarda su copia, así que hacerlo antes dejaba el historial lleno
  // de eliminaciones de los propios datos de ejemplo.
  const pasos = [
    ['registros FUID', `DELETE FROM fuiddatosreal WHERE caja LIKE ANY($1)`, [codigos.map((k) => `${k}C%`)]],
    ['historial de ejemplo', `DELETE FROM historial WHERE caja LIKE ANY($1)`, [codigos.map((k) => `${k}C%`)]],
    ['asignaciones técnica', `DELETE FROM asignacion_caja_tecnica WHERE modulo_id IN (SELECT id FROM modulos_caja WHERE caja_modulo LIKE ANY($1))`, [codigos.map((k) => `${k}C%`)]],
    ['asignaciones calidad', `DELETE FROM asignacion_caja_calidad WHERE modulo_id IN (SELECT id FROM modulos_caja WHERE caja_modulo LIKE ANY($1))`, [codigos.map((k) => `${k}C%`)]],
    ['cajas', `DELETE FROM modulos_caja WHERE caja_modulo LIKE ANY($1)`, [codigos.map((k) => `${k}C%`)]],
    ['actas', `DELETE FROM moduloscliente WHERE id_submodulo IN (SELECT id FROM sub_modulos WHERE codigo = ANY($1))`, [codigos]],
    ['inventarios', `DELETE FROM inventario WHERE "CODIGO_DEL_CLIENTE" = ANY($1)`, [codigos]],
    ['clientes', `DELETE FROM sub_modulos WHERE codigo = ANY($1)`, [codigos]],
  ];
  for (const [nombre, sql, params] of pasos) {
    const r = await c.query(sql, params);
    console.log(`  ${nombre}: ${r.rowCount}`);
  }
}

async function main() {
  const c = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT ?? 5432),
    database: process.env.PG_DATABASE ?? 'postgres',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await c.connect();

  if (process.argv.includes('--borrar')) {
    console.log('Retirando los datos de ejemplo:');
    await borrar(c);
    await c.end();
    return;
  }

  console.log('Cargando datos de ejemplo…');
  await borrar(c); // idempotente: se rehace desde cero

  const dias = diasDeTrabajo(75); // unos tres meses y medio de trabajo
  let totalFuid = 0;
  let totalCajas = 0;
  let upd = 4200000;

  for (const cliente of CLIENTES) {
    const { rows: [sub] } = await c.query(
      'INSERT INTO sub_modulos (codigo, entidad_remitente, sede_submodulos) VALUES ($1, $2, $3) RETURNING id',
      [cliente.codigo, cliente.entidad, SEDE],
    );

    // Dos actas por cliente: una transferencia antigua y otra reciente.
    for (let a = 1; a <= 2; a += 1) {
      const fechaActa = dias[a === 1 ? 2 : Math.floor(dias.length / 2)];
      const numeroActa = `${cliente.codigo}-${String(a).padStart(3, '0')}`;
      const { rows: [acta] } = await c.query(
        `INSERT INTO moduloscliente (codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo, id_submodulo)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [cliente.codigo, cliente.entidad, numeroActa, fechaActa, sub.id],
      );

      // Entre 2 y 3 cajas por acta, con su trabajo repartido entre personas.
      const cajasDelActa = 2 + Math.floor(azar() * 2);
      for (let k = 0; k < cajasDelActa; k += 1) {
        totalCajas += 1;
        const numero = String(totalCajas).padStart(6, '0');
        const cajaModulo = `${cliente.codigo}C${numero}`;
        const unidad = elegir(UNIDADES);
        const oficina = elegir(OFICINAS);
        const objeto = 'ORGANIZACION Y DESCRIPCION DOCUMENTAL';

        await c.query(
          `INSERT INTO modulos_caja (caja_modulo, entidad_remitente_caja, acta_trans_caja, fecha_trans_caja,
             id_modulo_caja, entidad_productora_caja, unidad_administrativa_caja, oficina_productora_caja,
             objeto_caja, estado_caja)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [cajaModulo, cliente.entidad, numeroActa, fechaActa, acta.id, cliente.entidad,
            unidad, oficina, objeto, azar() > 0.55 ? 'FINALIZADO' : 'EN PROCESO'],
        );

        // Cada caja la digita una persona, en dos o tres jornadas seguidas.
        const persona = elegir(PERSONAS);
        const jornadas = 2 + Math.floor(azar() * 2);
        const inicio = Math.floor(azar() * (dias.length - jornadas - 1));
        let orden = 1;

        for (let j = 0; j < jornadas; j += 1) {
          const dia = dias[inicio + j];
          const registrosDelDia = 4 + Math.floor(azar() * 9); // entre 4 y 12
          for (let r = 0; r < registrosDelDia; r += 1) {
            const [serie, subserie] = elegir(SERIES);
            const [asunto2, asunto3] = elegir(ASUNTOS);
            const folios = String(5 + Math.floor(azar() * 190));
            const desde = new Date(dia);
            desde.setFullYear(desde.getFullYear() - (1 + Math.floor(azar() * 6)));
            const hasta = new Date(desde);
            hasta.setMonth(hasta.getMonth() + Math.floor(azar() * 10));
            upd += 1;

            await c.query(
              `INSERT INTO fuiddatosreal (
                 fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora,
                 unidad_administrativa, oficina_productora, objeto, serie, subserie,
                 numero_de_orden_interno, accionado_procesado, accionado_denunciante, identificacion,
                 radicado, numero_doc, numero_doc_hasta, fecha_inicial, fecha_final, caja, upd,
                 tomo, otro, caja_interna, folios, soporte, frecuencia, elaborado_por,
                 nro_acta_transferible, fecha_transferencia, notas, sede, asunto_2, asunto_3,
                 historial_y_cambios, cambio_calidad, sede_calidad)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
                       $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)`,
              [
                dia, orden, 'N/A', cliente.entidad, cliente.entidad,
                unidad, oficina, objeto, serie, subserie,
                'N/A', 'N/A', 'N/A', 'N/A',
                `RAD-${dia.slice(0, 4)}-${String(1000 + Math.floor(azar() * 8999))}`,
                String(10000 + Math.floor(azar() * 89999)), 'N/A',
                desde.toISOString().slice(0, 10), hasta.toISOString().slice(0, 10),
                cajaModulo, `UPD${upd}`,
                String(1 + Math.floor(azar() * 3)), 'N/A', String(1 + Math.floor(azar() * 4)),
                folios, elegir(SOPORTES), elegir(FRECUENCIAS), persona.nombre,
                numeroActa, fechaActa, 'N/A', persona.sede, asunto2, asunto3,
                // Lo revisado por calidad: algo más de la mitad, como en un mes normal.
                azar() > 0.42 ? 'OK' : null,
                azar() > 0.42 ? 'DEV CALIDAD (12345)' : null,
                azar() > 0.42 ? SEDE : null,
              ],
            );
            orden += 1;
            totalFuid += 1;
          }
        }
      }
    }
  }

  // Unas cuantas correcciones posteriores, para que el historial tenga
  // movimientos reales: los graban los mismos triggers del software.
  const { rows: aCorregir } = await c.query(
    `SELECT id, folios FROM fuiddatosreal WHERE caja LIKE ANY($1) ORDER BY id DESC LIMIT 18`,
    [CLIENTES.map((k) => `${k.codigo}C%`)],
  );
  for (const fila of aCorregir) {
    await c.query(
      `UPDATE fuiddatosreal
       SET folios = $1, notas = $2, version = version + 1
       WHERE id = $3`,
      [String(Number(fila.folios ?? 0) + 2), 'SE CORRIGE EL NUMERO DE FOLIOS TRAS REVISION', fila.id],
    );
  }

  const { rows: [resumen] } = await c.query(
    `SELECT COUNT(*)::int AS fuid,
            COUNT(DISTINCT caja)::int AS cajas,
            MIN(fecha_del_dato)::text AS desde,
            MAX(fecha_del_dato)::text AS hasta
     FROM fuiddatosreal WHERE caja LIKE ANY($1)`,
    [CLIENTES.map((k) => `${k.codigo}C%`)],
  );
  const { rows: [hist] } = await c.query(
    `SELECT COUNT(*)::int AS n FROM historial WHERE caja LIKE ANY($1)`,
    [CLIENTES.map((k) => `${k.codigo}C%`)],
  );

  console.log(`  clientes: ${CLIENTES.length}`);
  console.log(`  cajas: ${resumen.cajas}`);
  console.log(`  registros FUID: ${resumen.fuid} (del ${resumen.desde} al ${resumen.hasta})`);
  console.log(`  movimientos en el historial: ${hist.n}`);
  await c.end();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
