import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Download } from 'lucide-react';
import { Button, Card, DatePicker, Select } from '@/components/ui';
import { modulosClienteApi, subModulosApi } from '@/lib/api';
import { fechaHoyLocal } from '@/lib/fechas';
import { useDescargaSeguimiento } from '@/lib/useDescargaSeguimiento';

/**
 * El seguimiento de inventario de quien digita, desde su propio panel.
 *
 * El formato F-PSD-IDA-001 lo sacaba solo el líder, y para una jornada concreta
 * había que pedírselo. Aquí cada auxiliar saca el suyo: el servidor le impone su
 * nombre como filtro, así que lo que baja es siempre lo que él digitó y nada
 * más, elija lo que elija en la pantalla.
 *
 * Los tres filtros son opcionales y se combinan. Sin ninguno, sale todo lo suyo.
 */

/** Un día concreto es el caso corriente, así que tiene su propio atajo. */
function hoyMismo(): { desde: string; hasta: string } {
  const hoy = fechaHoyLocal();
  return { desde: hoy, hasta: hoy };
}

export function MiSeguimiento() {
  const [cliente, setCliente] = useState('');
  const [acta, setActa] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { mensaje, descargando, descargar } = useDescargaSeguimiento();

  /*
   * Los clientes y las actas que la persona tiene a la vista ya vienen acotados
   * a sus cajas asignadas, así que los desplegables muestran lo suyo sin que
   * haga falta pedir nada aparte.
   */
  const clientesQuery = useQuery({
    queryKey: ['sub-modulos', 'lista'],
    queryFn: () => subModulosApi.list().then((res) => res.data),
  });
  const actasQuery = useQuery({
    queryKey: ['modulos-cliente', 'lista'],
    queryFn: () => modulosClienteApi.list().then((res) => res.data),
  });

  const clientes = useMemo(
    () =>
      (clientesQuery.data ?? []).map((c) => ({
        value: c.codigo,
        label: `${c.codigo} — ${c.entidad_remitente}`,
      })),
    [clientesQuery.data],
  );

  /* Las actas se acotan al cliente elegido: son suyas, no de todo el archivo. */
  const actas = useMemo(() => {
    const todas = actasQuery.data ?? [];
    const delCliente = cliente ? todas.filter((a) => a.codigo === cliente) : todas;
    const numeros = [...new Set(delCliente.map((a) => a.acta_transferencia_modulo).filter(Boolean))];
    return numeros.sort((uno, otro) => uno.localeCompare(otro, 'es', { numeric: true })).map((n) => ({
      value: n,
      label: `Acta ${n}`,
    }));
  }, [actasQuery.data, cliente]);

  const ocupado = descargando;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarRange className="size-5 text-primary-700" />
        <div>
          <p className="font-semibold text-silver-900">Mi seguimiento de inventario</p>
          <p className="text-sm text-silver-600">
            El formato F-PSD-IDA-001 con lo que tú digitaste. Filtra lo que necesites; sin filtros sale todo.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Cliente"
          value={cliente}
          onChange={(valor) => {
            setCliente(valor);
            // El acta elegida es de otro cliente: se suelta en vez de quedar
            // puesta y devolver un documento vacío.
            setActa('');
          }}
          options={[{ value: '', label: 'Todos' }, ...clientes]}
          placeholder="Todos"
        />
        <Select
          label="Acta"
          value={acta}
          onChange={setActa}
          options={[{ value: '', label: 'Todas' }, ...actas]}
          placeholder="Todas"
        />
        <DatePicker label="Desde" value={desde} onChange={setDesde} />
        <DatePicker label="Hasta" value={hasta} onChange={setHasta} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void descargar({ cliente, acta, desde, hasta })}
          loading={ocupado}
        >
          <Download className="size-4" /> Descargar seguimiento
        </Button>
        <Button
          variant="secondary"
          disabled={ocupado}
          onClick={() => {
            const dia = hoyMismo();
            setDesde(dia.desde);
            setHasta(dia.hasta);
            void descargar({ cliente, acta, ...dia });
          }}
        >
          Solo hoy
        </Button>
        {(cliente || acta || desde || hasta) && (
          <Button
            variant="ghost"
            disabled={ocupado}
            onClick={() => {
              setCliente('');
              setActa('');
              setDesde('');
              setHasta('');
            }}
          >
            Quitar filtros
          </Button>
        )}
        {mensaje && <span className="text-sm text-silver-600">{mensaje}</span>}
      </div>
    </Card>
  );
}
