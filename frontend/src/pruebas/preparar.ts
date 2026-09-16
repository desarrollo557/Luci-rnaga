import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Preparación común de las pruebas de interfaz.
 *
 * `cleanup` desmonta lo renderizado entre prueba y prueba: sin esto, dos
 * pruebas que pintan el mismo botón encuentran dos, y la consulta falla por
 * ambigüedad en vez de por el fallo real.
 */
afterEach(() => cleanup());

// jsdom no implementa estas dos, y los componentes que se posicionan solos
// (el desplegable, el calendario) las llaman al abrirse.
if (!window.matchMedia) {
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!window.scrollTo) {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
