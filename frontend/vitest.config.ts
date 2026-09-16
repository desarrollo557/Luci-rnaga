import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Pruebas de la interfaz.
 *
 * Van en un archivo aparte de `vite.config.ts` para no arrastrar el proxy ni el
 * plugin de Tailwind, que no pintan nada en un entorno de pruebas. El DOM lo
 * pone jsdom: las pruebas comprueban lo que ve y pulsa quien usa el software,
 * no las clases de CSS.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/preparar.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
