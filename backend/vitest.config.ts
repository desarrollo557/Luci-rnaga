import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Las pruebas de catálogos y límites leen los archivos espejo del frontend,
    // que está fuera de esta carpeta; sin esto, Vite no los deja importar.
    server: { deps: { inline: true } },
    /*
     * Margen de sobra para las pruebas que levantan PostgreSQL.
     *
     * Varias arrancan una base en memoria, y con la suite entera corriendo en
     * paralelo cada una tarda varios segundos en vez de uno. Con el límite por
     * defecto de cinco segundos fallaban solo al ejecutar todo junto, nunca al
     * ejecutar su archivo: el peor tipo de prueba floja, porque parece un fallo
     * del código y no lo es.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    // El código fuente importa con extensión `.js` porque compila a ESM
    // (`module: NodeNext`). En las pruebas esos archivos siguen siendo `.ts`, así
    // que hay que resolverlos aquí o ningún import interno funciona.
    extensions: ['.ts', '.js', '.json'],
  },
});
