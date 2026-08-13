import { create } from 'zustand';
import api from '@/lib/api';
import type { SessionUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  setUser: (user: SessionUser | null) => void;
  setLoading: (loading: boolean) => void;
  fetchCurrentUser: () => Promise<void>;
  logout: () => Promise<void>;
}

// Guard de idempotencia: evita llamadas concurrentes/duplicadas a /currentUser
// (StrictMode monta los efectos dos veces y App + Login lo invocaban en cadena).
let fetching = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  fetchCurrentUser: async () => {
    if (fetching) return;
    fetching = true;
    set({ loading: true });
    try {
      const { data } = await api.get<SessionUser>('/currentUser');
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    } finally {
      fetching = false;
    }
  },
  logout: async () => {
    try {
      await api.post('/logout');
    } finally {
      set({ user: null });
      window.location.href = '/login';
    }
  },
}));