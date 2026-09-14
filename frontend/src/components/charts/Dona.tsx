import { useState } from 'react';
import { CHROME, conSeparador } from './tokens';

export interface PorcionDona {
  etiqueta: string;
  valor: number;
  color: string;
}

export interface DonaProps {
  porciones: PorcionDona[];
  /** Texto grande en el centro; por defecto, el total. */
  centroValor?: string;
  centroEtiqueta?: string;
  tamano?: number;
}

const GROSOR = 22;

/**
 * Parte-todo con un hueco central que aloja el total. Cada arco deja 2 px de
 * superficie con el siguiente, que es lo que los separa (nunca un borde).
 */
export function Dona({ porciones, centroValor, centroEtiqueta, tamano = 180 }: DonaProps) {
  const [activo, setActivo] = useState<string | null>(null);
  const total = porciones.reduce((acc, p) => acc + p.valor, 0);

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-silver-500">Sin datos para mostrar.</p>;
  }

  const radio = tamano / 2;
  const radioMedio = radio - GROSOR / 2;
  const circunferencia = 2 * Math.PI * radioMedio;
  const separacion = 2;

  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
        <svg width={tamano} height={tamano} role="img" aria-label="Distribución por estado">
          <g transform={`rotate(-90 ${radio} ${radio})`}>
            {porciones.map((p) => {
              const fraccion = p.valor / total;
              const largo = Math.max(fraccion * circunferencia - separacion, 0);
              const offset = -acumulado * circunferencia;
              acumulado += fraccion;
              return (
                <circle
                  key={p.etiqueta}
                  cx={radio}
                  cy={radio}
                  r={radioMedio}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={GROSOR}
                  strokeDasharray={`${largo} ${circunferencia - largo}`}
                  strokeDashoffset={offset}
                  opacity={activo && activo !== p.etiqueta ? 0.45 : 1}
                  onMouseEnter={() => setActivo(p.etiqueta)}
                  onMouseLeave={() => setActivo(null)}
                  className="cursor-default transition-opacity duration-200"
                />
              );
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-silver-900">
            {centroValor ?? conSeparador(total)}
          </span>
          {centroEtiqueta && (
            <span className="text-[11px] uppercase tracking-wide" style={{ color: CHROME.tintaTenue }}>
              {centroEtiqueta}
            </span>
          )}
        </div>
      </div>

      <ul className="min-w-0 space-y-2">
        {porciones.map((p) => (
          <li
            key={p.etiqueta}
            className="flex items-center gap-2.5 text-sm"
            onMouseEnter={() => setActivo(p.etiqueta)}
            onMouseLeave={() => setActivo(null)}
          >
            <span className="block size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="min-w-0 flex-1 truncate text-silver-600">{p.etiqueta}</span>
            <span
              className="font-semibold text-silver-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {conSeparador(p.valor)}
            </span>
            <span className="w-11 text-right text-xs text-silver-500">
              {Math.round((p.valor / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
