import { useEffect, useState, type FormEvent } from 'react';
import { IdCard, LockKeyhole, MapPin, ShieldCheck, Sparkles, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Select, type SelectOption } from '@/components/ui';
import { authApi } from '@/lib/api';
import { toastApiError } from '@/lib/feedback';
import { onlyDigits } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';
import { ROLES, type Role } from '@/types';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  LIDER: 'Líder',
  TECNICA: 'Técnica',
  CALIDAD: 'Calidad',
};

const ROL_OPTIONS: SelectOption[] = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

const SEDE_OPTIONS: SelectOption[] = [
  { value: 'Barranquilla', label: 'Barranquilla' },
  { value: 'Santa Marta', label: 'Santa Marta' },
  { value: 'Bogotá', label: 'Bogotá' },
];

export default function Login() {
  const [cc, setCc] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [rol, setRol] = useState('');
  const [sede, setSede] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // App ya consulta /currentUser al montar; aquí solo se redirige si ya hay
  // sesión activa. NO se vuelve a llamar a fetchCurrentUser (era la fuente
  // de la llamada duplicada en cadena con el store).
  useEffect(() => {
    const current = useAuthStore.getState().user;
    if (current) {
      window.location.href = current.rol === 'ADMIN' ? '/admin' : '/clientes';
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cctrim = cc.trim();
    const ccError = cctrim === '' ? 'La cédula es requerida' : onlyDigits(cctrim, 'La cédula');
    if (ccError) {
      toast.error(ccError);
      return;
    }
    if (contrasena === '') {
      toast.error('La contraseña es requerida');
      return;
    }
    if (rol === '') {
      toast.error('Seleccione su rol');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await authApi.login(cctrim, contrasena, rol);
      if (data.success && data.redirect) {
        localStorage.setItem('redirect', data.redirect);
        window.location.href = data.redirect;
        return;
      }
      toast.error(data.message ?? 'Credenciales inválidas');
    } catch (error) {
      toastApiError(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary-800 via-primary-600 to-silver-900 p-4">
      {/* Blobs decorativos de la paleta */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-primary-500/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-[28rem] rounded-full bg-silver-300/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 size-72 -translate-y-1/2 rounded-full bg-primary-400/20 blur-3xl" />
        <div className="absolute bottom-8 left-1/4 size-56 rounded-full bg-silver-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-primary-950/40 ring-1 ring-silver-900/5 md:grid-cols-2">
        {/* Panel de marca (desktop) */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-silver-900 p-10 text-white md:flex">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-24 -left-12 size-64 rounded-full bg-primary-400/20 blur-2xl" />
          </div>
          <div className="relative flex items-center gap-3">
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-full bg-white p-1 shadow-lg shadow-primary-950/30">
              <img src="/images/siar.png" alt="Logo SIAR" className="size-10 rounded-full object-cover" />
            </div>
            <span className="text-xl font-bold tracking-tight">Luciérnaga</span>
          </div>
          <div className="relative">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
              <Sparkles className="size-3.5" />
              Plataforma de gestión documental
            </p>
            <h1 className="text-3xl font-bold leading-tight">
              Gestión de procesos
              <br />y control documental
            </h1>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/80">
              Registro técnico, evaluación de calidad y seguimiento de proyectos en un solo lugar.
            </p>
          </div>
          <p className="relative text-xs text-white/60">Sistema de gestión FUID · v2.0</p>
        </div>

        {/* Panel del formulario */}
        <div className="p-8 md:p-12">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-600 to-primary-800 shadow-lg shadow-primary-600/30 ring-4 ring-primary-50">
                <img src="/images/siar.png" alt="Logo SIAR" className="size-14 rounded-full object-cover" />
              </div>
              <div aria-hidden="true" className="absolute -inset-1 -z-10 rounded-full bg-primary-100/60 blur-lg" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-silver-900">Bienvenido de nuevo</h2>
            <p className="mt-1 text-sm text-silver-500">Ingresa tus credenciales para acceder al sistema</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-cc" className="mb-1 block text-sm font-medium text-silver-700">
                Cédula
              </label>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
                <Input
                  id="login-cc"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="Número de cédula"
                  autoComplete="username"
                  inputMode="numeric"
                  autoFocus
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-contrasena" className="mb-1 block text-sm font-medium text-silver-700">
                Contraseña
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
                <Input
                  id="login-contrasena"
                  type={showPassword ? 'text' : 'password'}
                  value={contrasena}
                  onChange={(event) => setContrasena(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600 transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="login-rol" className="mb-1 block text-sm font-medium text-silver-700">
                Rol
              </label>
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
                <Select
                  id="login-rol"
                  options={ROL_OPTIONS}
                  value={rol}
                  onChange={setRol}
                  placeholder="Seleccione su rol"
                  required
                  className="[&_button]:pl-10"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-sede" className="mb-1 block text-sm font-medium text-silver-700">
                Sede
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
                <Select
                  id="login-sede"
                  options={SEDE_OPTIONS}
                  value={sede}
                  onChange={setSede}
                  placeholder="Seleccione su sede"
                  className="[&_button]:pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-silver-200" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-silver-400">
                Acceso seguro
              </span>
              <div className="h-px flex-1 bg-silver-200" />
            </div>
            <Button type="submit" className="w-full" loading={submitting}>
              Iniciar sesión
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-silver-400">
            © {new Date().getFullYear()} Luciérnaga · Acceso autorizado
          </p>
        </div>
      </div>
    </div>
  );
}
