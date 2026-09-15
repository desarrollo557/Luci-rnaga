/**
 * Catálogos cerrados del formulario FUID.
 *
 * FUENTE DE VERDAD: `backend/src/config/constants.ts`. El backend es quien
 * rechaza un valor fuera de lista; esto solo puebla los desplegables.
 *
 * Están repetidos aquí y no importados porque el backend compila con
 * `rootDir: "src"`: mover el archivo a una carpeta compartida cambiaría la ruta
 * de `dist/server.js` y con ella el arranque en producción. Para que la copia no
 * se desincronice en silencio, `backend/src/validators/__tests__/catalogos.test.ts`
 * lee este archivo y compara las tres listas; si alguien edita una sola, el CI
 * falla.
 *
 * `N/A` forma parte del catálogo: es el marcador de campo no diligenciado.
 */
export const OPCIONES_SOPORTE = ['N/A', 'CD', 'PLANOS'] as const;
export const OPCIONES_FRECUENCIA = ['N/A', 'ALTA', 'MEDIA', 'BAJA'] as const;
export const OPCIONES_OTRO = ['N/A', 'A-Z', 'LIBROS', 'BOLSA'] as const;

/**
 * Objeto de la caja, en el formulario de caja.
 *
 * A diferencia de los tres de arriba, aquí `N/A` no es una opción del
 * desplegable: dejarlo sin elegir es lo que lo guarda como no diligenciado.
 */
export const OPCIONES_OBJETO_CAJA = ['TRANSFERENCIA PRIMARIA', 'VALORACION DOCUMENTAL'] as const;
