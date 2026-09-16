import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Lint acotado a las reglas de los hooks de React.
 *
 * Existe por un incidente concreto: se añadieron cuatro `useState` debajo del
 * `return` con el que la pantalla de Producción espera a que carguen las cifras.
 * En el primer render se ejecutaba un hook y en el segundo cinco, React abortaba
 * con el error 310 y la pantalla quedaba en blanco. Ni el typecheck, ni las
 * pruebas, ni el build lo veían: es un error que solo existe en ejecución.
 *
 * **Deliberadamente no es un lint de estilo.** No hay reglas de comillas, de
 * orden de importaciones ni de complejidad: un lint que se queja de cien cosas
 * irrelevantes acaba silenciado, y con él se va la única regla que aquí importa.
 * Si algún día se quiere un lint completo, esa es una decisión aparte.
 *
 * - `rules-of-hooks` es error: un hook condicional es un fallo en ejecución.
 * - `exhaustive-deps` es aviso: sus falsos positivos son frecuentes y un
 *   incumplimiento suyo da datos viejos, no una pantalla caída.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
