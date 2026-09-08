import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CHROME, compacto, conSeparador } from './tokens';

export interface StatTileProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  /** Tono del icono; el valor siempre va en tinta, nunca en color de serie. */
  tono?: 'azul' | 'aqua' | 'ambar' | 'marca' | 'neutro';
  /** Serie corta para la línea de tendencia del pie de la tarjeta. */
  tendencia?: number[];
  colorTendencia?: string;
  detalle?: string;
  /** Usa notación compacta (81,2 mil) en vez de la cifra completa. */
  compactar?: boolean;
}

const TONOS: Record<string, string> = {
  azul: 'bg-blue-50 text-blue-700',
  aqua: 'bg-emerald-50 text-emerald-700',
  ambar: 'bg-amber-50 text-amber-700',
  marca: 'bg-primary-50 text-primary-700',
  neutro: 'bg-silver-100 text-silver-600',
};

function Sparkline({ datos, color }: { datos: number[]; color: string }) {
  if (datos.length < 2) return null;
  const ancho = 96;
  const alto = 24;
  const max = Math.max(...datos);
  const min = Math.min(...datos);
  const rango = max - min || 1;
  const d = datos
    .map((v, i) => {
      const x = (i / (datos.length - 1)) * ancho;
      const y = alto - ((v - min) / rango) * alto;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const ultimoX = ancho;
  const ultimoY = alto - ((datos[datos.length - 1] - min) / rango) * alto;
  return (
    <svg width={ancho} height={alto} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={CHROME.atenuado} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ultimoX} cy={ultimoY} r={3.5} fill={color} stroke={CHROME.superficie} strokeWidth={2} />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  icon: Icon,
  tono = 'neutro',
  tendencia,
  colorTendencia = CHROME.tintaSecundaria,
  detalle,
  compactar,
}: StatTileProps) {
  const texto =
    typeof value === 'number' ? (compactar ? compacto(value) : conSeparador(value)) : value;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-silver-200 bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-silver-500">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-tight text-silver-900">{texto}</p>
          {detalle && <p className="mt-0.5 truncate text-xs text-silver-500">{detalle}</p>}
        </div>
        {Icon && (
          <span className={cn('shrink-0 rounded-lg p-2.5', TONOS[tono])}>
            <Icon className="size-5" />
          </span>
        )}
      </div>
      {tendencia && tendencia.length > 1 && (
        <div className="flex justify-end">
          <Sparkline datos={tendencia} color={colorTendencia} />
        </div>
      )}
    </div>
  );
}
