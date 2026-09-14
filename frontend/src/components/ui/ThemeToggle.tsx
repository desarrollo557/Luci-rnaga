import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { THEME_LABEL, useThemeStore, type ThemeMode } from '@/stores/themeStore';

const ICONO: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const SIGUIENTE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

export interface ThemeToggleProps {
  className?: string;
  /**
   * `superficie` para cabeceras y tarjetas; `sobre-oscuro` para la barra lateral;
   * `sobre-marca` para fondos rojos de identidad, como la portada del login.
   */
  tono?: 'superficie' | 'sobre-oscuro' | 'sobre-marca';
}

/**
 * Alterna claro → oscuro → sistema. Se muestra el icono del modo activo, y el
 * título anuncia a dónde lleva la siguiente pulsación para que no haya que
 * adivinar el ciclo.
 */
export function ThemeToggle({ className, tono = 'superficie' }: ThemeToggleProps) {
  const mode = useThemeStore((s) => s.mode);
  const resolved = useThemeStore((s) => s.resolved);
  const cycle = useThemeStore((s) => s.cycle);

  const Icon = ICONO[mode];
  const descripcionActual =
    mode === 'system' ? `${THEME_LABEL.system} (${resolved === 'dark' ? 'oscuro' : 'claro'})` : THEME_LABEL[mode];

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${descripcionActual} · cambiar a ${THEME_LABEL[SIGUIENTE[mode]].toLowerCase()}`}
      aria-label={`Cambiar tema. Actualmente: ${descripcionActual}`}
      className={cn(
        'group relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-95',
        tono === 'superficie' &&
          'border border-silver-200 text-silver-500 hover:border-silver-300 hover:bg-silver-50 hover:text-silver-800 focus-visible:ring-offset-surface',
        tono === 'sobre-oscuro' &&
          'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:ring-offset-sidebar',
        tono === 'sobre-marca' &&
          'text-white/80 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/15 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0',
        className,
      )}
    >
      <Icon className="size-[18px] transition-transform duration-300 ease-out group-hover:rotate-12 group-active:scale-90" />
    </button>
  );
}
