import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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

export default function HistorialPage() {
  const [filtros, setFiltros] = useState<FiltrosHistorial>(FILTROS_VACIOS);
  const [page, setPage] = useState(0);

  // El historial supera las 46.000 filas, así que filtrado y paginación viven en
  // SQL. El texto se retrasa 300 ms para no lanzar una consulta por tecla.
  const [qDiferido, setQDiferido] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDiferido(filtros.q.trim()), 300);
    return () => clearTimeout(id);
  }, [filtros.q]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['historial', qDiferido, filtros.tipo, filtros.sede, filtros.desde, filtros.hasta, page],
    queryFn: async () =>
      (
        await historialApi.list({
          page,
          pageSize: PAGE_SIZE,
          q: qDiferido || undefined,
          tipo: filtros.tipo || undefined,
          sede: filtros.sede || undefined,
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const tipos = useMemo(() => data?.tipos ?? [], [data]);
  const sedes = useMemo(() => data?.sedes ?? [], [data]);

  const hayFiltros = Boolean(filtros.q || filtros.tipo || filtros.sede || filtros.desde || filtros.hasta);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            {total.toLocaleString('es-CO')} {total === 1 ? 'registro' : 'registros'}
            {hayFiltros && ' filtrados'}
          </span>
          {hayFiltros && (
            <Badge color="red">Filtros activos</Badge>
          )}
        </div>
      </Card>

      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <Table
        columns={columns}
        data={rows}
        rowKey={(row) => row.id_historial}
        loading={isLoading}
        emptyMessage={hayFiltros ? 'No se encontraron registros con esos filtros' : 'No hay historial registrado'}
        />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-silver-500">
            Página {page + 1} de {totalPages} ({total.toLocaleString('es-CO')} registros)
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
