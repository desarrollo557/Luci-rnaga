import type { QueryClient } from '@tanstack/react-query';

export type Domain =
  | 'users'
  | 'modulos-cliente'
  | 'modulos-caja'
  | 'fuiddatosreal'
  | 'inventario'
  | 'sub-modulos';

/**
 * Qué se queda viejo cuando cambia cada cosa.
 *
 * La lista de cada dominio se invalida entera al tocarlo. Olvidar una entrada no
 * rompe nada visible: simplemente una pantalla sigue mostrando datos de hace un
 * rato y nadie entiende por qué. Es el fallo más silencioso de esta capa.
 *
 * `inventario` cuelga de `fuiddatosreal` porque el inventario cuenta registros:
 * cada FUID que entra o sale cambia su cifra de trabajo sin reflejar y la marca
 * de las actas del árbol. Faltaba, y por eso había que recargar la página para
 * ver el efecto de un registro recién guardado.
 */
const DEPENDENCIES: Record<Domain, string[]> = {
  // El alta de usuarios y su asignación a cajas tocan las listas de personas y
  // las de lo que tienen asignado.
  users: ['users', 'modulos-caja', 'modulos-cliente'],
  'modulos-cliente': ['modulos-cliente', 'modulos-caja', 'inventario', 'produccion'],
  'modulos-caja': ['modulos-caja', 'fuiddatosreal', 'historial', 'produccion', 'inventario', 'modulos-cliente'],
  fuiddatosreal: ['fuiddatosreal', 'historial', 'produccion', 'modulos-caja', 'inventario', 'inventario-fuid'],
  inventario: ['inventario', 'inventario-fuid', 'produccion'],
  'sub-modulos': ['sub-modulos', 'modulos-cliente', 'inventario'],
};

export function invalidateDomain(queryClient: QueryClient, domain: Domain): void {
  for (const key of DEPENDENCIES[domain]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}