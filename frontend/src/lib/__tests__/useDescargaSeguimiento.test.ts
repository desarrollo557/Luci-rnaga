import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * Descarga del seguimiento de inventario.
 *
 * Lo que se comprueba es que las etapas que ve la persona son las que de verdad
 * ocurren: "consultando" mientras se pregunta cuántas jornadas hay, "armando
 * con N jornadas" mientras el servidor genera el archivo, y nada cuando terminó.
 * Y que no se pide un archivo que se sabe vacío: si el resumen dice cero, se
 * avisa y no se llama a la descarga.
 */

const resumen = vi.fn();
const descarga = vi.fn();
const guardar = vi.fn();
const avisoError = vi.fn();
const avisoExito = vi.fn();
const avisoGenerico = vi.fn();

vi.mock('@/lib/api', () => ({
  reportesApi: {
    resumenSeguimiento: (...args: unknown[]) => resumen(...args),
    descargarSeguimiento: (...args: unknown[]) => descarga(...args),
  },
}));
vi.mock('@/lib/utils', () => ({ descargarBlob: (...args: unknown[]) => guardar(...args) }));
vi.mock('@/lib/feedback', () => ({ toastApiError: (...args: unknown[]) => avisoGenerico(...args) }));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => avisoError(...args),
    success: (...args: unknown[]) => avisoExito(...args),
  },
}));

import { mensajeDeEtapa, nombreArchivoSeguimiento, useDescargaSeguimiento } from '../useDescargaSeguimiento';

/** Una promesa que se resuelve desde fuera, para parar el flujo en cada etapa. */
function pendiente<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDescargaSeguimiento', () => {
  it('pasa por consultando y armando, con la cifra de jornadas, y termina sin etapa', async () => {
    const paso1 = pendiente<{ data: { jornadas: number; registros: number } }>();
    const paso2 = pendiente<{ data: Blob; headers: Record<string, string> }>();
    resumen.mockReturnValue(paso1.promesa);
    descarga.mockReturnValue(paso2.promesa);

    const { result } = renderHook(() => useDescargaSeguimiento());
    expect(result.current.descargando).toBe(false);
    expect(result.current.mensaje).toBeNull();

    let resultado!: Promise<boolean>;
    act(() => {
      resultado = result.current.descargar({ desde: '2026-09-01', hasta: '2026-09-15' });
    });
    expect(result.current.etapa).toBe('consultando');
    expect(result.current.descargando).toBe(true);
    expect(result.current.mensaje).toMatch(/consultando/i);
    expect(resumen).toHaveBeenCalledWith({ desde: '2026-09-01', hasta: '2026-09-15' });
    expect(descarga).not.toHaveBeenCalled();

    await act(async () => {
      paso1.resolver({ data: { jornadas: 1245, registros: 30000 } });
    });
    expect(result.current.etapa).toBe('armando');
    expect(result.current.mensaje).toMatch(/armando/i);
    expect(result.current.mensaje).toContain('jornadas');
    expect(result.current.mensaje).toMatch(/1[.,]245/);
    expect(descarga).toHaveBeenCalledWith({ desde: '2026-09-01', hasta: '2026-09-15' });

    const archivo = new Blob(['xlsx']);
    await act(async () => {
      paso2.resolver({ data: archivo, headers: { 'x-total-jornadas': '1245' } });
    });
    await expect(resultado).resolves.toBe(true);
    expect(result.current.etapa).toBeNull();
    expect(result.current.descargando).toBe(false);
    expect(guardar).toHaveBeenCalledWith(archivo, 'Seguimiento_Inventario_2026-09-01_a_2026-09-15.xlsx');
    expect(avisoExito).toHaveBeenCalledTimes(1);
    expect(String(avisoExito.mock.calls[0][0])).toMatch(/1[.,]245 jornadas/);
    expect(avisoError).not.toHaveBeenCalled();
  });

  it('si el resumen dice cero, avisa y no pide el archivo', async () => {
    resumen.mockResolvedValue({ data: { jornadas: 0, registros: 0 } });

    const { result } = renderHook(() => useDescargaSeguimiento());
    let resultado!: Promise<boolean>;
    await act(async () => {
      resultado = result.current.descargar({ desde: '2026-01-01', hasta: '2026-01-02' });
    });

    await expect(resultado).resolves.toBe(false);
    expect(descarga).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(avisoError).toHaveBeenCalledTimes(1);
    expect(String(avisoError.mock.calls[0][0])).toMatch(/fechas/i);
    expect(result.current.etapa).toBeNull();
  });

  it('con cero jornadas y sin filtros, el aviso dice que no hay nada digitado', async () => {
    resumen.mockResolvedValue({ data: { jornadas: 0, registros: 0 } });
    const { result } = renderHook(() => useDescargaSeguimiento());
    await act(async () => {
      await result.current.descargar({});
    });
    expect(String(avisoError.mock.calls[0][0])).toMatch(/no hay registros/i);
  });

  it('usa una sola jornada en singular', () => {
    expect(mensajeDeEtapa('armando', 1)).toBe('Armando el formato oficial con 1 jornada…');
    expect(mensajeDeEtapa('armando', null)).toBe('Armando el formato oficial…');
    expect(mensajeDeEtapa('guardando', 7)).toMatch(/guardando/i);
  });

  it('el error del servidor llega como blob y se muestra su mensaje', async () => {
    resumen.mockResolvedValue({ data: { jornadas: 3, registros: 10 } });
    const cuerpo = JSON.stringify({ error: 'La plantilla oficial no está disponible' });
    const blob = new Blob([cuerpo], { type: 'application/json' });
    // jsdom no siempre trae `Blob.text()`; el hook lo necesita para leer el aviso.
    if (typeof blob.text !== 'function') Object.defineProperty(blob, 'text', { value: async () => cuerpo });
    descarga.mockRejectedValue({ response: { status: 500, data: blob } });

    const { result } = renderHook(() => useDescargaSeguimiento());
    let resultado!: Promise<boolean>;
    await act(async () => {
      resultado = result.current.descargar({});
    });

    await expect(resultado).resolves.toBe(false);
    expect(avisoError).toHaveBeenCalledWith('La plantilla oficial no está disponible');
    expect(avisoGenerico).not.toHaveBeenCalled();
    expect(result.current.etapa).toBeNull();
  });

  it('cualquier otro error cae en el aviso genérico y deja el flujo limpio', async () => {
    resumen.mockRejectedValue(new Error('sin red'));
    const { result } = renderHook(() => useDescargaSeguimiento());
    await act(async () => {
      await result.current.descargar({});
    });
    expect(avisoGenerico).toHaveBeenCalledTimes(1);
    expect(result.current.descargando).toBe(false);
  });
});

describe('nombreArchivoSeguimiento', () => {
  it('lleva el periodo pedido o el día de hoy', () => {
    expect(nombreArchivoSeguimiento({ desde: '2026-09-01', hasta: '2026-09-15' })).toBe(
      'Seguimiento_Inventario_2026-09-01_a_2026-09-15.xlsx',
    );
    expect(nombreArchivoSeguimiento({ desde: '2026-09-01' })).toBe('Seguimiento_Inventario_desde_2026-09-01.xlsx');
    expect(nombreArchivoSeguimiento({ hasta: '2026-09-15' })).toBe('Seguimiento_Inventario_hasta_2026-09-15.xlsx');
    expect(nombreArchivoSeguimiento({}, '2026-09-16')).toBe('Seguimiento_Inventario_2026-09-16.xlsx');
  });
});
