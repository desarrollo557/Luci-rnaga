import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Building2,
  Factory,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
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
  { label: 'Inventario', to: '/inventario', icon: Package, roles: ['LIDER'] },
  { label: 'Historial', to: '/historial', icon: History, roles: ['LIDER'] },
  { label: 'Mi Panel', to: '/mi-panel', icon: Users, roles: ['TECNICA'] },
];

const ROL_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  LIDER: 'Líder',
  TECNICA: 'Técnica',
  CALIDAD: 'Calidad',
};

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
  );
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.rol));

  const handleLogout = () => {
    void logout();
  };

  const toggleCollapsed = () => setSidebarCollapsed((c) => !c);

  return (
    <div className="flex h-screen overflow-hidden bg-silver-100">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-silver-900 transition-transform duration-200 md:static',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          sidebarCollapsed && 'md:hidden',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-silver-800 px-5">
          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shadow-md shadow-primary-950/40 ring-1 ring-white/10">
            <img
              src="/images/siar.png"
              alt="Logo SIAR"
              className="size-9 rounded-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight tracking-tight text-white">
              Luciérnaga
            </span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-widest text-primary-300">
              Gestión FUID
            </span>
          </div>
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

        {/* Logout en la parte inferior del sidebar */}
        <div className="shrink-0 p-3 border-t border-silver-800">
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              'text-silver-300 hover:bg-silver-800 hover:text-white'
            )}
          >
            <LogOut className="size-5 shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700 md:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </button>

            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden items-center justify-center rounded-lg p-2 text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700 md:inline-flex"
              aria-label={sidebarCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
              title={sidebarCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
          </div>

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
