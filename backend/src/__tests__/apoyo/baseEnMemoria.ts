import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Una base PostgreSQL de verdad, en memoria, con el esquema real del proyecto.
 *
 * Sirve para probar el software entero de punta a punta: la aplicación Express
 * tal cual se despliega, sus rutas, sus permisos, sus controladores y su SQL,
 * sin dobles de ninguna pieza. Lo único que se sustituye es el motor de la base,
 * y por otro PostgreSQL, no por una imitación.
 *
 * Por qué hace falta: lo que se quiere comprobar —que al digitar cajas el
 * seguimiento de inventario salga con los números correctos— atraviesa la
 * validación, la sesión, cinco tablas y una consulta con agregados y ventanas.
 * Un doble de la base no prueba nada de eso; como mucho prueba que se llamó a
 * una función.
 *
 * El esquema se carga de `database/supabase/`, los mismos archivos que se
 * aplican a Supabase, así que la prueba se rompe si el esquema real cambia y
 * el código no.
 */

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const SQL_BASE = path.join(RAIZ, 'database', 'supabase');

/** Parsers de tipo que registre `config/db.js`, para leer igual que en producción. */
const parsers: Record<number, (valor: string) => unknown> = {};

let base: PGlite | null = null;

/** La instancia viva. Se crea con los parsers que el código haya registrado. */
export function baseViva(): PGlite {
  if (!base) base = new PGlite({ parsers });
  return base;
}

export async function reiniciarBase(): Promise<PGlite> {
  await base?.close();
  base = new PGlite({ parsers });
  for (const archivo of ['01-esquema.sql', '02-triggers.sql', '06-ciclo-caja.sql']) {
    await base.exec(fs.readFileSync(path.join(SQL_BASE, archivo), 'utf8'));
  }
  // Y los ajustes que el servidor aplica al arrancar, porque la aplicación los
  // da por hechos: sin ellos faltarían columnas que el código ya lee.
  const { AJUSTES } = await import('../../config/esquema.js');
  for (const ajuste of AJUSTES) await base.exec(ajuste.sql);
  return base;
}

/** Traduce el resultado de PGlite a la forma que devuelve `pg`. */
function comoPg(resultado: {
  rows: unknown[];
  affectedRows?: number;
  command?: string;
  fields?: unknown[];
}) {
  const esLectura = /^(SELECT|WITH)$/i.test(resultado.command ?? '');
  return {
    rows: resultado.rows,
    fields: resultado.fields ?? [],
    rowCount: esLectura ? resultado.rows.length : (resultado.affectedRows ?? 0),
    command: resultado.command,
  };
}

async function ejecutar(texto: string, valores: unknown[] = []) {
  // `exec` admite varias sentencias seguidas y no acepta parámetros; el almacén
  // de sesiones crea su tabla así.
  if (valores.length === 0 && /;\s*\S/.test(texto.trim().replace(/;\s*$/, ''))) {
    const partes = await baseViva().exec(texto);
    return comoPg(partes[partes.length - 1] ?? { rows: [] });
  }
  // Los parsers se pasan en cada consulta, no al construir la base: el código de
  // producción los registra al importarse `config/db.js`, que puede ocurrir
  // después de que esta base exista. Pasarlos aquí hace que el orden no importe.
  return comoPg(await baseViva().query(texto, valores as never[], { parsers }));
}

/**
 * El módulo `pg` sustituido: mismo contrato, otro motor debajo.
 *
 * `types.setTypeParser` no se ignora: se recoge lo que registre el código y se
 * le pasa a PGlite, para que las fechas lleguen como texto igual que en
 * producción. Si esto se ignorara, una fecha volvería como objeto y podría
 * desplazarse un día al escribirla en el Excel, que es justo uno de los fallos
 * que esta prueba tiene que poder ver.
 */
export function moduloPgFalso() {
  class Pool {
    constructor(_config?: unknown) {}
    on(evento: string, manejador: (cliente: unknown) => void) {
      if (evento === 'connect') manejador({ query: ejecutar });
      return this;
    }
    query(texto: string, valores?: unknown[] | ((e: unknown, r?: unknown) => void), cb?: (e: unknown, r?: unknown) => void) {
      const parametros = Array.isArray(valores) ? valores : [];
      const llamada = typeof valores === 'function' ? valores : cb;
      const promesa = ejecutar(texto, parametros);
      // El almacén de sesiones usa el estilo de retrollamada.
      if (llamada) {
        promesa.then((r) => llamada(null, r)).catch((e) => llamada(e));
        return undefined;
      }
      return promesa;
    }
    async connect() {
      return { query: ejecutar, release: () => undefined };
    }
    async end() {}
  }
  const types = {
    setTypeParser(oid: number, fn: (valor: string) => unknown) {
      parsers[oid] = fn;
    },
  };
  return { default: { Pool, types }, Pool, types };
}
