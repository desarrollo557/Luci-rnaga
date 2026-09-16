import { useState } from 'react';
import { toast } from 'sonner';
import { reportesApi } from '@/lib/api';
import { fechaHoyLocal } from '@/lib/fechas';
import { toastApiError } from '@/lib/feedback';
import { descargarBlob } from '@/lib/utils';

/**
 * Descarga del seguimiento de inventario (formato oficial F-PSD-IDA-001).
 *
 * El proceso tiene etapas de verdad y la pantalla las muestra tal cual ocurren:
 *
 * 1. `consultando`: se pregunta al servidor cuántas jornadas van a salir.
 * 2. `armando`: el servidor genera el archivo. Ya se sabe cuántas jornadas
 *    lleva, así que el aviso lo dice.
 * 3. `guardando`: el archivo llegó y se entrega al navegador.
 *
 * No son mensajes puestos con un temporizador: cada uno corresponde a una
 * petición o a un paso concreto, y por eso lo que se lee es lo que está pasando.
 */
export type EtapaSeguimiento = 'consultando' | 'armando' | 'guardando';

export interface FiltrosSeguimiento {
  desde?: string;
  hasta?: string;
  persona?: string;
}

const plural = (n: number) => `${n.toLocaleString('es-CO')} ${n === 1 ? 'jornada' : 'jornadas'}`;

/** Lo que se le dice a la persona mientras espera, según la etapa. */
export function mensajeDeEtapa(etapa: EtapaSeguimiento, jornadas: number | null): string {
  switch (etapa) {
    case 'consultando':
      return 'Consultando los registros digitados…';
    case 'armando':
      return jornadas == null
        ? 'Armando el formato oficial…'
        : `Armando el formato oficial con ${plural(jornadas)}…`;
    case 'guardando':
      return 'Guardando el archivo…';
  }
}

/** Nombre con el que se guarda el archivo: lleva el periodo pedido, o el día si no se pidió ninguno. */
export function nombreArchivoSeguimiento({ desde = '', hasta = '' }: FiltrosSeguimiento, hoy = fechaHoyLocal()): string {
  const periodo = desde && hasta ? `_${desde}_a_${hasta}` : desde ? `_desde_${desde}` : hasta ? `_hasta_${hasta}` : `_${hoy}`;
  return `Seguimiento_Inventario${periodo}.xlsx`;
}

export function useDescargaSeguimiento() {
  const [etapa, setEtapa] = useState<EtapaSeguimiento | null>(null);
  const [jornadas, setJornadas] = useState<number | null>(null);

  /** Devuelve `true` si el archivo llegó a descargarse. */
  const descargar = async (filtros: FiltrosSeguimiento): Promise<boolean> => {
    try {
      setEtapa('consultando');
      setJornadas(null);
      const { data: resumen } = await reportesApi.resumenSeguimiento(filtros);
      setJornadas(resumen.jornadas);
      if (resumen.jornadas === 0) {
        toast.error(
          filtros.desde || filtros.hasta
            ? 'Ningún registro encaja con esas fechas. Amplíe el periodo.'
            : 'Todavía no hay registros digitados para armar el seguimiento',
        );
        return false;
      }

      setEtapa('armando');
      const respuesta = await reportesApi.descargarSeguimiento(filtros);

      setEtapa('guardando');
      descargarBlob(respuesta.data as Blob, nombreArchivoSeguimiento(filtros));
      // El servidor dice cuántas jornadas trae el archivo: así se sabe si salió
      // con lo que se esperaba sin tener que abrirlo.
      const total = Number(respuesta.headers['x-total-jornadas'] ?? resumen.jornadas);
      toast.success(`Seguimiento descargado con ${plural(total)}`);
      return true;
    } catch (error) {
      // El servidor puede responder con un error en JSON; como la petición pide
      // un blob, ese mensaje llega como blob y hay que leerlo para mostrarlo.
      const datos = (error as { response?: { data?: unknown } }).response?.data;
      if (datos instanceof Blob) {
        try {
          const { error: mensaje } = JSON.parse(await datos.text()) as { error?: string };
          toast.error(mensaje ?? 'No se pudo descargar el seguimiento');
          return false;
        } catch {
          // No era JSON: cae al aviso genérico de abajo.
        }
      }
      toastApiError(error, { context: 'No se pudo descargar el seguimiento:' });
      return false;
    } finally {
      setEtapa(null);
    }
  };

  return {
    etapa,
    mensaje: etapa ? mensajeDeEtapa(etapa, jornadas) : null,
    descargando: etapa !== null,
    descargar,
  };
}
