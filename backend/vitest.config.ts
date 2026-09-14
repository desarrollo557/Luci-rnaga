import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Las pruebas de catálogos y límites leen los archivos espejo del frontend,
    // que está fuera de esta carpeta; sin esto, Vite no los deja importar.
    server: { deps: { inline: true } },
  },
  resolve: {
    // El código fuente importa con extensión `.js` porque compila a ESM
    // (`module: NodeNext`). En las pruebas esos archivos siguen siendo `.ts`, así
    // que hay que resolverlos aquí o ningún import interno funciona.
    extensions: ['.ts', '.js', '.json'],
  },
});
