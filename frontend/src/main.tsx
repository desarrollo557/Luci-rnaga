import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import { toastApiError } from './lib/feedback';
import { useThemeStore } from './stores/themeStore';
import './index.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Error global de consultas: toda API que falle muestra el error específico
    // en un mensaje flotante, sin necesidad de manejarlo página por página.
    onError: (error) => toastApiError(error),
  }),
  mutationCache: new MutationCache({
    // Red de seguridad para las mutaciones que no manejan su propio error. Las
    // que sí lo hacen —guardar un FUID, eliminarlo, asignar cajas— ya avisan
    // con el mensaje que corresponde a esa acción, y llamarlo también aquí
    // sacaba el mismo error dos veces, uno encima del otro.
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return;
      toastApiError(error);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
});

/** Los avisos flotantes traen su propia paleta, así que siguen al tema activo. */
function ToasterTematizado() {
  const theme = useThemeStore((state) => state.resolved);
  return <Toaster position="top-right" richColors theme={theme} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ToasterTematizado />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);