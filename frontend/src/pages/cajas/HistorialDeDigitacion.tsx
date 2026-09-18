import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { Badge, Card, LoadingState, Table, type Column } from '@/components/ui';
import { modulosCajaApi, type JornadaDeCaja } from '@/lib/api';
import { formatearFecha, formatearHora, SIN_FECHA } from '@/lib/fechas';

/**
 * Lo que se ha digitado en esta caja, día por día.
 *
 * Una caja rara vez se hace de una sentada: se deja a media tarde y se retoma
 * al día siguiente. Hasta ahora la pantalla de la caja solo tenía una fecha
 * —"Actualizada"— que se movía al último guardado, así que quien volvía a una
 * caja de ayer veía la fecha de hoy y ni rastro de lo que había hecho la
 * víspera. El trabajo estaba guardado, pero no había dónde mirarlo.
 *
 * Esta tabla es ese sitio. Cada fila es un día de una persona, con cuántos
 * registros hizo, en qué tramo de UPD y entre qué horas. Nada de esto se
 * guarda aparte: se lee de los registros mismos, así que vale igual para lo
 * digitado esta mañana y para lo que ya estaba en la base antes de que esta
 * pantalla existiera.
 *
 * El nombre va sin la cédula que lleva pegada en `elaborado_por`, porque en
 * una tabla de una sola caja el nombre basta y la cédula solo alarga la fila.
 */

/** El nombre sin la cédula, que es como se guarda el autor de cada registro. */
const soloNombre = (valor: string | null) =>
  (valor ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Sin autor';

/** El tramo de UPD de la jornada, o un guion si ninguno tenía el formato. */
function tramoDeUpd(jornada: JornadaDeCaja): string {
  if (!jornada.upd_desde) return SIN_FECHA;
  return jornada.upd_desde === jornada.upd_hasta
    ? jornada.upd_desde
    : `${jornada.upd_desde} → ${jornada.upd_hasta}`;
}

interface Props {
  cajaId: number;
}

export function HistorialDeDigitacion({ cajaId }: Props) {
  const jornadasQuery = useQuery({
    queryKey: ['modulos-caja', 'jornadas', cajaId],
    queryFn: () => modulosCajaApi.jornadas(cajaId).then((res) => res.data),
    enabled: cajaId > 0,
  });

  const jornadas = useMemo(() => jornadasQuery.data ?? [], [jornadasQuery.data]);
  const totalRegistros = jornadas.reduce((suma, j) => suma + Number(j.registros), 0);
  const dias = new Set(jornadas.map((j) => j.fecha ?? 'sin-fecha')).size;

  const columnas: Column<JornadaDeCaja>[] = [
    {
      key: 'fecha',
      header: 'Día',
      render: (j) => (
        <span className="font-medium text-silver-800">
          {j.fecha ? formatearFecha(j.fecha) : 'Sin fecha'}
        </span>
      ),
    },
    {
      key: 'colaborador',
      header: 'Quién digitó',
      render: (j) => soloNombre(j.colaborador),
    },
    {
      key: 'registros',
      header: 'Registros',
      render: (j) => <span className="font-semibold">{Number(j.registros).toLocaleString('es-CO')}</span>,
    },
    {
      key: 'upd',
      header: 'UPD',
      render: (j) => <span className="font-mono text-sm">{tramoDeUpd(j)}</span>,
    },
    {
      key: 'horas',
      header: 'Entre horas',
      render: (j) =>
        j.primera ? (
          <span className="text-sm text-silver-600">
            {formatearHora(j.primera)} – {formatearHora(j.ultima)}
          </span>
        ) : (
          SIN_FECHA
        ),
    },
    {
      key: 'resultado',
      header: 'Cómo terminó',
      /*
       * Lo único de la fila que no sale de los registros: lo dijo la persona
       * al dejar la caja. Un día sin declarar no es un error —el flujo no
       * obliga a declarar nada— y por eso se dice así y no con una alarma.
       */
      render: (j) =>
        j.resultado === 'TERMINADA' ? (
          <Badge color="green">Caja terminada</Badge>
        ) : j.resultado === 'CONTINUA' ? (
          <Badge color="amber">Continuó otro día</Badge>
        ) : (
          <span className="text-sm text-silver-400">Sin declarar</span>
        ),
    },
  ];

  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary-600" />
        <div>
          <h2 className="font-semibold text-silver-900">Historial de digitación</h2>
          <p className="text-sm text-silver-500">
            {jornadasQuery.isPending
              ? 'Consultando…'
              : jornadas.length === 0
                ? 'Todavía no se ha digitado nada en esta caja'
                : `${totalRegistros.toLocaleString('es-CO')} registros en ${dias} ${dias === 1 ? 'día de trabajo' : 'días de trabajo'}`}
          </p>
        </div>
      </div>

      {jornadasQuery.isPending ? (
        <div className="flex justify-center py-6">
          <LoadingState message="Estamos consultando la información…" />
        </div>
      ) : (
        <Table
          columns={columnas}
          data={jornadas}
          rowKey={(j) => `${j.fecha ?? 'sin-fecha'}|${j.colaborador ?? ''}`}
          emptyMessage="Todavía no se ha digitado nada en esta caja"
        />
      )}
    </Card>
  );
}
