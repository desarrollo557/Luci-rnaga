import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface AccionDeMenu {
  /** Texto de la opción. Es lo que lee quien la usa, así que va en palabras. */
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Tiñe la opción de rojo. Para lo que borra. */
  peligrosa?: boolean;
}

export interface MenuDeAccionesProps {
  acciones: AccionDeMenu[];
  /** Para lectores de pantalla; por defecto, "Más acciones". */
  label?: string;
  className?: string;
}

/**
 * Menú de acciones secundarias de una fila.
 *
 * Existe porque una fila con seis iconos seguidos no tiene jerarquía: lo que se
 * usa todos los días y lo que se usa una vez al mes pesan lo mismo, y ninguno
 * dice qué hace hasta que se pasa el ratón por encima. Aquí se recogen las
 * secundarias, con su nombre escrito.
 *
 * El panel se dibuja en un portal y se coloca a mano sobre la posición del botón.
 * Dentro de una tabla con desplazamiento, un menú en flujo normal queda recortado
 * por el contenedor; es el mismo motivo por el que `Select` y `DatePicker` de
 * este proyecto también van en portal.
 */
export function MenuDeAcciones({ acciones, label = 'Más acciones', className }: MenuDeAccionesProps) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const colocar = () => {
    const boton = botonRef.current;
    if (!boton) return;
    const caja = boton.getBoundingClientRect();
    const ANCHO = 208;
    // Alineado por la derecha con el botón, y sin salirse por el borde izquierdo.
    setPosicion({ top: caja.bottom + 6, left: Math.max(8, caja.right - ANCHO) });
  };

  useEffect(() => {
    if (!abierto) return;

    const fuera = (evento: MouseEvent) => {
      const destino = evento.target as Node;
      if (panelRef.current?.contains(destino) || botonRef.current?.contains(destino)) return;
      setAbierto(false);
    };
    const conEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };
    // Al desplazar o redimensionar, el botón se mueve y el panel se quedaría
    // flotando donde estaba: se cierra, que es menos molesto que perseguirlo.
    const cerrar = () => setAbierto(false);

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', conEscape);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', conEscape);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  const alternar = () => {
    if (!abierto) colocar();
    setAbierto((previo) => !previo);
  };

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? menuId : undefined}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-lg text-silver-500 transition-colors hover:bg-silver-100 hover:text-silver-700',
          abierto && 'bg-silver-100 text-silver-700',
          className,
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>

      {abierto &&
        posicion &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            style={{ top: posicion.top, left: posicion.left }}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-silver-200 bg-surface py-1 shadow-lg"
          >
            {acciones.map((accion) => (
              <button
                key={accion.label}
                type="button"
                role="menuitem"
                disabled={accion.disabled}
                onClick={() => {
                  setAbierto(false);
                  accion.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  accion.peligrosa ? 'text-red-600 hover:bg-red-50' : 'text-silver-700 hover:bg-silver-50',
                  accion.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                )}
              >
                {accion.icon}
                {accion.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
