import { describe, expect, it } from 'vitest';
import { FUID_COLUMNS, fuidValues } from '../fuid.service.js';
import { CAMPOS_NO_DILIGENCIADOS, VALOR_NO_DILIGENCIADO } from '../../config/constants.js';
import type { FuidCreateDto } from '../../types/index.js';

/**
 * `fuidValues` devuelve un array posicional que acompaña a `FUID_COLUMNS` en el
 * INSERT. Comprobarlo por índice haría ilegibles las pruebas y las rompería al
 * añadir una columna, así que se vuelve a emparejar con su nombre.
 */
function porColumna(dto: Partial<FuidCreateDto>): Record<string, unknown> {
  const valores = fuidValues(dto as FuidCreateDto);
  return Object.fromEntries(FUID_COLUMNS.map((columna, i) => [columna, valores[i]]));
}

/*
 * Lo mínimo que identifica un registro: la caja, el UPD y el asunto
 * automático. El asunto manual no está a propósito —dejó de ser obligatorio y
 * ahora es uno más de los que se guardan como `N/A` cuando no vienen—, así que
 * el recorrido de `CAMPOS_NO_DILIGENCIADOS` lo comprueba como a los demás.
 */
const registro: Partial<FuidCreateDto> = {
  caja: '051C000456',
  upd: 'UPD2950163',
  asunto_2: 'TUTELA',
};

describe('campos no diligenciados', () => {
  it('guarda como N/A los campos de texto que llegan vacíos', () => {
    const fila = porColumna({ ...registro, notas: '', serie: '   ', radicado: null });
    expect(fila.notas).toBe(VALOR_NO_DILIGENCIADO);
    expect(fila.serie).toBe(VALOR_NO_DILIGENCIADO);
    expect(fila.radicado).toBe(VALOR_NO_DILIGENCIADO);
  });

  it('también cuando el campo ni siquiera viene en la petición', () => {
    const fila = porColumna(registro);
    for (const campo of CAMPOS_NO_DILIGENCIADOS) {
      expect(fila[campo], `${campo} debería guardarse como N/A`).toBe(VALOR_NO_DILIGENCIADO);
    }
  });

  it('el asunto manual se guarda si se escribió, y como N/A si no', () => {
    expect(porColumna({ ...registro, asunto_3: 'RESPUESTA A LA ACCION DE TUTELA' }).asunto_3).toBe(
      'RESPUESTA A LA ACCION DE TUTELA',
    );
    expect(porColumna({ ...registro, asunto_3: '' }).asunto_3).toBe(VALOR_NO_DILIGENCIADO);
    expect(porColumna(registro).asunto_3).toBe(VALOR_NO_DILIGENCIADO);
  });

  it('respeta el valor cuando el digitador sí escribió algo', () => {
    const fila = porColumna({ ...registro, notas: 'DOCUMENTO EN MAL ESTADO', folios: '12' });
    expect(fila.notas).toBe('DOCUMENTO EN MAL ESTADO');
    expect(fila.folios).toBe('12');
  });

  it('deja en NULL las columnas que no admiten el literal', () => {
    const fila = porColumna({
      ...registro,
      fecha_inicial: '',
      fecha_final: null,
      fecha_transferencia: '',
      n_orden: null,
      tiempo: '',
    });
    for (const columna of ['fecha_inicial', 'fecha_final', 'fecha_transferencia', 'n_orden', 'tiempo']) {
      expect(fila[columna], `${columna} no puede guardar N/A`).toBeNull();
    }
  });

  it('no marca como N/A lo que llena el sistema', () => {
    // `elaborado_por` guarda "NOMBRE (CC)" y los reportes lo cruzan con `users`
    // por la cédula: un N/A ahí dejaría el registro fuera de ese cruce.
    const fila = porColumna({ ...registro, elaborado_por: '', sede: '', cambio_calidad: '' });
    expect(fila.elaborado_por).toBeNull();
    expect(fila.sede).toBeNull();
    expect(fila.cambio_calidad).toBeNull();
  });

  it('cada columna declarada existe en la tabla', () => {
    for (const campo of CAMPOS_NO_DILIGENCIADOS) {
      expect(FUID_COLUMNS as readonly string[]).toContain(campo);
    }
  });

  it('devuelve un valor por columna, en el mismo orden', () => {
    expect(fuidValues(registro as FuidCreateDto)).toHaveLength(FUID_COLUMNS.length);
  });
});

/**
 * La mayoría de los documentos son de un solo día: quien digita escribe la fecha
 * inicial y deja la final en blanco. Guardarla vacía dejaba el rango abierto, así
 * que cuando falta se guarda la inicial y el documento queda con su fecha de
 * principio y fin en el mismo día.
 */
describe('fecha final ausente', () => {
  it('se guarda la fecha inicial cuando la final llega vacía', () => {
    expect(porColumna({ ...registro, fecha_inicial: '2025-03-14', fecha_final: '' }).fecha_final).toBe(
      '2025-03-14',
    );
  });

  it('también cuando la final llega como null o con solo espacios', () => {
    expect(porColumna({ ...registro, fecha_inicial: '2025-03-14', fecha_final: null }).fecha_final).toBe(
      '2025-03-14',
    );
    expect(porColumna({ ...registro, fecha_inicial: '2025-03-14', fecha_final: '   ' }).fecha_final).toBe(
      '2025-03-14',
    );
  });

  it('también cuando la final ni siquiera viene en la petición', () => {
    expect(porColumna({ ...registro, fecha_inicial: '2025-03-14' }).fecha_final).toBe('2025-03-14');
  });

  it('no toca la fecha final cuando el documento sí abarca varios días', () => {
    const fila = porColumna({ ...registro, fecha_inicial: '2025-03-14', fecha_final: '2025-04-02' });
    expect(fila.fecha_inicial).toBe('2025-03-14');
    expect(fila.fecha_final).toBe('2025-04-02');
  });

  it('sin fecha inicial no hay nada que copiar: las dos quedan en NULL', () => {
    const fila = porColumna({ ...registro, fecha_inicial: '', fecha_final: '' });
    expect(fila.fecha_inicial).toBeNull();
    expect(fila.fecha_final).toBeNull();
  });

  it('la fecha inicial no se toca nunca', () => {
    expect(porColumna({ ...registro, fecha_inicial: '2025-03-14', fecha_final: '' }).fecha_inicial).toBe(
      '2025-03-14',
    );
  });
});
