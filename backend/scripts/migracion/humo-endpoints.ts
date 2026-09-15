/**
 * Recorre los endpoints de lectura de la API, con sesión, y avisa de los que
 * fallan.
 *
 *   npx tsx scripts/migracion/humo-endpoints.ts [url-base]
 *
 * Nació de la migración a PostgreSQL: los fallos de SQL que MySQL toleraba
 * (`CONCAT` con parámetros sin tipo, `SUBSTRING_INDEX`) no los detecta ni el
 * compilador ni las pruebas unitarias, solo aparecen al ejecutar la consulta. En
 * vez de descubrirlos uno a uno abriendo pantallas, esto los saca de una pasada.
 *
 * Solo hace peticiones GET: no crea, no modifica y no borra nada, así que se
 * puede lanzar contra el sistema en producción.
 *
 * Credenciales por variables de entorno: LIDER_CC, LIDER_PASS, ADMIN_CC,
 * ADMIN_PASS, SEDE.
 */

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const SEDE = process.env.SEDE ?? 'BARRANQUILLA';

interface Resultado { ruta: string; estado: number | string; nota?: string }

/** Inicia sesión y devuelve la cookie de sesión, o null si no entra. */
async function entrar(cc: string, pass: string): Promise<string | null> {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cc, contrasena: pass, sede: SEDE }),
  });
  const cookie = r.headers.get('set-cookie');
  if (!r.ok || !cookie) return null;
  return cookie.split(';')[0];
}

async function pedir(ruta: string, cookie: string): Promise<{ estado: number; cuerpo: unknown }> {
  const r = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
  const texto = await r.text();
  let cuerpo: unknown = texto;
  try { cuerpo = JSON.parse(texto); } catch { /* algunas rutas devuelven texto */ }
  return { estado: r.status, cuerpo };
}

/** Primer id de una lista, para poder pedir el detalle correspondiente. */
function primerId(cuerpo: unknown, campo = 'id'): string | null {
  if (!Array.isArray(cuerpo) || cuerpo.length === 0) return null;
  const valor = (cuerpo[0] as Record<string, unknown>)[campo];
  return valor == null ? null : String(valor);
}

async function main(): Promise<void> {
  console.log(`Probando ${BASE}\n`);

  const lider = await entrar(process.env.LIDER_CC ?? '', process.env.LIDER_PASS ?? '');
  if (!lider) { console.error('No se pudo iniciar sesión como líder; revisa LIDER_CC y LIDER_PASS.'); process.exit(1); }

  // Se descubren ids reales desde los propios listados: así el script sirve
  // contra cualquier base sin tener que fijar identificadores a mano.
  const clientes = await pedir('/api/sub_modulos', lider);
  const actas = await pedir('/api/moduloscliente', lider);

  // El listado de cajas exige el acta a la que pertenecen, así que se pide con
  // la primera que haya: sin esto no habría forma de descubrir una caja y media
  // docena de rutas se quedaban sin probar.
  const idActaPrevio = primerId(actas.cuerpo);
  const cajas = await pedir(`/api/modulos_caja?id_modulo_caja=${idActaPrevio}`, lider);
  const fuids = await pedir('/api/fuiddatosreal', lider);
  const inventarios = await pedir('/api/inventario', lider);

  const idCliente = primerId(clientes.cuerpo);
  const idActa = primerId(actas.cuerpo);
  const idCaja = primerId(cajas.cuerpo);
  const idFuid = primerId(fuids.cuerpo);
  const idInventario = primerId(inventarios.cuerpo, 'ITEMS');
  const codigoCaja = Array.isArray(cajas.cuerpo) && cajas.cuerpo.length > 0
    ? String((cajas.cuerpo[0] as Record<string, unknown>).caja_modulo ?? '')
    : '';
  const codigoCliente = Array.isArray(clientes.cuerpo) && clientes.cuerpo.length > 0
    ? String((clientes.cuerpo[0] as Record<string, unknown>).codigo ?? '')
    : '';

  const rutas: Array<[string, string | null]> = [
    ['/api/health', null],
    ['/api/checkAuth', null],
    ['/api/currentUser', null],
    ['/api/sub_modulos', null],
    ['/api/moduloscliente', null],
    ['/api/moduloscliente/count_cajas', null],
    [`/api/moduloscliente/${idActa}`, idActa],
    ['/api/modulos_caja', null],
    ['/api/modulos_caja/count_fuiddatosreal', null],
    ['/api/modulos_caja/tecnica-stats', null],
    [`/api/modulos_caja/${idCaja}`, idCaja],
    [`/api/modulos_caja/${idCaja}/usuarios`, idCaja],
    [`/api/modulos_caja_calidad/${idCaja}/usuarios`, idCaja],
    [`/api/modulos_caja/next/${codigoCliente.padStart(3, '0')}C`, codigoCliente],
    [`/api/modulos_caja/next-upd/${codigoCaja}`, codigoCaja],
    ['/api/fuiddatosreal', null],
    [`/api/fuiddatosreal/${idFuid}`, idFuid],
    ['/api/fuiddatosreal/check-duplicate-upd?upd=UPD0000001', null],
    [`/api/fuiddatosreal/check-caja-duplicates?caja=${codigoCaja}`, codigoCaja],
    [`/api/fuiddatosreal/${codigoCaja}/suggestions/serie?q=A`, codigoCaja],
    ['/api/estadisticas', null],
    ['/api/estadisticas/detalle', null],
    ['/api/historial', null],
    ['/api/historial?q=UPD', null],
    [`/api/historial/registro/${idFuid}`, idFuid],
    ['/api/inventario', null],
    ['/api/inventario/clientes', null],
    [`/api/inventario/${idInventario}`, idInventario],
    [`/api/inventario/${idInventario}/fuid`, idInventario],
    [`/api/inventario/${idInventario}/excel`, idInventario],
    [`/api/inventario/clientes/${codigoCliente}`, codigoCliente],
    ['/api/resumen-cajas-agrupado', null],
    ['/api/fuid-con-estado-caja', null],
    ['/api/usuarios/TECNICA', null],
  ];

  const fallos: Resultado[] = [];
  for (const [ruta, requiere] of rutas) {
    if (requiere === null && ruta.includes('null')) { console.log(`--   ${ruta}  (sin datos para probarlo)`); continue; }
    if (requiere !== null && (requiere === '' || requiere === 'null')) { console.log(`--   ${ruta}  (sin datos para probarlo)`); continue; }
    try {
      const { estado, cuerpo } = await pedir(ruta, lider);
      const mal = estado >= 500;
      if (mal) {
        const detalle = typeof cuerpo === 'object' && cuerpo !== null
          ? JSON.stringify(cuerpo).slice(0, 120) : String(cuerpo).slice(0, 120);
        fallos.push({ ruta, estado, nota: detalle });
      }
      console.log(`${mal ? 'MAL ' : 'OK  '} ${String(estado).padEnd(4)} ${ruta}`);
    } catch (e) {
      fallos.push({ ruta, estado: 'sin respuesta', nota: (e as Error).message });
      console.log(`MAL  ---  ${ruta}  (${(e as Error).message})`);
    }
  }

  // La lista de usuarios es del administrador; el líder recibiría un 403 que no
  // significa que el endpoint esté roto.
  const admin = await entrar(process.env.ADMIN_CC ?? '', process.env.ADMIN_PASS ?? '');
  if (admin) {
    const { estado, cuerpo } = await pedir('/api/users', admin);
    const mal = estado >= 500;
    if (mal) fallos.push({ ruta: '/api/users', estado, nota: JSON.stringify(cuerpo).slice(0, 120) });
    console.log(`${mal ? 'MAL ' : 'OK  '} ${String(estado).padEnd(4)} /api/users  (como administrador)`);
  }

  console.log();
  if (fallos.length === 0) {
    console.log('Ningún endpoint devolvió error de servidor.');
  } else {
    console.log(`${fallos.length} endpoint(s) con error de servidor:`);
    for (const f of fallos) console.log(`  ${f.estado}  ${f.ruta}\n      ${f.nota ?? ''}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
