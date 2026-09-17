import { formatearFecha, formatearFechaHora } from '@/lib/fechas';
import type { FuidDato } from '@/types';

/**
 * Un registro ya guardado, en detalle y sin poder tocarlo.
 *
 * Se abre desde el panel lateral, con la lupa de cada fila, mientras se sigue
 * digitando. Sirve para comprobar qué se puso en un registro anterior sin
 * cerrar el formulario ni perder lo que se lleve escrito, y desde aquí se pasa a
 * corregirlo si hace falta.
 *
 * Los campos van en el mismo orden que en el formulario. Ver el dato en el sitio
 * donde se escribió es lo que permite reconocer de un vistazo qué falta o qué
 * está mal, sin traducir de una disposición a otra.
 */

export interface DetalleRegistroProps {
  registro: FuidDato;
}

/** Lo que no se diligenció se guarda como `N/A`; en pantalla es un hueco. */
function comoTexto(valor: unknown): string {
  const texto = valor == null ? '' : String(valor).trim();
  if (texto === '' || texto.toUpperCase() === 'N/A') return '—';
  return texto;
}

function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor: string; ancho?: boolean }) {
  return (
    <div className={ancho ? 'sm:col-span-2 lg:col-span-4' : undefined}>
      <p className="text-xs font-medium text-silver-500">{etiqueta}</p>
      <p className="mt-0.5 break-words text-sm text-silver-800">{valor}</p>
    </div>
  );
}

export function DetalleRegistro({ registro }: DetalleRegistroProps) {
  const fecha = (valor: string | null) => (valor ? formatearFecha(valor) : '—');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-silver-200 pb-3">
        <p className="font-mono text-base font-semibold text-silver-900">{comoTexto(registro.upd)}</p>
        <p className="text-sm text-silver-600">N° de orden {registro.n_orden ?? '—'}</p>
        <p className="text-sm text-silver-600">Caja {comoTexto(registro.caja)}</p>
        {registro.created_at && (
          <p className="text-sm text-silver-500">Digitado el {formatearFechaHora(registro.created_at)}</p>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta="Entidad Productora" valor={comoTexto(registro.entidad_productora)} />
        <Dato etiqueta="Unidad Administrativa" valor={comoTexto(registro.unidad_administrativa)} />
        <Dato etiqueta="Oficina Productora" valor={comoTexto(registro.oficina_productora)} />
        <Dato etiqueta="Objeto" valor={comoTexto(registro.objeto)} />
        <Dato etiqueta="Codigo" valor={comoTexto(registro.codigo)} />
        <Dato etiqueta="Serie" valor={comoTexto(registro.serie)} />
        <Dato etiqueta="Subserie" valor={comoTexto(registro.subserie)} />
        <Dato etiqueta="Asunto Automático" valor={comoTexto(registro.asunto_2)} />
        <Dato etiqueta="Asunto Manual" valor={comoTexto(registro.asunto_3)} ancho />
        <Dato etiqueta="Nro. Documento Desde" valor={comoTexto(registro.numero_doc)} />
        <Dato etiqueta="Nro. Documento Hasta" valor={comoTexto(registro.numero_doc_hasta)} />
        <Dato etiqueta="Fecha Inicial" valor={fecha(registro.fecha_inicial)} />
        <Dato etiqueta="Fecha Final" valor={fecha(registro.fecha_final)} />
        <Dato etiqueta="Tomo" valor={comoTexto(registro.tomo)} />
        <Dato etiqueta="Otro" valor={comoTexto(registro.otro)} />
        <Dato etiqueta="Caja Interna" valor={comoTexto(registro.caja_interna)} />
        <Dato etiqueta="Folios" valor={comoTexto(registro.folios)} />
        <Dato etiqueta="Soporte" valor={comoTexto(registro.soporte)} />
        <Dato etiqueta="Frecuencia" valor={comoTexto(registro.frecuencia)} />
        <Dato etiqueta="Entidad Remitente" valor={comoTexto(registro.entidad_remitente)} />
        <Dato etiqueta="Acta de transferencia" valor={comoTexto(registro.nro_acta_transferible)} />
        <Dato etiqueta="Notas" valor={comoTexto(registro.notas)} ancho />
        <Dato etiqueta="Elaborado por" valor={comoTexto(registro.elaborado_por)} />
        <Dato etiqueta="Fecha del dato" valor={fecha(registro.fecha_del_dato)} />
      </dl>
    </div>
  );
}
