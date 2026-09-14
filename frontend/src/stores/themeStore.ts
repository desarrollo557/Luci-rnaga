import { create } from 'zustand';

/**
 * Tema de la interfaz.
 *
 * `system` sigue la preferencia del sistema operativo y es el valor por defecto:
 * quien no elige nada ve la app en el modo en el que ya trabaja el resto del día.
 *
 * El tema real lo aplica `applyTheme` poniendo la clase `.dark` en <html>, que es
 * la que dispara toda la paleta oscura definida en `index.css`. El primer pintado
 * lo resuelve el script de arranque de `index.html` para que no haya destello
 * blanco antes de que React monte.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

/** Debe coincidir con la clave que lee el script de arranque de index.html. */
const STORAGE_KEY = 'luci-theme';

/** Orden en que el botón de tema recorre los modos. */
export const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system'];

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  system: 'Según el sistema',
};

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // El navegador puede tener el almacenamiento bloqueado; se usa el valor por defecto.
  }
  return 'system';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return mode;
}

let limpiarTransicion: ReturnType<typeof setTimeout> | undefined;

/**
 * Aplica el tema al documento. `animar` activa el fundido de colores; se omite
 * en el arranque para que la primera pintura sea instantánea.
 */
function applyTheme(mode: ThemeMode, animar: boolean): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;

  if (animar) {
    root.classList.add('theme-switching');
    clearTimeout(limpiarTransicion);
    limpiarTransicion = setTimeout(() => root.classList.remove('theme-switching'), 300);
  }

  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  return resolved;
}

interface ThemeState {
  mode: ThemeMode;
  /** Tema efectivo una vez resuelto `system`. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Avanza al siguiente modo del ciclo claro → oscuro → sistema. */
  cycle: () => void;
}

const modoInicial = readStoredMode();

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: modoInicial,
  resolved: resolveTheme(modoInicial),
  setMode: (mode) => {
    const resolved = applyTheme(mode, true);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Sin persistencia el tema dura lo que la pestaña; no es motivo de error.
    }
    set({ mode, resolved });
  },
  cycle: () => {
    const actual = get().mode;
    const siguiente = THEME_CYCLE[(THEME_CYCLE.indexOf(actual) + 1) % THEME_CYCLE.length];
    get().setMode(siguiente);
  },
}));

// Sincroniza el tema con el sistema mientras el modo sea `system`.
if (typeof window !== 'undefined' && window.matchMedia) {
  const consulta = window.matchMedia('(prefers-color-scheme: dark)');
  consulta.addEventListener('change', () => {
    const { mode } = useThemeStore.getState();
    if (mode !== 'system') return;
    useThemeStore.setState({ resolved: applyTheme('system', true) });
  });
}

// El script de arranque ya dejó la clase puesta; esto solo alinea el estado del
// store con el documento si algo (otra pestaña, un fallo de storage) lo movió.
if (typeof document !== 'undefined') {
  applyTheme(modoInicial, false);
}
