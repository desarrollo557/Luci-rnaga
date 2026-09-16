/**
 * Recorre el flujo completo del sistema contra una instancia en marcha:
 * cliente → acta → caja → FUID → edición → revisión → borrado, más usuarios e
 * inventario.
 *
 *   npx tsx scripts/migracion/humo-flujo.ts [url-base]
 *
 * A diferencia de `humo-endpoints.ts`, que solo lee, esto ejercita los
 * endpoints de escritura, que son los que de verdad tocan la base. Todo lo que
 * crea lleva el prefijo `ZZZ` y se borra al final, incluso si algo falla por el
 * camino, para no dejar restos en la base de trabajo.
 *
 * Credenciales por entorno: ADMIN_CC, ADMIN_PASS, LIDER_CC, LIDER_PASS,
 * TECNICA_CC, TECNICA_PASS, SEDE.
 */

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? 'http://127.0.0.1:3999').replace(/\/$/, '');
const SEDE = process.env.SEDE ?? 'BARRANQUILLA';

/** Código de cliente reservado para las pruebas; no debe existir en la base. */
const CODIGO = '997';
const MARCA = 'ZZZ PRUEBA AUTOMATICA';

let fallos = 0;
const creado: { cliente?: number; acta?: number; caja?: number; fuid?: number; usuario?: number; inventario?: number } = {};

function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK ' : 'MAL'}  ${nombre}${detalle ? `  → ${detalle}` : ''}`);
}

async function entrar(cc: string, pass: string): Promise<string> {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cc, contrasena: pass, sede: SEDE }),
  });
  // El login responde 200 con `success: false` cuando las credenciales no valen,
  // y entrega igualmente una cookie de sesión sin usuario: fiarse del código
  // HTTP daba una sesión anónima con la que todo lo demás respondía 401.
  const cookie = r.headers.get('set-cookie');
  const cuerpo = await r.json().catch(() => ({}) as Record<string, unknown>);
  if (!r.ok || !cookie || (cuerpo as { success?: boolean }).success !== true) {
    throw new Error(`no se pudo iniciar sesión como ${cc} (HTTP ${r.status}: ${JSON.stringify(cuerpo)})`);
  }
  return cookie.split(';')[0];
}

async function llamar(
  metodo: string, ruta: string, cookie: string, cuerpo?: unknown,
): Promise<{ estado: number; datos: any }> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { cookie, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos: any = texto;
  try { datos = JSON.parse(texto); } catch { /* algunas respuestas son texto */ }
  return { estado: r.status, datos };
}

/** Deja la base como estaba: borra en orden inverso a la creación. */
async function limpiar(lider: string, admin: string): Promise<void> {
  if (creado.fuid) await llamar('DELETE', `/api/fuiddatosreal/${creado.fuid}`, lider);
  if (creado.caja) await llamar('DELETE', `/api/modulos_caja/${creado.caja}`, lider);
  if (creado.acta) await llamar('DELETE', `/api/moduloscliente/${creado.acta}`, lider);
  if (creado.cliente) await llamar('DELETE', `/api/sub_modulos/${creado.cliente}`, lider);
  if (creado.inventario) await llamar('DELETE', `/api/inventario/${creado.inventario}`, lider);
  if (creado.usuario) await llamar('DELETE', `/api/users/${creado.usuario}`, admin);
}

async function main(): Promise<void> {
  console.log(`Flujo completo contra ${BASE}\n`);
  const lider = await entrar(process.env.LIDER_CC ?? '', process.env.LIDER_PASS ?? '');
  const admin = await entrar(process.env.ADMIN_CC ?? '', process.env.ADMIN_PASS ?? '');

  // ── Cliente ────────────────────────────────────────────────────────────────
  const cliente = await llamar('POST', '/api/sub_modulos', lider, {
    codigo: CODIGO, entidad_remitente: MARCA, sede_submodulos: SEDE,
  });
  comprobar('crear cliente', cliente.estado < 300, `HTTP ${cliente.estado}`);
  const clientes = await llamar('GET', '/api/sub_modulos', lider);
  creado.cliente = (clientes.datos as any[]).find((c) => c.codigo === CODIGO)?.id;
  comprobar('el cliente aparece en el listado', Boolean(creado.cliente));

  const editCliente = await llamar('PUT', `/api/sub_modulos/${creado.cliente}`, lider, {
    codigo: CODIGO, entidad_remitente: `${MARCA} EDITADO`, sede_submodulos: SEDE,
  });
  comprobar('editar cliente', editCliente.estado < 300, `HTTP ${editCliente.estado}`);

  // ── Acta ───────────────────────────────────────────────────────────────────
  const acta = await llamar('POST', '/api/moduloscliente', lider, {
    codigo: CODIGO, entidad_remitente: MARCA, acta_transferencia_modulo: '997',
    fecha_trans_modulo: '2025-03-10', id_submodulo: creado.cliente,
  });
  comprobar('crear acta', acta.estado < 300, `HTTP ${acta.estado}`);
  const actas = await llamar('GET', '/api/moduloscliente', lider);
  creado.acta = (actas.datos as any[]).find((a) => a.acta_transferencia_modulo === '997')?.id;
  comprobar('el acta aparece en el listado', Boolean(creado.acta));

  // Un acta se puede crear sin código ni entidad: se guardan como N/A.
  const actaVacia = await llamar('POST', '/api/moduloscliente', lider, {
    acta_transferencia_modulo: '996', fecha_trans_modulo: '2025-03-10', id_submodulo: creado.cliente,
  });
  comprobar('crear acta dejando campos vacíos', actaVacia.estado < 300, `HTTP ${actaVacia.estado}`);
  const actas2 = await llamar('GET', '/api/moduloscliente', lider);
  const actaNa = (actas2.datos as any[]).find((a) => a.acta_transferencia_modulo === '996');
  comprobar('lo vacío se guardó como N/A', actaNa?.codigo === 'N/A', String(actaNa?.codigo));
  if (actaNa) await llamar('DELETE', `/api/moduloscliente/${actaNa.id}`, lider);

  // ── Caja ───────────────────────────────────────────────────────────────────
  const siguiente = await llamar('GET', `/api/modulos_caja/next/${CODIGO}C`, lider);
  comprobar('calcular el siguiente número de caja', siguiente.estado === 200, siguiente.datos?.siguiente);

  const caja = await llamar('POST', '/api/modulos_caja', lider, {
    caja_modulo: `${CODIGO}C000001`, entidad_remitente_caja: MARCA, acta_trans_caja: '997',
    fecha_trans_caja: '2025-03-10', id_modulo_caja: creado.acta, estado_caja: 'EN PROCESO',
  });
  comprobar('crear caja dejando vacíos los campos opcionales', caja.estado < 300, `HTTP ${caja.estado}`);
  const cajas = await llamar('GET', `/api/modulos_caja?id_modulo_caja=${creado.acta}`, lider);
  const cajaCreada = (cajas.datos as any[])?.find?.((c) => c.caja_modulo === `${CODIGO}C000001`);
  creado.caja = cajaCreada?.id;
  comprobar('la caja aparece en el acta', Boolean(creado.caja));
  comprobar('el objeto vacío se guardó como N/A', cajaCreada?.objeto_caja === 'N/A', String(cajaCreada?.objeto_caja));

  // El estado de la caja lo cambia quien digita, no el líder: la ruta está
  // reservada al rol TECNICA y a un líder le responde 403 a propósito.
  const negado = await llamar('PATCH', `/api/modulos_caja/${creado.caja}/cambiarEstado`, lider, { estado_caja: 'FINALIZADO' });
  comprobar('el líder no puede cambiar el estado de la caja', negado.estado === 403, `HTTP ${negado.estado}`);

  // ── Asignaciones ───────────────────────────────────────────────────────────
  const tecnicoId = (await llamar('GET', '/api/usuarios/TECNICA', lider)).datos?.[0]?.id;
  const asignar = await llamar('POST', '/api/asignacion_caja_tecnica', lider, {
    modulo_id: creado.caja, usuarios: [tecnicoId],
  });
  comprobar('asignar un técnico a la caja', asignar.estado < 300, `HTTP ${asignar.estado}`);

  const asignados = await llamar('GET', `/api/modulos_caja/${creado.caja}/usuarios`, lider);
  comprobar('la caja lista sus técnicos asignados', asignados.estado === 200 && Array.isArray(asignados.datos));

  const tecnica = await entrar(process.env.TECNICA_CC ?? '', process.env.TECNICA_PASS ?? '');
  const estado = await llamar('PATCH', `/api/modulos_caja/${creado.caja}/cambiarEstado`, tecnica, { estado_caja: 'FINALIZADO' });
  comprobar('el técnico asignado sí cambia el estado', estado.estado < 300, `HTTP ${estado.estado}`);
  await llamar('PATCH', `/api/modulos_caja/${creado.caja}/cambiarEstado`, tecnica, { estado_caja: 'EN PROCESO' });

  const quitar = await llamar('POST', `/api/asignacion_caja_tecnica/${creado.caja}/eliminar`, lider, {
    usuarios: [tecnicoId],
  });
  comprobar('quitar la asignación', quitar.estado < 300, `HTTP ${quitar.estado}`);

  // ── Registro FUID ──────────────────────────────────────────────────────────
  const upd = `UPD99${String(Date.now()).slice(-5)}`;
  const fuid = await llamar('POST', '/api/fuiddatosreal', lider, {
    caja: `${CODIGO}C000001`, upd, asunto_2: 'TUTELA', asunto_3: 'PRUEBA AUTOMATICA',
    fecha_del_dato: new Date().toISOString().slice(0, 10), elaborado_por: MARCA, sede: SEDE,
  });
  comprobar('crear registro FUID', fuid.estado < 300, `HTTP ${fuid.estado}`);

  const listado = await llamar('GET', `/api/fuiddatosreal?caja=${CODIGO}C000001`, lider);
  const fuidCreado = (listado.datos as any[])?.find?.((f) => f.upd === upd);
  creado.fuid = fuidCreado?.id;
  comprobar('el FUID aparece en su caja', Boolean(creado.fuid));
  comprobar('el asunto se compuso solo', fuidCreado?.asunto === 'TUTELA PRUEBA AUTOMATICA', String(fuidCreado?.asunto));
  comprobar('lo vacío del FUID se guardó como N/A', fuidCreado?.notas === 'N/A', String(fuidCreado?.notas));

  const duplicado = await llamar('POST', '/api/fuiddatosreal', lider, {
    caja: `${CODIGO}C000001`, upd, asunto_2: 'OTRA', asunto_3: 'COSA',
    fecha_del_dato: new Date().toISOString().slice(0, 10),
  });
  comprobar('un UPD repetido se rechaza', duplicado.estado === 409, `HTTP ${duplicado.estado}`);

  const sinAsunto = await llamar('POST', '/api/fuiddatosreal', lider, {
    caja: `${CODIGO}C000001`, upd: `${upd}X`, fecha_del_dato: new Date().toISOString().slice(0, 10),
  });
  comprobar('un FUID sin asunto se rechaza', sinAsunto.estado === 400, `HTTP ${sinAsunto.estado}`);

  const detalle = await llamar('GET', `/api/fuiddatosreal/${creado.fuid}`, lider);
  comprobar('leer un FUID por id', detalle.estado === 200 && detalle.datos?.version === 1);

  const edicion = await llamar('PUT', `/api/fuiddatosreal/${creado.fuid}`, lider, {
    ...fuidCreado, notas: 'EDITADO POR LA PRUEBA', version: detalle.datos?.version,
  });
  comprobar('editar un FUID', edicion.estado < 300, `HTTP ${edicion.estado}`);

  const versionVieja = await llamar('PUT', `/api/fuiddatosreal/${creado.fuid}`, lider, {
    ...fuidCreado, notas: 'OTRA VEZ', version: detalle.datos?.version,
  });
  comprobar('el bloqueo optimista rechaza la versión vieja', versionVieja.estado === 409, `HTTP ${versionVieja.estado}`);

  const marcar = await llamar('POST', '/api/fuiddatosreal/marcar-ok', lider, { ids: [creado.fuid] });
  comprobar('marcar OK', marcar.estado < 300, `HTTP ${marcar.estado}`);

  const sugerencias = await llamar('GET', `/api/fuiddatosreal/${CODIGO}C000001/suggestions/serie?q=AB`, lider);
  comprobar('autocompletado de campos', sugerencias.estado === 200);

  // ── Usuarios ───────────────────────────────────────────────────────────────
  const usuario = await llamar('POST', '/api/users', admin, {
    cc: '99999999', nombre: MARCA, contrasena: 'prueba123', rol: 'TECNICA', sede: SEDE,
  });
  comprobar('crear usuario', usuario.estado < 300, `HTTP ${usuario.estado}`);
  const usuarios = await llamar('GET', '/api/users', admin);
  creado.usuario = (usuarios.datos as any[])?.find?.((u) => u.cc === '99999999')?.id;
  comprobar('el usuario aparece en el listado', Boolean(creado.usuario));

  if (creado.usuario) {
    const susp = await llamar('PATCH', `/api/users/${creado.usuario}/suspension`, admin, { suspendido_hasta: '2030-01-01' });
    comprobar('suspender usuario', susp.estado < 300, `HTTP ${susp.estado}`);
    const edit = await llamar('PUT', `/api/users/${creado.usuario}`, admin, {
      cc: '99999999', nombre: `${MARCA} EDITADO`, rol: 'TECNICA', sede: SEDE,
    });
    comprobar('editar usuario', edit.estado < 300, `HTTP ${edit.estado}`);
  }

  // ── Inventario ─────────────────────────────────────────────────────────────
  const inventario = await llamar('POST', '/api/inventario', lider, {
    CODIGO_DEL_CLIENTE: CODIGO, CLIENTE: MARCA, No_ACTA: '997', TOTAL_CAJAS: 1,
  });
  comprobar('crear inventario', inventario.estado < 300, `HTTP ${inventario.estado}`);
  creado.inventario = inventario.datos?.id;
  if (creado.inventario) {
    const conFuid = await llamar('GET', `/api/inventario/${creado.inventario}/fuid`, lider);
    comprobar('inventario con sus FUID y totales', conFuid.estado === 200, `HTTP ${conFuid.estado}`);
    const previo = await llamar('GET', `/api/inventario/clientes/${CODIGO}`, lider);
    comprobar('previsualización por código de cliente', previo.estado < 500, `HTTP ${previo.estado}`);
  }

  // ── Informes ───────────────────────────────────────────────────────────────
  for (const ruta of ['/api/estadisticas', '/api/historial', '/api/resumen-cajas-agrupado', '/api/fuid-con-estado-caja']) {
    const r = await llamar('GET', ruta, lider);
    comprobar(`informe ${ruta}`, r.estado === 200, `HTTP ${r.estado}`);
  }

  await llamar('POST', '/api/logout', lider);
}

main()
  .then(async () => {
    const lider = await entrar(process.env.LIDER_CC ?? '', process.env.LIDER_PASS ?? '');
    const admin = await entrar(process.env.ADMIN_CC ?? '', process.env.ADMIN_PASS ?? '');
    await limpiar(lider, admin);
    console.log(fallos === 0 ? '\nTodo el flujo funciona' : `\n${fallos} comprobaciones fallidas`);
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error('ERROR:', e.message);
    try {
      const lider = await entrar(process.env.LIDER_CC ?? '', process.env.LIDER_PASS ?? '');
      const admin = await entrar(process.env.ADMIN_CC ?? '', process.env.ADMIN_PASS ?? '');
      await limpiar(lider, admin);
    } catch { /* si no se puede limpiar, se avisa arriba */ }
    process.exit(1);
  });
