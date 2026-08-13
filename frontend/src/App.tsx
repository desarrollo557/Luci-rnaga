import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Spinner } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
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

  const isAdmin = user.rol === 'ADMIN';
  const isAdminRoute = location.pathname.startsWith('/admin');

  if (isAdmin && !isAdminRoute) return <Navigate to="/admin" replace />;
  if (!isAdmin && isAdminRoute) return <Navigate to="/clientes" replace />;

  return <AppLayout />;
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser);

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

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
      </Route>
      <Route
        path="*"
        element={<Navigate to={!user ? '/login' : user.rol === 'ADMIN' ? '/admin' : '/clientes'} replace />}
      />
    </Routes>
  );
}