import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Badge, Button, Input, PageHeader, Table, type Column } from '@/components/ui';
import { historialApi } from '@/lib/api';
import type { Historial } from '@/types';

const PAGE_SIZE = 25;

export default function HistorialPage() {
  const [filtroCaja, setFiltroCaja] = useState('');
  const [page, setPage] = useState(0);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['historial'],
    queryFn: async () => (await historialApi.list()).data,
  });

  const filtered = useMemo(() => {
    const q = filtroCaja.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => (row.caja ?? '').toLowerCase().includes(q));
  }, [rows, filtroCaja]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="w-64 pl-9"
              placeholder="Filtrar por caja…"
              value={filtroCaja}
              onChange={(e) => {
                setFiltroCaja(e.target.value);
                setPage(0);
              }}
            />
          </div>
        }
      />

      <Table
        columns={columns}
        data={pageRows}
        rowKey={(row) => row.id_historial}
        loading={isLoading}
        emptyMessage={filtroCaja ? 'No se encontraron registros para esa caja' : 'No hay historial registrado'}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
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
