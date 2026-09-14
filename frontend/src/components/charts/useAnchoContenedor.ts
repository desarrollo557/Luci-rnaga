import { useEffect, useRef, useState } from 'react';

/**
 * Mide el ancho disponible del contenedor para dibujar el SVG en píxeles reales.
 * Escalar un viewBox deformaría la tipografía de los ejes.
 */
export function useAnchoContenedor<T extends HTMLElement>(anchoInicial = 640) {
  const ref = useRef<T | null>(null);
  const [ancho, setAncho] = useState(anchoInicial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width;
      if (w && w > 0) setAncho(w);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return { ref, ancho };
}
