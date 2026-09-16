/**
 * Matriz de permisos: cada endpoint contra cada perfil.
 *
 *   npx tsx scripts/pruebas/roles.ts            (contra http://localhost:3000)
 *   API=https://… npx tsx scripts/pruebas/roles.ts
 *
 * Comprueba, endpoint por endpoint, que ADMIN, LIDER, TECNICA y un
 * visitante sin sesión reciben exactamente el acceso que les corresponde. Lo
 * que se afirma no es el resultado de la operación, sino **quién puede
 * intentarla**: 401 sin sesión, 403 cuando el perfil no alcanza, y cualquier
 * otra cosa (200, 400, 404…) cuando sí alcanza, porque entonces la petición ya
 * llegó al controlador.
 *
 * Las pruebas unitarias cubren los guardias por separado
 * (`src/middlewares/__tests__/auth.test.ts`); esto comprueba que cada ruta
 * tiene puesto el guardia que le toca, que es un olvido fácil al añadir un
 * endpoint nuevo.
 *
 * Crea sus propios usuarios de los tres perfiles y los borra al terminar,
 * incluso si algo falla: no usa cuentas reales ni deja datos detrás.
 */
import bcrypt from 'bcryptjs';
import { query } from '../../src/config/db.js';

const API = process.env.API ?? 'http://localhost:3000';
const MARCA = 'PRUEBA-PERMISOS';
const CLAVE = 'prueba-permisos-2026';

type Rol = 'ADMIN' | 'LIDER' | 'TECNICA';
const ROLES: Rol[] = ['ADMIN', 'LIDER', 'TECNICA'];
/** Quién intenta: los tres perfiles y quien no ha iniciado sesión. */
type Sujeto = Rol | 'ANONIMO';
const SUJETOS: Sujeto[] = [...ROLES, 'ANONIMO'];

/** Cédulas de las cuentas de prueba, fuera de cualquier rango real. */
const CEDULA: Record<Rol, string> = {
  ADMIN: '990000001',
  LIDER: '990000002',
  TECNICA: '990000003',
};

interface Caso {
  /** Módulo al que pertenece, para agrupar el informe. */
  modulo: string;
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  ruta: string;
  /** Perfiles que deben poder intentarlo. El resto debe recibir 403. */
  permitidos: Rol[];
  /** Cuerpo para los métodos que lo llevan. */
  cuerpo?: Record<string, unknown>;
}

const TODOS: Rol[] = [...ROLES];
const GESTION: Rol[] = ['ADMIN', 'LIDER'];
const SOLO_ADMIN: Rol[] = ['ADMIN'];
const SOLO_TECNICA: Rol[] = ['TECNICA'];

/**
 * Los endpoints, con el acceso que declara su ruta.
 *
 * Se usan identificadores que no existen a propósito: lo que se mide es si la
 * petición pasa el guardia, no si encuentra el registro. Un 404 significa que
 * pasó.
 */
const CASOS: Caso[] = [
  // ── Usuarios: solo la administración ──────────────────────────────────
  { modulo: 'Usuarios', metodo: 'GET', ruta: '/users', permitidos: SOLO_ADMIN },
  { modulo: 'Usuarios', metodo: 'GET', ruta: '/users/999999', permitidos: SOLO_ADMIN },
  { modulo: 'Usuarios', metodo: 'POST', ruta: '/users', permitidos: SOLO_ADMIN, cuerpo: {} },
  { modulo: 'Usuarios', metodo: 'PUT', ruta: '/users/999999', permitidos: SOLO_ADMIN, cuerpo: {} },
  { modulo: 'Usuarios', metodo: 'DELETE', ruta: '/users/999999', permitidos: SOLO_ADMIN },
  { modulo: 'Usuarios', metodo: 'PATCH', ruta: '/users/999999/suspension', permitidos: SOLO_ADMIN },

  // ── Clientes ──────────────────────────────────────────────────────────
  { modulo: 'Clientes', metodo: 'GET', ruta: '/sub_modulos', permitidos: TODOS },
  { modulo: 'Clientes', metodo: 'POST', ruta: '/sub_modulos', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Clientes', metodo: 'PUT', ruta: '/sub_modulos/999999', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Clientes', metodo: 'DELETE', ruta: '/sub_modulos/999999', permitidos: GESTION },

  // ── Actas ─────────────────────────────────────────────────────────────
  { modulo: 'Actas', metodo: 'GET', ruta: '/moduloscliente', permitidos: TODOS },
  { modulo: 'Actas', metodo: 'GET', ruta: '/moduloscliente/count_cajas', permitidos: TODOS },
  { modulo: 'Actas', metodo: 'GET', ruta: '/moduloscliente/999999', permitidos: TODOS },
  { modulo: 'Actas', metodo: 'POST', ruta: '/moduloscliente', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Actas', metodo: 'PUT', ruta: '/moduloscliente/999999', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Actas', metodo: 'DELETE', ruta: '/moduloscliente/999999', permitidos: GESTION },

  // ── Cajas ─────────────────────────────────────────────────────────────
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja?id_modulo_caja=999999', permitidos: TODOS },
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja/999999', permitidos: TODOS },
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja/count_fuiddatosreal', permitidos: TODOS },
  // Alimenta "Mi Panel": devuelve las cajas asignadas a quien pregunta, así que
  // el propio controlador responde 403 a los demás perfiles aunque la ruta solo
  // exija sesión iniciada.
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja/tecnica-stats', permitidos: SOLO_TECNICA },
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja/next-upd/999C999999', permitidos: TODOS },
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja/999999/usuarios', permitidos: TODOS },
  { modulo: 'Cajas', metodo: 'GET', ruta: '/modulos_caja/next/999', permitidos: GESTION },
  { modulo: 'Cajas', metodo: 'POST', ruta: '/modulos_caja', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Cajas', metodo: 'POST', ruta: '/modulos_caja/serie', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Cajas', metodo: 'PUT', ruta: '/modulos_caja/999999', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Cajas', metodo: 'DELETE', ruta: '/modulos_caja/999999', permitidos: GESTION },
  { modulo: 'Cajas', metodo: 'PATCH', ruta: '/modulos_caja/999999/cambiarEstado', permitidos: SOLO_TECNICA, cuerpo: {} },
  { modulo: 'Cajas', metodo: 'PUT', ruta: '/modulos_caja/999C999999/upd-inicio', permitidos: SOLO_TECNICA, cuerpo: {} },

  // ── Asignación de cajas ───────────────────────────────────────────────
  { modulo: 'Asignaciones', metodo: 'POST', ruta: '/asignacion_caja_tecnica', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Asignaciones', metodo: 'POST', ruta: '/asignacion_caja_tecnica/999999/eliminar', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Asignaciones', metodo: 'GET', ruta: '/usuarios/TECNICA', permitidos: TODOS },

  // ── Digitación (FUID) ─────────────────────────────────────────────────
  { modulo: 'Digitación', metodo: 'GET', ruta: '/fuiddatosreal', permitidos: TODOS },
  { modulo: 'Digitación', metodo: 'GET', ruta: '/fuiddatosreal/999999', permitidos: TODOS },
  { modulo: 'Digitación', metodo: 'GET', ruta: '/fuiddatosreal/check-duplicate-upd?upd=UPD9999999', permitidos: TODOS },
  { modulo: 'Digitación', metodo: 'GET', ruta: '/fuiddatosreal/check-caja-duplicates?caja=999C999999', permitidos: TODOS },
  { modulo: 'Digitación', metodo: 'GET', ruta: '/fuiddatosreal/999C999999/suggestions/serie', permitidos: TODOS },
  { modulo: 'Digitación', metodo: 'POST', ruta: '/fuiddatosreal', permitidos: TODOS, cuerpo: {} },
  { modulo: 'Digitación', metodo: 'POST', ruta: '/fuiddatosreal/marcar-ok', permitidos: TODOS, cuerpo: {} },
  { modulo: 'Digitación', metodo: 'PUT', ruta: '/fuiddatosreal/999999', permitidos: TODOS, cuerpo: {} },
  { modulo: 'Digitación', metodo: 'DELETE', ruta: '/fuiddatosreal/999999', permitidos: TODOS },

  // ── Inventario: lo lleva el líder ─────────────────────────────────────
  { modulo: 'Inventario', metodo: 'GET', ruta: '/inventario', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'GET', ruta: '/inventario/clientes', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'GET', ruta: '/inventario/clientes/999', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'GET', ruta: '/inventario/999999', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'GET', ruta: '/inventario/999999/fuid', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'GET', ruta: '/inventario/999999/excel', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'POST', ruta: '/inventario', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Inventario', metodo: 'PUT', ruta: '/inventario/999999', permitidos: GESTION, cuerpo: {} },
  { modulo: 'Inventario', metodo: 'DELETE', ruta: '/inventario/999999', permitidos: GESTION },
  { modulo: 'Inventario', metodo: 'POST', ruta: '/inventario/999999/sync', permitidos: GESTION, cuerpo: {} },

  // ── Historial: lo consulta el líder ───────────────────────────────────
  { modulo: 'Historial', metodo: 'GET', ruta: '/historial', permitidos: GESTION },
  { modulo: 'Historial', metodo: 'GET', ruta: '/historial/registro/999999', permitidos: GESTION },

  // ── Producción e informes ─────────────────────────────────────────────
  { modulo: 'Producción', metodo: 'GET', ruta: '/estadisticas', permitidos: TODOS },
  { modulo: 'Producción', metodo: 'GET', ruta: '/estadisticas/detalle', permitidos: TODOS },
  { modulo: 'Producción', metodo: 'GET', ruta: '/fuid-con-estado-caja', permitidos: TODOS },
  { modulo: 'Producción', metodo: 'GET', ruta: '/resumen-cajas-agrupado', permitidos: TODOS },
  { modulo: 'Producción', metodo: 'POST', ruta: '/generarPlantilla', permitidos: TODOS, cuerpo: { filtros: { vacia: true } } },
];

interface Fallo {
  caso: Caso;
  sujeto: Sujeto;
  esperado: string;
  recibido: number;
}

const fallos: Fallo[] = [];
let comprobaciones = 0;

/** Inicia sesión y devuelve la cookie, o '' para el visitante anónimo. */
async function iniciarSesion(sujeto: Sujeto): Promise<string> {
  if (sujeto === 'ANONIMO') return '';
  const res = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cc: CEDULA[sujeto], contrasena: CLAVE }),
  });
  if (res.status !== 200) {
    throw new Error(`No se pudo iniciar sesión como ${sujeto}: HTTP ${res.status}`);
  }
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

async function ejecutar(caso: Caso, cookie: string): Promise<number> {
  const res = await fetch(`${API}/api${caso.ruta}`, {
    method: caso.metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: caso.cuerpo ? JSON.stringify(caso.cuerpo) : undefined,
  });
  return res.status;
}

/** Crea las cuatro cuentas de prueba. Se borran en `limpiar`. */
async function prepararUsuarios(): Promise<void> {
  await limpiar();
  const hash = await bcrypt.hash(CLAVE, 10);
  for (const rol of ROLES) {
    await query('INSERT INTO users (cc, nombre, contrasena, rol, sede) VALUES (?, ?, ?, ?, ?)', [
      CEDULA[rol],
      `${MARCA} ${rol}`,
      hash,
      rol,
      'BARRANQUILLA',
    ]);
  }
}

async function limpiar(): Promise<void> {
  await query('DELETE FROM users WHERE cc = ANY(?)', [Object.values(CEDULA)]).catch(async () => {
    for (const cc of Object.values(CEDULA)) {
      await query('DELETE FROM users WHERE cc = ?', [cc]);
    }
  });
}

async function main(): Promise<void> {
  console.log(`Matriz de permisos contra ${API}`);
  console.log(`${CASOS.length} endpoints × ${SUJETOS.length} perfiles\n`);

  await prepararUsuarios();
  try {
    const cookies = new Map<Sujeto, string>();
    for (const sujeto of SUJETOS) cookies.set(sujeto, await iniciarSesion(sujeto));

    let moduloActual = '';
    for (const caso of CASOS) {
      if (caso.modulo !== moduloActual) {
        moduloActual = caso.modulo;
        console.log(`\n── ${moduloActual} ${'─'.repeat(Math.max(0, 50 - moduloActual.length))}`);
      }
      const resultados: string[] = [];
      for (const sujeto of SUJETOS) {
        const estado = await ejecutar(caso, cookies.get(sujeto) ?? '');
        comprobaciones += 1;

        let correcto: boolean;
        let esperado: string;
        if (sujeto === 'ANONIMO') {
          esperado = '401';
          correcto = estado === 401;
        } else if (caso.permitidos.includes(sujeto)) {
          // Pasa el guardia: cualquier cosa menos 401/403.
          esperado = 'pasa';
          correcto = estado !== 401 && estado !== 403;
        } else {
          esperado = '403';
          correcto = estado === 403;
        }

        if (!correcto) fallos.push({ caso, sujeto, esperado, recibido: estado });
        const etiqueta = sujeto === 'ANONIMO' ? 'anón' : sujeto.slice(0, 4).toLowerCase();
        resultados.push(`${correcto ? '·' : '!'}${etiqueta}:${estado}`);
      }
      const marca = resultados.some((r) => r.startsWith('!')) ? 'MAL' : 'OK ';
      console.log(`${marca}  ${caso.metodo.padEnd(6)} ${caso.ruta.padEnd(48)} ${resultados.join(' ')}`);
    }
  } finally {
    await limpiar();
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${comprobaciones} comprobaciones sobre ${CASOS.length} endpoints`);
  if (fallos.length === 0) {
    console.log('Todos los endpoints responden con el acceso que declaran.');
  } else {
    console.log(`${fallos.length} desviaciones:\n`);
    for (const f of fallos) {
      console.log(`  ${f.caso.metodo} ${f.caso.ruta}  [${f.sujeto}] esperado ${f.esperado}, recibido ${f.recibido}`);
    }
  }
  process.exit(fallos.length === 0 ? 0 : 1);
}

await main();
