import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Building2,
  Factory,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Administración', to: '/admin', icon: LayoutDashboard, roles: ['ADMIN'] },
  { label: 'Clientes', to: '/clientes', icon: Building2, roles: ['LIDER', 'TECNICA', 'CALIDAD'] },
  { label: 'Producción', to: '/produccion', icon: Factory, roles: ['LIDER', 'CALIDAD'] },
  { label: 'Inventario', to: '/inventario', icon: Package, roles: ['LIDER', 'CALIDAD'] },
  { label: 'Historial', to: '/historial', icon: History, roles: ['LIDER', 'CALIDAD'] },
];

const ROL_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  LIDER: 'Líder',
  TECNICA: 'Técnica',
  CALIDAD: 'Calidad',
};

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.rol));

  const handleLogout = () => {
    void logout();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-silver-100">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-silver-900 transition-transform duration-200 md:static md:transilver-x-0',
          sidebarOpen ? 'transilver-x-0' : '-transilver-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-silver-800 px-5">
          <img
            src="/images/logo-luciernaga.png"
            alt="Logo Luciérnaga"
            className="size-10 object-contain"
          />
          <span className="text-lg font-bold text-white">Luciérnaga</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-silver-400 transition-colors hover:bg-silver-800 hover:text-white md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-silver-300 hover:bg-silver-800 hover:text-white',
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-silver-900/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-silver-200 bg-white px-4 md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700 md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-silver-800">{user.nombre}</p>
              <p className="text-xs leading-tight text-silver-500">C.C. {user.cc}</p>
            </div>
            <Badge color="red">{ROL_LABEL[user.rol]}</Badge>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-silver-200 px-3 py-2 text-sm font-medium text-silver-600 transition-colors hover:bg-silver-50 hover:text-silver-900"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}