import type { QueryClient } from '@tanstack/react-query';

export type Domain =
  | 'users'
  | 'modulos-cliente'
  | 'modulos-caja'
  | 'fuiddatosreal'
  | 'inventario'
  | 'sub-modulos';

const DEPENDENCIES: Record<Domain, string[]> = {
  // user CRUD + user-to-caja/module assignments touch both user lists and assigned lists
  users: ['users', 'modulos-caja', 'modulos-cliente'],
  'modulos-cliente': ['modulos-cliente', 'modulos-caja', 'inventario', 'produccion'],
  'modulos-caja': ['modulos-caja', 'fuiddatosreal', 'historial', 'produccion', 'inventario', 'modulos-cliente'],
  fuiddatosreal: ['fuiddatosreal', 'historial', 'produccion', 'modulos-caja'],
  inventario: ['inventario', 'produccion'],
  'sub-modulos': ['sub-modulos', 'modulos-cliente'],
};

export function invalidateDomain(queryClient: QueryClient, domain: Domain): void {
  for (const key of DEPENDENCIES[domain]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}