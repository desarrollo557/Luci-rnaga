import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function Login() {
  const [cc, setCc] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      let current = useAuthStore.getState().user;
      if (!current) {
        await fetchCurrentUser();
        current = useAuthStore.getState().user;
      }
      if (active && current) {
        window.location.href = current.rol === 'ADMIN' ? '/admin' : '/clientes';
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, [fetchCurrentUser]);

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-600 via-primary-500 to-amber-400 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center">
          <img
            src="/images/logo-luciernaga.png"
            alt="Logo Luciérnaga"
            className="mb-4 size-20 object-contain"
          />
          <h1 className="text-2xl font-bold text-slate-900">Luciérnaga</h1>
          <p className="mt-1 text-sm text-slate-500">Sistema de gestión FUID</p>
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
      </div>
    </div>
  );
}