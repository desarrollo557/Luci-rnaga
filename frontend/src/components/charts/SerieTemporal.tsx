import { useMemo, useState } from 'react';
import { CHROME, conSeparador, topeEjeY } from './tokens';
import { useAnchoContenedor } from './useAnchoContenedor';

export interface SerieDef {
  clave: string;
  nombre: string;
  color: string;
  /** Dibuja el relleno de área bajo la línea (solo tiene sentido en la serie base). */
  area?: boolean;
}

export interface PuntoSerie {
  etiqueta: string;
  [clave: string]: string | number;
}

export interface SerieTemporalProps {
  datos: PuntoSerie[];
  series: SerieDef[];
  alto?: number;
  /** Cada cuántas etiquetas del eje X se dibuja una (evita solapamiento). */
  saltoEtiquetas?: number;
  formatoValor?: (n: number) => string;
}

const MARGEN = { top: 16, right: 16, bottom: 28, left: 48 };

/**
 * Línea + área para evolución temporal, con retícula vertical que se ancla al
 * punto más cercano: el lector apunta a un mes, no a una línea de 2 px.
 */
export function SerieTemporal({
  datos,
  series,
  alto = 260,
  saltoEtiquetas,
  formatoValor = conSeparador,
}: SerieTemporalProps) {
  const { ref, ancho } = useAnchoContenedor<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);

  const anchoTrazo = Math.max(ancho - MARGEN.left - MARGEN.right, 10);
  const altoTrazo = alto - MARGEN.top - MARGEN.bottom;

  const maximo = useMemo(() => {
    const valores = datos.flatMap((d) => series.map((s) => Number(d[s.clave] ?? 0)));
    return topeEjeY(Math.max(0, ...valores));
  }, [datos, series]);

  if (datos.length === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center py-10 text-sm text-silver-500">
        Sin datos en el periodo.
      </div>
    );
  }

  const x = (i: number) =>
    MARGEN.left + (datos.length === 1 ? anchoTrazo / 2 : (i / (datos.length - 1)) * anchoTrazo);
  const y = (v: number) => MARGEN.top + altoTrazo - (v / maximo) * altoTrazo;

  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maximo * f));
  const salto = saltoEtiquetas ?? Math.max(1, Math.ceil(datos.length / 7));

  const linea = (clave: string) =>
    datos.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(d[clave] ?? 0))}`).join(' ');

  const area = (clave: string) =>
    `${linea(clave)} L ${x(datos.length - 1)} ${MARGEN.top + altoTrazo} L ${x(0)} ${MARGEN.top + altoTrazo} Z`;

  const puntoActivo = activo != null ? datos[activo] : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={ancho}
        height={alto}
        role="img"
        aria-label={`Evolución de ${series.map((s) => s.nombre).join(' y ')}`}
        onMouseLeave={() => setActivo(null)}
      >
        {ticksY.map((t) => (
          <g key={t}>
            <line
              x1={MARGEN.left}
              x2={MARGEN.left + anchoTrazo}
              y1={y(t)}
              y2={y(t)}
              stroke={CHROME.rejilla}
              strokeWidth={1}
            />
            <text
              x={MARGEN.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill={CHROME.tintaTenue}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {conSeparador(t)}
            </text>
          </g>
        ))}

        {series.map((s) =>
          s.area ? (
            // La opacidad viene del tema: un 10% que se lee bien sobre blanco
            // desaparece sobre el lienzo oscuro, que necesita algo más de cuerpo.
            <path
              key={`a-${s.clave}`}
              d={area(s.clave)}
              fill={s.color}
              style={{ opacity: 'var(--chart-area-opacidad)' }}
            />
          ) : null,
        )}

        {series.map((s) => (
          <path
            key={`l-${s.clave}`}
            d={linea(s.clave)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {datos.map((d, i) =>
          i % salto === 0 || i === datos.length - 1 ? (
            <text
              key={`x-${d.etiqueta}`}
              x={x(i)}
              y={alto - 8}
              textAnchor="middle"
              fontSize={11}
              fill={CHROME.tintaTenue}
            >
              {d.etiqueta}
            </text>
          ) : null,
        )}

        {activo != null && (
          <line
            x1={x(activo)}
            x2={x(activo)}
            y1={MARGEN.top}
            y2={MARGEN.top + altoTrazo}
            stroke={CHROME.ejes}
            strokeWidth={1}
          />
        )}

        {activo != null &&
          series.map((s) => (
            <circle
              key={`p-${s.clave}`}
              cx={x(activo)}
              cy={y(Number(datos[activo][s.clave] ?? 0))}
              r={4}
              fill={s.color}
              stroke={CHROME.superficie}
              strokeWidth={2}
            />
          ))}

        {/* Franjas invisibles: el objetivo de puntería es la columna entera, no el punto. */}
        {datos.map((d, i) => (
          <rect
            key={`hit-${d.etiqueta}`}
            x={x(i) - anchoTrazo / Math.max(datos.length - 1, 1) / 2}
            y={MARGEN.top}
            width={Math.max(anchoTrazo / Math.max(datos.length - 1, 1), 24)}
            height={altoTrazo}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            tabIndex={0}
            role="button"
            aria-label={`${d.etiqueta}: ${series
              .map((s) => `${s.nombre} ${formatoValor(Number(d[s.clave] ?? 0))}`)
              .join(', ')}`}
            className="outline-none"
          />
        ))}
      </svg>

      {puntoActivo && activo != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-silver-200 bg-surface px-3 py-2 shadow-lg"
          style={{
            left: Math.min(Math.max(x(activo) - 72, 0), Math.max(ancho - 150, 0)),
            top: 4,
          }}
        >
          <p className="mb-1 text-xs font-medium text-silver-500">{puntoActivo.etiqueta}</p>
          {series.map((s) => (
            <p key={s.clave} className="flex items-center gap-2 text-sm">
              <span className="block h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-semibold text-silver-900">
                {formatoValor(Number(puntoActivo[s.clave] ?? 0))}
              </span>
              <span className="text-xs text-silver-500">{s.nombre}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
