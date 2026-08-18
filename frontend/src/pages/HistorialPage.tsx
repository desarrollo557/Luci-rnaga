import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterX, Search } from 'lucide-react';
import { Badge, Button, Card, DatePicker, Input, PageHeader, Select, Table, type Column } from '@/components/ui';
import { historialApi } from '@/lib/api';
import type { Historial } from '@/types';

const PAGE_SIZE = 25;

interface FiltrosHistorial {
  q: string;
  tipo: string;
  sede: string;
  desde: string;
  hasta: string;
}

const FILTROS_VACIOS: FiltrosHistorial = { q: '', tipo: '', sede: '', desde: '', hasta: '' };

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

export default function HistorialPage() {
  const [filtros, setFiltros] = useState<FiltrosHistorial>(FILTROS_VACIOS);
  const [page, setPage] = useState(0);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['historial'],
    queryFn: async () => (await historialApi.list()).data,
  });

  const tipos = useMemo(
    () => Array.from(new Set(rows.map((row) => row.tipo_cambio).filter(Boolean))) as string[],
    [rows],
  );
  const sedes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.sede_calidad).filter(Boolean))) as string[],
    [rows],
  );

  const hayFiltros = Boolean(filtros.q || filtros.tipo || filtros.sede || filtros.desde || filtros.hasta);

  const filtered = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hasta = filtros.hasta ? new Date(`${filtros.hasta}T23:59:59.999`).getTime() : null;

    return rows.filter((row) => {
      if (q) {
        const campos = [
          row.caja,
          row.upd,
          row.id_dato,
          row.historial_cambios,
          row.cambio_calidad,
          row.sede_calidad,
          row.tipo_cambio,
          row.fecha_cambio ? new Date(row.fecha_cambio).toLocaleString('es-CO') : '',
        ];
        if (!campos.some((campo) => normalize(campo).includes(q))) return false;
      }
      if (filtros.tipo && row.tipo_cambio !== filtros.tipo) return false;
      if (filtros.sede && row.sede_calidad !== filtros.sede) return false;
      if (filtros.desde || filtros.hasta) {
        const fecha = row.fecha_cambio ? new Date(row.fecha_cambio).getTime() : null;
        if (fecha === null) return false;
        if (desde !== null && fecha < desde) return false;
        if (hasta !== null && fecha > hasta) return false;
      }
      return true;
    });
  }, [rows, filtros]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const updateFiltro = (patch: Partial<FiltrosHistorial>) => {
    setFiltros((prev) => ({ ...prev, ...patch }));
    setPage(0);
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_VACIOS);
    setPage(0);
  };

  const columns: Column<Historial>[] = [
    {
      key: 'fecha_cambio',
      header: 'Fecha',
      render: (row) => <span>{row.fecha_cambio ? new Date(row.fecha_cambio).toLocaleString('es-CO') : '—'}</span>,
    },
    {
      key: 'tipo_cambio',
      header: 'Tipo',
      render: (row) => (
        <Badge color={row.tipo_cambio === 'OK' ? 'green' : 'amber'}>{row.tipo_cambio ?? '—'}</Badge>
      ),
    },
    {
      key: 'id_dato',
      header: 'Id Dato',
      render: (row) => <span>{row.id_dato ?? '—'}</span>,
    },
    { key: 'caja', header: 'Caja' },
    { key: 'upd', header: 'UPD' },
    { key: 'historial_cambios', header: 'Cambio' },
    { key: 'cambio_calidad', header: 'Quién' },
    { key: 'sede_calidad', header: 'Sede' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de Cambios"
        description="Registro de cambios y revisiones realizadas sobre los FUID"
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver-400" />
            <Input
              className="h-12 pl-9 text-base"
              placeholder="Buscar por caja, UPD, quien cambió, sede, tipo…"
              value={filtros.q}
              onChange={(e) => updateFiltro({ q: e.target.value })}
            />
          </div>

          <Select
            label="Tipo de cambio"
            placeholder="Todos"
            options={tipos.map((tipo) => ({ value: tipo, label: tipo }))}
            value={filtros.tipo}
            onChange={(value) => updateFiltro({ tipo: value })}
          />

          <Select
            label="Sede"
            placeholder="Todas"
            options={sedes.map((sede) => ({ value: sede, label: sede }))}
            value={filtros.sede}
            onChange={(value) => updateFiltro({ sede: value })}
          />

          <DatePicker
            label="Desde"
            value={filtros.desde}
            onChange={(value) => updateFiltro({ desde: value })}
          />

          <DatePicker
            label="Hasta"
            value={filtros.hasta}
            onChange={(value) => updateFiltro({ hasta: value })}
          />

          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              onClick={limpiarFiltros}
              disabled={!hayFiltros}
              className="h-12"
            >
              <FilterX className="size-4" /> Limpiar
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-silver-100 pt-3 text-sm">
          <span className="text-silver-500">
            {filtered.length.toLocaleString('es-CO')} {filtered.length === 1 ? 'registro' : 'registros'}
            {hayFiltros && ' filtrados'}
          </span>
          {hayFiltros && (
            <Badge color="red">Filtros activos</Badge>
          )}
        </div>
      </Card>

      <Table
        columns={columns}
        data={pageRows}
        rowKey={(row) => row.id_historial}
        loading={isLoading}
        emptyMessage={hayFiltros ? 'No se encontraron registros con esos filtros' : 'No hay historial registrado'}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-silver-500">
            Página {page + 1} de {totalPages} ({filtered.length} registros)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
