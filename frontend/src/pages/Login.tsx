import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function Login() {
  const [cc, setCc] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    if (!cc.trim() || !contrasena) {
      toast.error('Ingresa tu cédula y contraseña');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await authApi.login(cc.trim(), contrasena);
      if (data.success && data.redirect) {
        localStorage.setItem('redirect', data.redirect);
        window.location.href = data.redirect;
        return;
      }
      toast.error(data.message ?? 'Credenciales inválidas');
    } catch {
      toast.error('Error de conexión. Inténtalo de nuevo.');
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
      </div>

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2">
        {/* Panel de marca (desktop) */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-primary-700 via-primary-600 to-silver-900 p-10 text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-white p-1.5 shadow-md">
              <img src="/images/siar.png" alt="Logo SIAR" className="size-9 object-contain" />
            </div>
            <span className="text-xl font-bold">Luciérnaga</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight">
              Gestión de procesos
              <br />y control documental
            </h1>
            <p className="mt-3 text-sm text-white/80">
              Registro técnico, evaluación de calidad y seguimiento de proyectos en un solo lugar.
            </p>
          </div>
          <p className="text-xs text-white/60">Sistema de gestión FUID · v2.0</p>
        </div>

        {/* Panel del formulario */}
        <div className="p-8 md:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex size-24 items-center justify-center rounded-full bg-silver-100 ring-4 ring-primary-100">
              <img src="/images/siar.png" alt="Logo SIAR" className="size-16 object-contain" />
            </div>
            <h2 className="text-2xl font-bold text-silver-900">Bienvenido</h2>
            <p className="mt-1 text-sm text-silver-500">Ingresa con tus credenciales para continuar</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Cédula"
              value={cc}
              onChange={(event) => setCc(event.target.value)}
              placeholder="Número de cédula"
              autoComplete="username"
              inputMode="numeric"
              autoFocus
              required
            />
            <Input
              label="Contraseña"
              type="password"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <Button type="submit" className="w-full" loading={submitting}>
              Iniciar sesión
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-silver-400">
            © {new Date().getFullYear()} Luciérnaga · Acceso autorizado
          </p>
        </div>
      </div>
    </div>
  );
}