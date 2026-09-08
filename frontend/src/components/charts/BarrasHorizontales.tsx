import { useState } from 'react';
import { conSeparador } from './tokens';

export interface BarraDato {
  etiqueta: string;
  valor: number;
  /**
   * Porción del total ya completada. Cuando se indica, la barra se apila:
   * un segmento para la parte completada y otro para lo que resta.
   */
  parcial?: number;
}

export interface BarrasHorizontalesProps {
  datos: BarraDato[];
  /** Color del segmento restante (o de la barra completa si no hay `parcial`). */
  color: string;
  /** Color del segmento completado. Al haber dos series, la leyenda es obligatoria. */
  colorParcial?: string;
  formatoValor?: (n: number) => string;
  anchoEtiqueta?: number;
  /** Descripción de cada segmento para el texto emergente. */
  nombreParcial?: string;
  nombreResto?: string;
}

const ALTO_BARRA = 20;
/** Separación en superficie que distingue los segmentos; nunca un borde. */
const HUECO = 2;

/**
 * Barras horizontales para comparar magnitudes entre categorías de nombre largo.
 *
 * El valor va rotulado en la punta: la guía de color exige rótulos visibles
 * porque los rellenos quedan por debajo de 3:1 sobre blanco.
 */
export function BarrasHorizontales({
  datos,
  color,
  colorParcial,
  formatoValor = conSeparador,
  anchoEtiqueta = 120,
  nombreParcial = 'completado',
  nombreResto = 'restante',
}: BarrasHorizontalesProps) {
  const [activo, setActivo] = useState<string | null>(null);

  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-silver-500">Sin datos para mostrar.</p>;
  }

  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  const apilada = colorParcial != null;

  return (
    <ul className="space-y-3">
      {datos.map((d) => {
        const anchoTotal = (d.valor / maximo) * 100;
        const completado = Math.min(d.parcial ?? 0, d.valor);
        const resto = d.valor - completado;
        const anchoCompletado = (completado / maximo) * 100;
        const resaltado = activo === d.etiqueta;

        const titulo = apilada
          ? `${d.etiqueta}: ${formatoValor(completado)} ${nombreParcial}, ${formatoValor(resto)} ${nombreResto} (total ${formatoValor(d.valor)})`
          : `${d.etiqueta}: ${formatoValor(d.valor)}`;

        return (
          <li
            key={d.etiqueta}
            className="flex items-center gap-3 text-sm"
            onMouseEnter={() => setActivo(d.etiqueta)}
            onMouseLeave={() => setActivo(null)}
            onFocus={() => setActivo(d.etiqueta)}
            onBlur={() => setActivo(null)}
            tabIndex={0}
            title={titulo}
          >
            <span
              className="shrink-0 truncate text-xs font-medium text-silver-600"
              style={{ width: anchoEtiqueta }}
              title={d.etiqueta}
            >
              {d.etiqueta}
            </span>

            <div className="min-w-0 flex-1" style={{ height: ALTO_BARRA }}>
              <div
                className="flex h-full transition-opacity duration-200"
                style={{ width: `${Math.max(anchoTotal, 0.5)}%`, opacity: resaltado ? 1 : 0.9 }}
              >
                {apilada && completado > 0 && (
                  <div
                    className="h-full shrink-0 rounded-l-[4px]"
                    style={{
                      width: `${(anchoCompletado / anchoTotal) * 100}%`,
                      backgroundColor: colorParcial,
                      marginRight: resto > 0 ? HUECO : 0,
                    }}
                  />
                )}
                {resto > 0 && (
                  <div
                    className="h-full min-w-0 flex-1 rounded-r-[4px]"
                    style={{
                      backgroundColor: color,
                      borderTopLeftRadius: apilada && completado > 0 ? 0 : 4,
                      borderBottomLeftRadius: apilada && completado > 0 ? 0 : 4,
                    }}
                  />
                )}
              </div>
            </div>

            <span
              className="w-20 shrink-0 text-right text-xs font-semibold text-silver-800"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatoValor(d.valor)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
