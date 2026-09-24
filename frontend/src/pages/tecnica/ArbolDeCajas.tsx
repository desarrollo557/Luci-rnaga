import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, LockOpen, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui';
import { getApiErrorMessage, modulosCajaApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { invalidateDomain } from '@/lib/queryInvalidation';
import { CAJA_EN_PROCESO, CAJA_FINALIZADA, estadoDeCaja } from '@/lib/estadoCaja';
import { fechaHoyLocal } from '@/lib/fechas';

/** Un UPD sin asignar todavía se enseña como una raya, no como un hueco. */
const formatUpd = (upd: string | null | undefined): string => upd || '—';

/**
 * Las cajas del auxiliar, en el orden en que existen: cliente, acta, caja.
 *
 * Era una tabla con una fila por caja y siete columnas, y quien tiene treinta
 * cajas repartidas en dos clientes veía treinta filas con el cliente y el acta
 * repetidos en cada una. La jerarquía es la del software —un cliente tiene
 * actas y un acta tiene cajas—, así que la pantalla la enseña igual: **cada
 * nivel dice lo suyo y lo demás se abre solo si hace falta.**
 *
 * Lo que decide qué se ve cerrado es qué haría falta para elegir dónde entrar:
 * de un cliente, cuántas cajas tiene y cuántas están sin terminar; de un acta,
 * lo mismo; y ya dentro de la caja, lo que se necesita para retomarla.
 *
 * Empieza plegado salvo lo que tiene trabajo a medias. Una caja sin terminar es
 * a lo que se vuelve, y esconderla detrás de dos clics sería esconder justo lo
 * que se vino a buscar.
 */

export interface CajaDelPanel {
  id: number;
  caja_modulo: string;
  codigo_cliente: string | null;
  entidad_cliente: string | null;
  acta: string | null;
  estado_caja: string | null;
  fecha_finalizacion: string | null;
  fuid_creados: number;
  ultimo_upd_caja: string | null;
  rango_inicio: string | null;
  rango_ultimo: string | null;
}

/** Sin cliente o sin acta: las cajas heredadas las traen vacías y también son suyas. */
const SIN_CLIENTE = 'Sin cliente';
const SIN_ACTA = 'Sin acta';

interface Grupo {
  clave: string;
  titulo: string;
  subtitulo?: string;
  cajas: CajaDelPanel[];
  actas: Array<{ clave: string; titulo: string; cajas: CajaDelPanel[] }>;
}

function agrupar(cajas: readonly CajaDelPanel[]): Grupo[] {
  const clientes = new Map<string, Grupo>();
  for (const caja of cajas) {
    const codigo = caja.codigo_cliente ?? '';
    const clave = codigo || SIN_CLIENTE;
    if (!clientes.has(clave)) {
      clientes.set(clave, {
        clave,
        titulo: caja.entidad_cliente ?? SIN_CLIENTE,
        subtitulo: codigo || undefined,
        cajas: [],
        actas: [],
      });
    }
    const cliente = clientes.get(clave)!;
    cliente.cajas.push(caja);

    const acta = caja.acta ?? '';
    const claveActa = acta || SIN_ACTA;
    let grupoActa = cliente.actas.find((a) => a.clave === claveActa);
    if (!grupoActa) {
      grupoActa = { clave: claveActa, titulo: acta ? `Acta ${acta}` : SIN_ACTA, cajas: [] };
      cliente.actas.push(grupoActa);
    }
    grupoActa.cajas.push(caja);
  }
  return [...clientes.values()];
}

const sinTerminar = (cajas: readonly CajaDelPanel[]) =>
  cajas.filter((c) => c.estado_caja === CAJA_EN_PROCESO).length;

const sumar = (cajas: readonly CajaDelPanel[]) =>
  cajas.reduce((total, caja) => total + (caja.fuid_creados ?? 0), 0);

const conSeparador = (n: number) => n.toLocaleString('es-CO');

/**
 * Lo producido en ese nivel: "1.098 registros · 8 cajas · 2 sin terminar".
 *
 * Los registros van delante porque son la pregunta —cuánto llevo en este
 * cliente, en esta acta—, y las cajas detrás, que son el continente.
 *
 * Aquí no se habla de hoy ni de ninguna fecha: lo que el árbol enseña es el
 * periodo que se haya elegido arriba, y decirlo otra vez en cada línea sería
 * repetir lo que ya dice la cabecera.
 */
function resumen(cajas: readonly CajaDelPanel[]): string {
  const registros = sumar(cajas);
  const abiertas = sinTerminar(cajas);
  const partes = [`${conSeparador(registros)} ${registros === 1 ? 'registro' : 'registros'}`];
  partes.push(`${cajas.length} ${cajas.length === 1 ? 'caja' : 'cajas'}`);
  if (abiertas > 0) partes.push(`${abiertas} sin terminar`);
  return partes.join(' · ');
}

interface Props {
  cajas: readonly CajaDelPanel[];
}

export function ArbolDeCajas({ cajas }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /*
   * Una caja terminada no ofrece digitar, ofrece reabrir. Digitar en ella la
   * reabriría igual —guardar un registro la pone en proceso—, y así la caja
   * quedaría abierta sin que nadie lo hubiera decidido. Reabrir no pide nada
   * más: se retoma el UPD donde quedó, porque muchas reaperturas son solo para
   * corregir un registro ya escrito.
   */
  const reabrir = useMutation({
    mutationFn: (id: number) => modulosCajaApi.cambiarEstado(id, CAJA_EN_PROCESO),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Caja reabierta');
      void invalidateDomain(queryClient, 'modulos-caja');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const grupos = useMemo(() => agrupar(cajas), [cajas]);

  /* Abierto de entrada: lo que tiene una caja a medias. */
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () =>
      new Set(
        agrupar(cajas).flatMap((cliente) =>
          sinTerminar(cliente.cajas) > 0
            ? [
                cliente.clave,
                ...cliente.actas.filter((a) => sinTerminar(a.cajas) > 0).map((a) => `${cliente.clave}/${a.clave}`),
              ]
            : [],
        ),
      ),
  );

  const alternar = (clave: string) =>
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  if (cajas.length === 0) {
    return <p className="p-4 text-sm text-silver-500">No hay cajas asignadas.</p>;
  }

  return (
    <ul className="divide-y divide-silver-100">
      {grupos.map((cliente) => {
        const clienteAbierto = abiertos.has(cliente.clave);
        return (
          <li key={cliente.clave}>
            <button
              type="button"
              onClick={() => alternar(cliente.clave)}
              aria-expanded={clienteAbierto}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-silver-50"
            >
              <ChevronRight
                className={cn('size-4 shrink-0 text-silver-400 transition-transform', clienteAbierto && 'rotate-90')}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-silver-900">{cliente.titulo}</span>
                {cliente.subtitulo && (
                  <span className="block font-mono text-xs text-silver-500">{cliente.subtitulo}</span>
                )}
              </span>
              <span className="shrink-0 text-sm text-silver-600">{resumen(cliente.cajas)}</span>
            </button>

            {clienteAbierto && (
              <ul className="border-t border-silver-100 bg-silver-50/50">
                {cliente.actas.map((acta) => {
                  const claveActa = `${cliente.clave}/${acta.clave}`;
                  const actaAbierta = abiertos.has(claveActa);
                  return (
                    <li key={claveActa}>
                      <button
                        type="button"
                        onClick={() => alternar(claveActa)}
                        aria-expanded={actaAbierta}
                        className="flex w-full items-center gap-2 py-2.5 pl-10 pr-4 text-left transition-colors hover:bg-silver-100"
                      >
                        <ChevronRight
                          className={cn(
                            'size-4 shrink-0 text-silver-400 transition-transform',
                            actaAbierta && 'rotate-90',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-silver-800">
                          {acta.titulo}
                        </span>
                        <span className="shrink-0 text-sm text-silver-600">{resumen(acta.cajas)}</span>
                      </button>

                      {actaAbierta && (
                        <ul className="divide-y divide-silver-100 border-t border-silver-100 bg-surface">
                          {acta.cajas.map((caja) => {
                            const estado = estadoDeCaja(
                              { estado: caja.estado_caja, fechaFinalizacion: caja.fecha_finalizacion },
                              fechaHoyLocal(),
                            );
                            return (
                              <li
                                key={caja.id}
                                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pl-16 pr-4"
                              >
                                <span className="font-mono text-sm font-medium text-silver-900">
                                  {caja.caja_modulo}
                                </span>
                                <Badge color={estado.color}>{estado.etiqueta}</Badge>
                                <span className="text-sm text-silver-600">
                                  <strong className="text-silver-800">{conSeparador(caja.fuid_creados)}</strong>{' '}
                                  {caja.fuid_creados === 1 ? 'registro' : 'registros'}
                                </span>
                                {(caja.rango_inicio || caja.ultimo_upd_caja) && (
                                  <span className="font-mono text-xs text-silver-500">
                                    {formatUpd(caja.rango_inicio)} → {formatUpd(caja.ultimo_upd_caja ?? caja.rango_ultimo)}
                                  </span>
                                )}
                                {caja.estado_caja === CAJA_FINALIZADA ? (
                                  <span className="ml-auto flex flex-wrap items-center gap-2">
                                    {/*
                                      Consultar lo que tiene la caja no obliga a
                                      reabrirla: lleva a la misma pantalla, donde
                                      con la caja cerrada se ven los registros y
                                      no el formulario.
                                    */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        navigate(`/cajas/${caja.id}/datos`, { state: { from: '/mi-panel' } })
                                      }
                                    >
                                      <Eye className="size-4" /> Ver registros
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      loading={reabrir.isPending && reabrir.variables === caja.id}
                                      onClick={() => reabrir.mutate(caja.id)}
                                    >
                                      <LockOpen className="size-4" /> Reabrir caja
                                    </Button>
                                  </span>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="ml-auto"
                                    onClick={() =>
                                      navigate(`/cajas/${caja.id}/datos`, { state: { from: '/mi-panel' } })
                                    }
                                  >
                                    <Package className="size-4" /> Digitar
                                  </Button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
