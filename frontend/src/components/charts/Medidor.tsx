import { conSeparador } from './tokens';

export interface MedidorProps {
  valor: number;
  total: number;
  color: string;
  /** Pista sin rellenar: un paso más claro de la misma rampa que el relleno. */
  colorPista?: string;
  etiquetaValor?: string;
  etiquetaTotal?: string;
}

/** Razón contra un límite: una barra única con el porcentaje rotulado. */
export function Medidor({
  valor,
  total,
  color,
  colorPista = '#edeef1',
  etiquetaValor = 'completado',
  etiquetaTotal = 'total',
}: MedidorProps) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm text-silver-600">
          <strong className="font-semibold text-silver-900">{conSeparador(valor)}</strong> de{' '}
          {conSeparador(total)} {etiquetaTotal}
        </span>
        <span className="text-lg font-bold" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: colorPista }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% ${etiquetaValor}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
