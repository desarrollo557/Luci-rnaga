import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import JSZip from 'jszip';
import { baseViva, moduloPgFalso, reiniciarBase } from './apoyo/baseEnMemoria.js';
import { serialDeFecha } from '../services/seguimientoInventario.service.js';

/**
 * El camino completo, desde crear un cliente hasta abrir el Excel.
 *
 * Esta prueba no comprueba una función: comprueba el software. Levanta la
 * aplicación Express tal cual se despliega, entra con usuario y contraseña,
 * crea un cliente nuevo con su código, su acta y sus cajas, digita registros
 * como lo haría una técnica y descarga el seguimiento de inventario. Después
 * abre el archivo y lee las celdas.
 *
 * Existe porque el formato salió mal dos veces seguidas y las dos veces todo lo
 * demás estaba en verde. Lo que fallaba estaba entre las piezas —el SQL, el
 * estado de las cajas, la fecha con la que se atribuye el trabajo—, y eso solo
 * se ve recorriendo el camino entero.
 *
 * Lo único sustituido es el motor de la base, y por otro PostgreSQL de verdad.
 */

vi.mock('pg', () => moduloPgFalso());

const CLIENTE = { codigo: '077', entidad: 'ALCALDIA DE PRUEBA E2E' };
const ACTA = 'ACTA-E2E-001';
const caja = (n: number) => CLIENTE.codigo + 'C' + String(n).padStart(6, '0');
const LIDER = { cc: '9000001', nombre: 'LIDER E2E', contrasena: 'Clave.Lider1' };
const TECNICA = { cc: '9000002', nombre: 'TECNICA E2E', contrasena: 'Clave.Tecnica1' };
const AUTOR_TECNICA = TECNICA.nombre + ' (' + TECNICA.cc + ')';
const DIA = '2026-09-17';

/**
 * El archivo generado se guarda para poder abrirlo y mirarlo cuando algo no
 * cuadre. Va al directorio temporal del sistema: es un resultado de la prueba,
 * no una pieza del proyecto, y no tiene por qué ensuciar el repositorio.
 */
const SALIDA = path.join(os.tmpdir(), 'evidencia-seguimiento.xlsx');

let servidor: Server;
let raiz: string;

/** Cliente HTTP con cookies: una sesión por persona, como en un navegador. */
function sesion() {
  let cookie = '';
  return async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) cabeceras.Cookie = cookie;
    const respuesta = await fetch(raiz + ruta, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const recibidas = respuesta.headers.getSetCookie?.() ?? [];
    if (recibidas.length > 0) cookie = recibidas.map((c) => c.split(';')[0]).join('; ');
    return respuesta;
  };
}

/** Pide y exige que salga bien; si no, el error dice qué respondió el servidor. */
async function json<T>(
  pedir: ReturnType<typeof sesion>,
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
): Promise<T> {
  const respuesta = await pedir(metodo, ruta, cuerpo);
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(metodo + ' ' + ruta + ' respondió ' + respuesta.status + ': ' + texto.slice(0, 500));
  }
  // Algunos endpoints responden texto plano; no todos devuelven JSON.
  try {
    return (texto ? JSON.parse(texto) : undefined) as T;
  } catch {
    return texto as T;
  }
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET ??= 'secreto-de-prueba-suficientemente-largo-1234567890';
  process.env.PG_HOST ??= 'memoria';
  process.env.PG_USER ??= 'prueba';
  process.env.PG_PASSWORD ??= 'prueba';

  await reiniciarBase();
  // Las dos personas que ya existen en cualquier instalación real.
  const personas: [typeof LIDER, string][] = [
    [LIDER, 'LIDER'],
    [TECNICA, 'TECNICA'],
  ];
  for (const [persona, rol] of personas) {
    await baseViva().query(
      'INSERT INTO users (nombre, cc, contrasena, rol, sede) VALUES ($1, $2, $3, $4, $5)',
      [persona.nombre, persona.cc, await bcrypt.hash(persona.contrasena, 10), rol, 'BARRANQUILLA'],
    );
  }

  const { app } = await import('../app.js');
  servidor = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  const direccion = servidor.address();
  const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
  raiz = 'http://127.0.0.1:' + puerto + '/api';
}, 120_000);

afterAll(async () => {
  await new Promise((fin) => servidor?.close(() => fin(undefined)));
});

describe('de crear un cliente a descargar el seguimiento', () => {
  it('el Excel refleja las cajas que la técnica terminó ese día', async () => {
    const lider = sesion();
    const entrada = await json<{ success: boolean; message?: string }>(lider, 'POST', '/login', {
      cc: LIDER.cc,
      contrasena: LIDER.contrasena,
    });
    expect(entrada.success, entrada.message).toBe(true);

    // 1. Un cliente nuevo, con un código que no existía.
    await json(lider, 'POST', '/sub_modulos', {
      codigo: CLIENTE.codigo,
      entidad_remitente: CLIENTE.entidad,
      sede_submodulos: 'BARRANQUILLA',
    });
    const clientes = await json<{ id: number; codigo: string }[]>(lider, 'GET', '/sub_modulos');
    const cliente = clientes.find((c) => c.codigo === CLIENTE.codigo);
    expect(cliente, 'el cliente nuevo aparece en el listado').toBeTruthy();

    // 2. Su acta de transferencia.
    await json(lider, 'POST', '/moduloscliente', {
      codigo: CLIENTE.codigo,
      entidad_remitente: CLIENTE.entidad,
      acta_transferencia_modulo: ACTA,
      fecha_trans_modulo: '2026-09-01',
      id_submodulo: cliente!.id,
    });
    const actas = await json<{ id: number; acta_transferencia_modulo: string }[]>(lider, 'GET', '/moduloscliente');
    const acta = actas.find((a) => a.acta_transferencia_modulo === ACTA);
    expect(acta, 'el acta aparece bajo el cliente').toBeTruthy();

    // 3. Tres cajas dentro del acta.
    for (const numero of [4431, 4432, 4433]) {
      await json(lider, 'POST', '/modulos_caja', {
        caja_modulo: caja(numero),
        entidad_remitente_caja: CLIENTE.entidad,
        acta_trans_caja: ACTA,
        fecha_trans_caja: '2026-09-01',
        id_modulo_caja: acta!.id,
        entidad_productora_caja: CLIENTE.entidad,
        unidad_administrativa_caja: 'SECRETARIA GENERAL',
        oficina_productora_caja: 'ARCHIVO CENTRAL',
        objeto_caja: 'TRANSFERENCIA PRIMARIA',
        estado_caja: 'EN PROCESO',
      });
    }
    const cajas = await json<{ id: number; caja_modulo: string }[]>(lider, 'GET', '/modulos_caja?id_modulo_caja=' + acta!.id);
    const mias = cajas.filter((c) => c.caja_modulo.startsWith(CLIENTE.codigo + 'C'));
    expect(mias).toHaveLength(3);

    // 4. Las cajas se asignan a la técnica, que es como se reparte el trabajo.
    // El líder lista técnicas por su rol; el listado completo de usuarios es del administrador.
    const usuarios = await json<{ id: number; cc: string }[]>(lider, 'GET', '/usuarios/TECNICA');
    const tecnica = usuarios.find((u) => u.cc === TECNICA.cc);
    expect(tecnica, 'la técnica existe').toBeTruthy();
    for (const c of mias) {
      await json(lider, 'POST', '/asignacion_caja_tecnica', { modulo_id: c.id, usuarios: [tecnica!.id] });
    }

    // 5. La técnica digita: termina la 4431 y la 4432 el mismo día.
    const tec = sesion();
    const entradaTecnica = await json<{ success: boolean; message?: string }>(tec, 'POST', '/login', {
      cc: TECNICA.cc,
      contrasena: TECNICA.contrasena,
    });
    expect(entradaTecnica.success, entradaTecnica.message).toBe(true);

    let upd = 2950000;
    const digitar = async (numeroDeCaja: number, cuantos: number, fecha: string) => {
      for (let i = 0; i < cuantos; i += 1) {
        upd += 1;
        await json(tec, 'POST', '/fuiddatosreal', {
          fecha_del_dato: fecha,
          caja: caja(numeroDeCaja),
          upd: 'UPD' + upd,
          asunto_2: 'EXPEDIENTE DE CONTRATACION',
          asunto_3: 'DOCUMENTO ' + (i + 1),
          elaborado_por: AUTOR_TECNICA,
          nro_acta_transferible: ACTA,
          codigo: CLIENTE.codigo,
          entidad_remitente: CLIENTE.entidad,
          sede: 'BARRANQUILLA',
          folios: '10',
          otro: 'N/A',
          soporte: 'N/A',
          frecuencia: 'N/A',
        });
      }
    };
    await digitar(4431, 10, DIA);
    await digitar(4432, 8, DIA);

    // 6. El líder descarga el seguimiento del día.
    const respuesta = await lider('GET', '/seguimiento-inventario/excel?desde=' + DIA + '&hasta=' + DIA);
    if (respuesta.status !== 200) throw new Error('la descarga respondió ' + respuesta.status + ': ' + (await respuesta.text()));
    const libro = Buffer.from(await respuesta.arrayBuffer());
    fs.writeFileSync(SALIDA, libro);
    console.log('Seguimiento generado en ' + SALIDA);

    // 7. Y se abre el archivo para leer lo que trae.
    const zip = await JSZip.loadAsync(libro);
    const hoja = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const fila9 = /<row r="9"[\s\S]*?<\/row>/.exec(hoja)?.[0] ?? '';
    const celda = (columna: string) => {
      const contenido = new RegExp('<c r="' + columna + '9"[^>]*>([\\s\\S]*?)</c>').exec(fila9)?.[1] ?? '';
      const texto = /<t[^>]*>([\s\S]*?)<\/t>/.exec(contenido)?.[1];
      const numero = /<v>([\s\S]*?)<\/v>/.exec(contenido)?.[1];
      return (texto ?? numero ?? '').trim();
    };

    // La fecha va como número de serie de Excel. Se comprueba porque una fecha
    // que llega como objeto en vez de texto se desplaza un día sin avisar.
    expect(celda('B'), 'la jornada, sin desplazarse de día').toBe(String(serialDeFecha(DIA)));
    expect(celda('C'), 'código del cliente nuevo').toBe(CLIENTE.codigo);
    expect(celda('D'), 'caja inicial').toBe('4431');
    expect(celda('E'), 'caja final').toBe('4432');
    expect(celda('I'), 'registros digitados').toBe('18');
    expect(celda('J'), 'colaborador, sin la cédula').toBe(TECNICA.nombre);
    expect(celda('L'), 'acta de transferencia').toBe(ACTA);
    // Lo que se está probando: terminó dos cajas, el formato dice dos.
    expect(celda('F'), 'cajas terminadas ese día').toBe('2');
  }, 180_000);
});
