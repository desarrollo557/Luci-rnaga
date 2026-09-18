import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { LoadingState, SeccionDesplegable, Table, Badge, type Column } from '@/components/ui';
import type { PersonaEnActividad } from '@/lib/api';
import { formatearHora, hace } from '@/lib/fechas';
import { duracionDeJornada, presenciaDe, ritmoPorHora } from '@/lib/presencia';
import { soloConectadas } from '@/lib/destacados';
import { señalesDe, useActividad } from './useActividad';

/**
 * Quién está trabajando ahora mismo.
 *
 * **Solo sale quien está dentro del software.** Antes se listaba a todo el
 * personal, y la pantalla era una docena de filas vacías con "Sin actividad"
 * entre las tres o cuatro que importaban. Quien no está conectado no es una
 * fila que leer: es ruido que esconde a los que sí.
 *
 * El orden lo pone lo activos que están, no el alfabeto: primero quien teclea,
 * después quien acaba de guardar, después quien tiene el software abierto y
 * por último quien se levantó hace un momento.
 */

/** El nombre sin la cédula, que es como llega el de quien ya no tiene cuenta. */
const soloNombre = (valor: string) => valor.replace(/\s*\([^)]*\)\s*$/, '').trim() || valor;

export function ActividadDelEquipo() {
  const { personas, ahora, isPending } = useActividad();

  const conectadas = useMemo(
    () => soloConectadas(personas.map((p) => ({ ...p, ...señalesDe(p) })), ahora),
    [personas, ahora],
  );

  const columnas: Column<PersonaEnActividad>[] = [
    {
      key: 'nombre',
      header: 'Persona',
      render: (p) => (
        <div>
          <p className="font-medium text-silver-800">{soloNombre(p.nombre)}</p>
          <p className="text-xs text-silver-500">
            {p.es_usuario ? [p.rol, p.sede].filter(Boolean).join(' · ') || 'Sin perfil' : 'Cuenta retirada'}
          </p>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (p) => {
        const presencia = presenciaDe(señalesDe(p), ahora);
        return (
          <div>
            <Badge color={presencia.color}>{presencia.etiqueta}</Badge>
            {presencia.detalle && <p className="mt-0.5 text-xs text-silver-500">{presencia.detalle}</p>}
          </div>
        );
      },
    },
    {
      key: 'primer_registro',
      header: 'Empezó',
      render: (p) => {
        const jornada = duracionDeJornada(p.primer_registro, p.ultimo_registro);
        return p.primer_registro ? (
          <div>
            <p>{formatearHora(p.primer_registro)}</p>
            {jornada && <p className="text-xs text-silver-500">{jornada} de trabajo</p>}
          </div>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'ultimo_registro',
      header: 'Último registro',
      render: (p) =>
        p.ultimo_registro ? (
          <div>
            <p>{formatearHora(p.ultimo_registro)}</p>
            <p className="text-xs text-silver-500">{hace(p.ultimo_registro, ahora)}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'caja_actual',
      header: 'Caja',
      render: (p) => {
        // Escribiendo, la caja que importa es en la que teclea, que puede no
        // ser todavía la de ningún registro guardado.
        const escribiendo = presenciaDe(señalesDe(p), ahora).estado === 'escribiendo';
        const caja = (escribiendo && p.caja_escribiendo) || p.caja_actual;
        return caja ? <span className="font-mono text-sm">{caja}</span> : '—';
      },
    },
    {
      key: 'registros',
      header: 'Registros',
      render: (p) => (
        <div>
          <p className="font-semibold">{p.registros.toLocaleString('es-CO')}</p>
          {p.cajas > 0 && (
            <p className="text-xs text-silver-500">
              {p.cajas} {p.cajas === 1 ? 'caja' : 'cajas'}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'ritmo',
      header: 'Ritmo',
      render: (p) => {
        const ritmo = ritmoPorHora(p.primer_registro, p.ultimo_registro, p.registros);
        return ritmo === null ? (
          <span className="text-silver-400">—</span>
        ) : (
          <span>
            {ritmo} <span className="text-xs text-silver-500">/hora</span>
          </span>
        );
      },
    },
  ];

  return (
    <SeccionDesplegable
      titulo="Actividad del equipo"
      icono={<Users className="size-5" />}
      resumen={
        isPending
          ? 'Consultando…'
          : conectadas.length === 0
            ? 'Nadie dentro del software ahora mismo'
            : `${conectadas.length} ${conectadas.length === 1 ? 'persona conectada' : 'personas conectadas'}`
      }
    >
      {isPending ? (
        <div className="flex justify-center py-8">
          <LoadingState message="Estamos consultando la información…" />
        </div>
      ) : (
        <Table
          columns={columnas}
          data={conectadas}
          rowKey={(p) => p.cc ?? p.nombre}
          emptyMessage="Nadie dentro del software ahora mismo"
        />
      )}
    </SeccionDesplegable>
  );
}
