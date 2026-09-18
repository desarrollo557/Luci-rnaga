/**
 * Configuración central del backend.
 *
 * Reúne los valores que antes estaban repartidos como literales por app.ts,
 * server.ts y db.ts (ver AUDIT_REPORT.md §1). Cada constante lee su variable de
 * entorno correspondiente y cae a un valor por defecto seguro para desarrollo.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ── Servidor ──────────────────────────────────────────────────────────────
export const DEFAULT_PORT = envInt('PORT', 3000);
export const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
export const SERVICE_NAME = 'luci-api';

// ── Rate limiting ─────────────────────────────────────────────────────────
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_GENERAL = envInt('RATE_LIMIT_GENERAL', 1000);
export const RATE_LIMIT_LOGIN_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_LOGIN = envInt('RATE_LIMIT_LOGIN', 30);

// ── CORS y sesión ─────────────────────────────────────────────────────────
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8;
export const DEFAULT_FRONTEND_DIST = '../frontend/dist';

// ── Base de datos ─────────────────────────────────────────────────────────
/**
 * Conexiones simultáneas que abre **esta** instancia contra el pooler.
 *
 * El número no se elige por lo que aguanta la máquina, sino por un cupo que no
 * es nuestro: el pooler de Supabase en modo sesión reparte 15 sesiones entre
 * todo el proyecto, y cada conexión abierta ocupa una mientras viva. Ese cupo
 * lo comparten el servicio desplegado en Render, cada equipo de desarrollo que
 * tenga el backend levantado, el editor SQL de Supabase y cualquier script que
 * se ejecute a mano.
 *
 * Con el valor anterior —10, y sin declararlo en Render— las dos instancias
 * pedían 20 y la base respondía `EMAXCONNSESSION: max clients reached in
 * session mode`. No era un pico raro: bastaba con tener Producción abierta en
 * los dos sitios, porque su pantalla se refresca sola cada quince segundos.
 *
 * El reparto actual deja margen: 8 para producción (declarado en
 * `render.yaml`), 4 para cada equipo de desarrollo, y las tres restantes
 * libres para el editor SQL y las migraciones. Si algún día hacen falta más,
 * lo que hay que subir es el cupo del plan de Supabase, no este número.
 */
export const DB_CONNECTION_LIMIT = envInt('DB_CONNECTION_LIMIT', 4);
export const DB_QUEUE_LIMIT = 0;

// ── Hora ─────────────────────────────────────────────────────────────────
/**
 * Zona horaria de todo el software.
 *
 * Todas las sedes operan en Colombia, así que cada fecha y hora —el "hoy" al
 * digitar, la creación de un usuario, un cambio en el historial— se calcula y
 * se guarda en la hora de Bogotá (UTC-5, sin horario de verano). El servidor
 * (Render) y la base (Supabase) corren en UTC: sin fijarla, un usuario creado
 * a las 8 de la mañana aparecía creado a la 1 de la tarde. `db.ts` la fija en
 * cada conexión y `fechaHoyLocal` la usa para saber qué día es.
 */
export const ZONA_HORARIA = 'America/Bogota';

// ── Seguridad ─────────────────────────────────────────────────────────────
export const BCRYPT_SALT_ROUNDS = 10;

/** Prefijo con el que bcrypt marca sus hashes; lo que no empiece así está en claro. */
export const PREFIJO_HASH_BCRYPT = '$2b$';

/**
 * Permite iniciar sesión con la contraseña guardada en texto plano.
 *
 * Por defecto está apagado: una fila insertada a mano en `users` con la clave
 * sin cifrar sería una puerta abierta, y el login la aceptaría sin más. Con el
 * valor en `false` esas cuentas no entran y se les pide restablecer la clave.
 *
 * Se enciende solo durante una ventana de migración controlada: mientras está en
 * `true`, el primer login de cada cuenta heredada cifra su contraseña y la deja
 * migrada. Cuando ya no queden cuentas sin cifrar, se vuelve a apagar.
 */
export const PERMITIR_PASSWORD_PLANO = process.env.PERMITIR_PASSWORD_PLANO === 'true';

// ── Fechas documentales ───────────────────────────────────────────────────
/**
 * Fecha más antigua que se acepta en cualquier campo de fecha del FUID.
 *
 * Es el límite archivístico del proyecto: por debajo de él, una fecha es un
 * error de digitación, no un documento. El registro real más antiguo del fondo
 * es de 1950, así que el margen hasta 1920 es holgado y no excluye nada vigente.
 */
export const FECHA_MINIMA_DOCUMENTAL = '1920-01-01';

// ── Catálogos cerrados del FUID ───────────────────────────────────────────
/**
 * Valores admitidos en los tres campos de lista del formulario FUID.
 *
 * Son la fuente de verdad: `frontend/src/lib/catalogos.ts` los repite para
 * poblar los selectores, y la prueba `catalogos.test.ts` compara ambas listas
 * para que no puedan desincronizarse en silencio. No se comparten por import
 * porque el backend compila con `rootDir: "src"` y sacar el archivo de ahí
 * cambiaría la ruta de `dist/server.js`.
 *
 * `N/A` forma parte del catálogo: es el marcador de campo no diligenciado que
 * usan los registros históricos, no un valor inválido.
 */
export const SOPORTES_VALIDOS = ['N/A', 'CD', 'PLANOS'] as const;
export const FRECUENCIAS_VALIDAS = ['N/A', 'ALTA', 'MEDIA', 'BAJA'] as const;
export const OTROS_VALIDOS = ['N/A', 'A-Z', 'LIBROS', 'BOLSA'] as const;

/**
 * Objeto de la caja: para qué se abrió el trabajo sobre ella.
 *
 * Es una lista cerrada porque solo hay dos procesos y escribirlos a mano dejaba
 * una entrada distinta por caja. Las cajas ya creadas guardan textos libres
 * ("ORGANIZACION Y DESCRIPCION DOCUMENTAL" y otros), así que el catálogo se
 * exige al crear y no al editar: ver `modulosCaja.validator.ts`.
 */
export const OBJETOS_CAJA_VALIDOS = ['TRANSFERENCIA PRIMARIA', 'VALORACION DOCUMENTAL'] as const;

// ── Longitud de las columnas de texto del FUID ────────────────────────────
/**
 * Tamaño declarado en MySQL de cada columna de texto de `fuiddatosreal`, leído
 * de `database/schema.sql`.
 *
 * Sin este tope, un texto más largo que la columna llegaba hasta MySQL y volvía
 * como error 1406 (`Data too long`), que el cliente recibía como un 500 genérico
 * sin saber qué campo recortar. Ahora se rechaza antes, con el nombre del campo.
 *
 * Todas las columnas son `varchar(255)` salvo `historial_y_cambios`, que es
 * `TEXT`. El margen es más ajustado de lo que parece: en producción hay un
 * `asunto` de 253 caracteres, a dos del tope.
 *
 * `frontend/src/lib/limites.ts` repite estos valores para poner `maxLength` en
 * los inputs, y `limites.test.ts` comprueba que ambos mapas coincidan.
 */
export const LONGITUD_MAXIMA_FUID = {
  codigo: 255,
  entidad_remitente: 255,
  entidad_productora: 255,
  unidad_administrativa: 255,
  oficina_productora: 255,
  objeto: 255,
  serie: 255,
  subserie: 255,
  numero_de_orden_interno: 255,
  accionado_procesado: 255,
  accionado_denunciante: 255,
  identificacion: 255,
  asunto: 255,
  radicado: 255,
  numero_doc: 255,
  numero_doc_hasta: 255,
  caja: 255,
  upd: 255,
  tomo: 255,
  otro: 255,
  caja_interna: 255,
  folios: 255,
  soporte: 255,
  frecuencia: 255,
  elaborado_por: 255,
  nro_acta_transferible: 255,
  notas: 255,
  sede: 255,
  cambio_calidad: 255,
  sede_calidad: 255,
  asunto_2: 255,
  asunto_3: 255,
  historial_y_cambios: 65535,
} as const;

/** Nombre legible de cada campo, para que el mensaje de error diga qué recortar. */
export const ETIQUETA_CAMPO_FUID: Record<keyof typeof LONGITUD_MAXIMA_FUID, string> = {
  codigo: 'El código',
  entidad_remitente: 'La entidad remitente',
  entidad_productora: 'La entidad productora',
  unidad_administrativa: 'La unidad administrativa',
  oficina_productora: 'La oficina productora',
  objeto: 'El objeto',
  serie: 'La serie',
  subserie: 'La subserie',
  numero_de_orden_interno: 'El número de orden interno',
  accionado_procesado: 'El accionado/procesado',
  accionado_denunciante: 'El accionado/denunciante',
  identificacion: 'La identificación',
  asunto: 'El asunto',
  radicado: 'El radicado',
  numero_doc: 'El número de documento inicial',
  numero_doc_hasta: 'El número de documento final',
  caja: 'La caja',
  upd: 'El UPD',
  tomo: 'El tomo',
  otro: 'El campo Otro',
  caja_interna: 'La caja interna',
  folios: 'Los folios',
  soporte: 'El soporte',
  frecuencia: 'La frecuencia',
  elaborado_por: 'El campo Elaborado por',
  nro_acta_transferible: 'El número de acta',
  notas: 'Las notas',
  sede: 'La sede',
  cambio_calidad: 'Quién revisó',
  sede_calidad: 'La sede de la revisión',
  asunto_2: 'El asunto automático',
  asunto_3: 'El asunto manual',
  historial_y_cambios: 'El historial de cambios',
};

// ── Campos no diligenciados ───────────────────────────────────────────────
/**
 * Marcador de campo no diligenciado.
 *
 * No es un valor inválido: así están los registros históricos de
 * `fuiddatosreal` (`codigo`, `serie`, `subserie`, `radicado`, `folios` y `notas`
 * lo traen), y los catálogos cerrados lo incluyen como opción.
 */
export const VALOR_NO_DILIGENCIADO = 'N/A';

/**
 * Columnas de texto que se guardan como `N/A` cuando llegan vacías.
 *
 * Regla de digitación: la persona llena lo que el documento tiene y deja en
 * blanco lo que no; al guardar, lo que quedó vacío se registra como `N/A` sin
 * que tenga que escribirlo campo por campo. Antes esa misma ausencia se
 * guardaba como NULL, así que la base representaba de dos formas distintas lo
 * mismo según la época del registro y los reportes tenían que contemplar ambas.
 *
 * Quedan fuera a propósito:
 *
 * - `fecha_del_dato`, `fecha_inicial`, `fecha_final`, `fecha_transferencia`,
 *   `n_orden` y `tiempo`: las columnas son `date`, `int` y `time`, y no admiten
 *   el literal. Siguen viajando como NULL.
 * - `caja`, `upd`, `asunto_2` y `asunto_3`: son obligatorios, nunca pueden
 *   quedar vacíos.
 * - `elaborado_por` y `sede`: los pone el sistema con los datos de quien digita.
 *   `elaborado_por` guarda "NOMBRE (CC)" y los reportes lo cruzan con `users`
 *   por la cédula: un `N/A` ahí rompería ese cruce.
 * - `historial_y_cambios`, `cambio_calidad` y `sede_calidad`: los escribe la
 *   revisión (marcar OK), no el formulario de digitación.
 */
export const CAMPOS_NO_DILIGENCIADOS = [
  'codigo',
  'entidad_remitente',
  'entidad_productora',
  'unidad_administrativa',
  'oficina_productora',
  'objeto',
  'serie',
  'subserie',
  'numero_de_orden_interno',
  'accionado_procesado',
  'accionado_denunciante',
  'identificacion',
  'asunto',
  'radicado',
  'numero_doc',
  'numero_doc_hasta',
  'tomo',
  'otro',
  'caja_interna',
  'folios',
  'soporte',
  'frecuencia',
  'nro_acta_transferible',
  'notas',
] as const;

// ── Paginación ────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

// ── Auditoría ─────────────────────────────────────────────────────────────
export const AUDIT_DETALLE_MAX_LENGTH = 500;

/**
 * En producción el secreto de sesión es obligatorio: un fallback conocido
 * permitiría falsificar cookies de sesión (AUDIT_REPORT.md, app.ts:47).
 */
export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET es obligatorio cuando NODE_ENV=production');
  }
  return 'luci-dev-secret';
}
