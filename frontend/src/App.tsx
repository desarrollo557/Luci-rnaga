import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Spinner } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { rolesDe, tieneAlgunRol, tieneRol, type Role } from '@/types';
import ActasPage from '@/pages/ActasPage';
import AdminPage from '@/pages/AdminPage';
import CajasPage from '@/pages/CajasPage';
import ClientesPage from '@/pages/ClientesPage';
import DatosPage from '@/pages/DatosPage';
import HistorialPage from '@/pages/HistorialPage';
import InventarioPage from '@/pages/InventarioPage';
import Login from '@/pages/Login';
import ProduccionPage from '@/pages/ProduccionPage';
import RevisionPage from '@/pages/RevisionPage';
import TecnicaDashboardPage from '@/pages/TecnicaDashboardPage';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="size-8 text-primary-600" />
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const administra = tieneRol(user, 'ADMIN');
  const isAdminRoute = location.pathname.startsWith('/admin');

  /*
   * Quien solo administra no tiene nada que hacer fuera de Administración, así
   * que se le lleva allí. Pero una cuenta que además es líder sí trabaja en el
   * resto del sistema: antes esta redirección la sacaba de cualquier pantalla y
   * la devolvía a /admin una y otra vez, que es lo que obligaba a tener dos
   * cuentas para la misma persona.
   */
  const soloAdministra = administra && rolesDe(user).length === 1;
  if (soloAdministra && !isAdminRoute) return <Navigate to="/admin" replace />;
  if (!administra && isAdminRoute) return <Navigate to="/clientes" replace />;

  // Guarda de ruta por perfil: la página se renderiza si alguno de los perfiles
  // de la cuenta tiene permiso.
  const roleRestrictedRoutes: Record<string, Role[]> = {
    '/produccion': ['LIDER'],
    '/inventario': ['LIDER'],
    '/historial': ['LIDER'],
  };
  const allowedRoles = Object.entries(roleRestrictedRoutes).find(([path]) =>
    location.pathname.startsWith(path),
  )?.[1];
  if (allowedRoles && !tieneAlgunRol(user, allowedRoles)) {
    return <Navigate to="/clientes" replace />;
  }

  return <AppLayout />;
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    // Se invoca UNA vez al montar la app, sin depender de la referencia de la
    // acción del store (evita re-disparos en cadena por re-render).
    void useAuthStore.getState().fetchCurrentUser();
  }, []);

  if (loading) {
    return <FullPageLoader />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id/actas" element={<ActasPage />} />
        <Route path="/clientes/:id/actas/:mid/cajas" element={<CajasPage />} />
        <Route path="/cajas/:cajaId/datos" element={<DatosPage />} />
        <Route path="/cajas/:cajaId/revision" element={<RevisionPage />} />
        <Route path="/produccion" element={<ProduccionPage />} />
        <Route path="/inventario" element={<InventarioPage />} />
        <Route path="/historial" element={<HistorialPage />} />
        <Route path="/mi-panel" element={<TecnicaDashboardPage />} />
      </Route>
      <Route
        path="*"
        element={
          <Navigate
            to={!user ? '/login' : rolesDe(user).length === 1 && user.rol === 'ADMIN' ? '/admin' : '/clientes'}
            replace
          />
        }
      />
    </Routes>
  );
}