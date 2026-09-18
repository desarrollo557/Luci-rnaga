import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, type PersonaEnActividad } from '@/lib/api';
import { fechaHoyLocal } from '@/lib/fechas';
import { intervaloRefresco } from '@/lib/refresco';

/**
 * Lo que hace falta de cada persona para medir su presencia.
 *
 * Fuera del componente a propósito: es una función pura y declararla dentro
 * obligaría a recrearla en cada render y a listarla como dependencia de todos
 * los cálculos que la usan.
 */
export function señalesDe(p: PersonaEnActividad) {
  return {
    ultimaActividad: p.ultima_actividad,
    ultimaEscritura: p.ultima_escritura,
    ultimoRegistro: p.ultimo_registro,
  };
}

/**
 * La actividad del equipo de hoy, compartida por las dos secciones.
 *
 * Las dos —la tabla de quién está trabajando y el análisis por persona— viven
 * en la misma pantalla y necesitan lo mismo. Con la misma clave de consulta,
 * React Query hace una sola petición y las dos leen de ahí: abrir las dos
 * secciones no dobla el tráfico.
 *
 * El periodo es siempre hoy. Estas dos secciones responden a "cómo va la
 * jornada" y se refrescan solas; un selector de fechas aquí invitaría a mirar
 * la semana pasada en una pantalla que dice quién está conectado ahora.
 */
export function useActividad() {
  const hoy = fechaHoyLocal();
  const consulta = useQuery({
    queryKey: ['actividad', hoy],
    queryFn: () => reportesApi.actividad({ desde: hoy, hasta: hoy }).then((res) => res.data),
    refetchInterval: intervaloRefresco(),
  });

  const personas: PersonaEnActividad[] = useMemo(() => consulta.data?.personas ?? [], [consulta.data]);
  /*
   * El reloj del servidor, no el del equipo que mira. Llega en cada respuesta,
   * así que los estados envejecen solos en cada refresco sin que nadie toque
   * nada.
   */
  const ahora = useMemo(
    () => (consulta.data?.ahora ? new Date(consulta.data.ahora) : new Date()),
    [consulta.data?.ahora],
  );

  return { ...consulta, personas, ahora };
}
