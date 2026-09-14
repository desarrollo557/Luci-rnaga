import { describe, expect, it } from 'vitest';
import {
  createFuidSchema,
  updateFuidSchema,
  validarOrdenDeFechasParcial,
} from '../fuiddatosreal.validator.js';
import { FECHA_MINIMA_DOCUMENTAL } from '../../config/constants.js';
import { fechaHoyLocal } from '../../utils/format.js';

/**
 * Los únicos dos campos que `createFuidSchema` exige. Todo lo demás es opcional,
 * así que cada prueba solo añade el campo que está comprobando.
 */
const base = { caja: '051C000456', upd: 'UPD2950163' };

/** Mensajes de error del schema, o `null` si el registro se aceptó. */
function erroresDe(datos: Record<string, unknown>): string[] | null {
  const resultado = createFuidSchema.safeParse({ ...base, ...datos });
  if (resultado.success) return null;
  return resultado.error.issues.map((i) => i.message);
}

/** Campos sobre los que se reportó cada error. */
function camposConError(datos: Record<string, unknown>): string[] {
  const resultado = createFuidSchema.safeParse({ ...base, ...datos });
  return resultado.success ? [] : resultado.error.issues.map((i) => i.path.join('.'));
}

describe('punto 1 — límites de fecha', () => {
  it('acepta una fecha dentro del rango', () => {
    expect(erroresDe({ fecha_inicial: '2024-05-10' })).toBeNull();
  });

  it('acepta que la fecha venga vacía: el campo es opcional', () => {
    expect(erroresDe({ fecha_inicial: null })).toBeNull();
    expect(erroresDe({ fecha_inicial: '' })).toBeNull();
  });

  it('rechaza una fecha anterior al límite archivístico', () => {
    expect(erroresDe({ fecha_inicial: '1919-12-31' })).toEqual([
      `La fecha inicial no puede ser anterior a ${FECHA_MINIMA_DOCUMENTAL}`,
    ]);
  });

  it('acepta justo el límite archivístico', () => {
    expect(erroresDe({ fecha_inicial: FECHA_MINIMA_DOCUMENTAL })).toBeNull();
  });

  it('rechaza una fecha futura', () => {
    expect(erroresDe({ fecha_inicial: '2030-01-01' })).toEqual([
      `La fecha inicial no puede ser posterior a hoy (${fechaHoyLocal()})`,
    ]);
  });

  it('acepta la fecha de hoy', () => {
    expect(erroresDe({ fecha_inicial: fechaHoyLocal() })).toBeNull();
  });

  it('rechaza un día que no existe en el calendario', () => {
    expect(erroresDe({ fecha_inicial: '2025-02-30' })).toEqual([
      'La fecha inicial no corresponde a un día que exista en el calendario',
    ]);
    expect(erroresDe({ fecha_inicial: '2025-13-01' })).not.toBeNull();
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(erroresDe({ fecha_inicial: '2024-02-29' })).toBeNull();
  });

  it('rechaza un formato que no sea AAAA-MM-DD', () => {
    expect(erroresDe({ fecha_inicial: '10/05/2024' })).toEqual([
      'La fecha inicial debe tener el formato AAAA-MM-DD',
    ]);
  });

  it('aplica la misma regla a las demás fechas del registro', () => {
    expect(erroresDe({ fecha_del_dato: '1800-01-01' })).not.toBeNull();
    expect(erroresDe({ fecha_transferencia: '2030-01-01' })).not.toBeNull();
  });
});

describe('punto 2 — fecha_final no puede ser anterior a fecha_inicial', () => {
  it('acepta un rango en orden', () => {
    expect(erroresDe({ fecha_inicial: '2024-05-01', fecha_final: '2024-05-10' })).toBeNull();
  });

  it('acepta que ambas sean el mismo día', () => {
    expect(erroresDe({ fecha_inicial: '2024-05-10', fecha_final: '2024-05-10' })).toBeNull();
  });

  it('rechaza un rango invertido', () => {
    expect(erroresDe({ fecha_inicial: '2024-05-10', fecha_final: '2024-05-01' })).toEqual([
      'La fecha final no puede ser anterior a la fecha inicial',
    ]);
  });

  it('reporta el error sobre fecha_final, que es el campo recién escrito', () => {
    expect(camposConError({ fecha_inicial: '2024-05-10', fecha_final: '2024-05-01' })).toEqual([
      'fecha_final',
    ]);
  });

  it('no compara si falta una de las dos', () => {
    expect(erroresDe({ fecha_final: '2024-05-01' })).toBeNull();
    expect(erroresDe({ fecha_inicial: '2024-05-10' })).toBeNull();
  });

  it('también valida el rango en una actualización', () => {
    const r = updateFuidSchema.safeParse({
      version: 1,
      fecha_inicial: '2024-05-10',
      fecha_final: '2024-05-01',
    });
    expect(r.success).toBe(false);
  });

  describe('edición parcial contra el registro guardado', () => {
    const guardado = { fecha_inicial: '2024-05-10', fecha_final: '2024-05-20' };

    it('rechaza mover solo la fecha final por detrás de la inicial guardada', () => {
      expect(validarOrdenDeFechasParcial({ fecha_final: '2024-01-01' }, guardado)).toBe(
        'La fecha final no puede ser anterior a la fecha inicial',
      );
    });

    it('rechaza mover solo la fecha inicial por delante de la final guardada', () => {
      expect(validarOrdenDeFechasParcial({ fecha_inicial: '2024-12-01' }, guardado)).toBe(
        'La fecha final no puede ser anterior a la fecha inicial',
      );
    });

    it('acepta un cambio que deja el rango en orden', () => {
      expect(validarOrdenDeFechasParcial({ fecha_final: '2024-06-01' }, guardado)).toBeNull();
    });

    it('no compara nada si se borra una de las dos fechas', () => {
      expect(validarOrdenDeFechasParcial({ fecha_inicial: null }, guardado)).toBeNull();
    });

    it('no toca los campos que no vienen en el cuerpo', () => {
      expect(validarOrdenDeFechasParcial({}, guardado)).toBeNull();
    });
  });
});

describe('punto 4 — numero_doc_hasta no puede ser menor que numero_doc', () => {
  it('acepta un rango en orden', () => {
    expect(erroresDe({ numero_doc: '80432620', numero_doc_hasta: '80432630' })).toBeNull();
  });

  it('acepta que ambos sean iguales', () => {
    expect(erroresDe({ numero_doc: '80432620', numero_doc_hasta: '80432620' })).toBeNull();
  });

  it('rechaza un rango invertido', () => {
    expect(erroresDe({ numero_doc: '80432620', numero_doc_hasta: '80432610' })).toEqual([
      'El número de documento final no puede ser menor que el inicial',
    ]);
  });

  it('no compara cuando alguno es N/A o texto libre', () => {
    expect(erroresDe({ numero_doc: 'N/A', numero_doc_hasta: '80432610' })).toBeNull();
    expect(erroresDe({ numero_doc: 'RAD-2024-B', numero_doc_hasta: 'RAD-2024-A' })).toBeNull();
  });

  it('compara con precisión por encima del entero seguro de JavaScript', () => {
    // Con Number, estos dos valores serían iguales y el rango invertido pasaría.
    expect(
      erroresDe({ numero_doc: '9007199254740993', numero_doc_hasta: '9007199254740992' }),
    ).toEqual(['El número de documento final no puede ser menor que el inicial']);
  });
});

describe('punto 5 — folios y tomo', () => {
  it('acepta un entero en folios', () => {
    expect(erroresDe({ folios: '120' })).toBeNull();
    expect(erroresDe({ folios: '0' })).toBeNull();
  });

  it('acepta N/A y vacío en folios, que es como está la base', () => {
    expect(erroresDe({ folios: 'N/A' })).toBeNull();
    expect(erroresDe({ folios: '' })).toBeNull();
    expect(erroresDe({ folios: null })).toBeNull();
  });

  it('rechaza letras y negativos en folios', () => {
    expect(erroresDe({ folios: 'FOLIOS' })).toEqual([
      'Los folios debe ser un número entero de 0 o más, o N/A',
    ]);
    expect(erroresDe({ folios: '-5' })).not.toBeNull();
    expect(erroresDe({ folios: '12.5' })).not.toBeNull();
  });

  it('acepta en tomo los formatos que se usan de verdad en producción', () => {
    for (const valor of ['1', '1/2', '2/2', '22 N 255', '1-1', 'N', 'N/A']) {
      expect(erroresDe({ tomo: valor })).toBeNull();
    }
  });

  it('rechaza un tomo negativo', () => {
    expect(erroresDe({ tomo: '-3' })).toEqual(['El tomo no puede ser un número negativo']);
  });

  it('rechaza en tomo la puntuación que solo puede venir de un error de tecleo', () => {
    expect(erroresDe({ tomo: '|' })).toEqual([
      'El tomo solo admite números, letras y los signos / - .',
    ]);
    expect(erroresDe({ tomo: '12@34' })).not.toBeNull();
  });
});

describe('punto 7 — soporte, frecuencia y otro son listas cerradas', () => {
  it('acepta los valores del catálogo', () => {
    expect(erroresDe({ soporte: 'CD' })).toBeNull();
    expect(erroresDe({ frecuencia: 'ALTA' })).toBeNull();
    expect(erroresDe({ otro: 'LIBROS' })).toBeNull();
  });

  it('acepta N/A y vacío', () => {
    expect(erroresDe({ soporte: 'N/A' })).toBeNull();
    expect(erroresDe({ soporte: '' })).toBeNull();
    expect(erroresDe({ soporte: null })).toBeNull();
  });

  it('rechaza un valor fuera del catálogo', () => {
    expect(erroresDe({ soporte: 'MICROFILM' })).toEqual([
      'El soporte debe ser uno de estos valores: N/A, CD, PLANOS',
    ]);
    expect(erroresDe({ frecuencia: 'SIEMPRE' })).not.toBeNull();
    expect(erroresDe({ otro: 'LIBRO' })).not.toBeNull();
  });

  it('da el mensaje en español, no el "Invalid input" de zod', () => {
    const errores = erroresDe({ soporte: 'MICROFILM' });
    expect(errores?.[0]).not.toContain('Invalid');
  });
});

describe('punto 9 — longitud máxima por columna', () => {
  it('acepta un texto de exactamente 255 caracteres', () => {
    expect(erroresDe({ asunto: 'A'.repeat(255) })).toBeNull();
  });

  it('rechaza un texto de 256 caracteres', () => {
    expect(erroresDe({ asunto: 'A'.repeat(256) })).toEqual([
      'El asunto no puede superar los 255 caracteres',
    ]);
  });

  it('nombra el campo que hay que recortar', () => {
    expect(camposConError({ entidad_remitente: 'A'.repeat(256) })).toEqual(['entidad_remitente']);
  });

  it('deja más margen a historial_y_cambios, que es una columna TEXT', () => {
    expect(erroresDe({ historial_y_cambios: 'A'.repeat(1000) })).toBeNull();
  });
});

describe('campos obligatorios y UPD', () => {
  it('exige la caja', () => {
    const r = createFuidSchema.safeParse({ upd: 'UPD2950163' });
    expect(r.success).toBe(false);
  });

  it('normaliza y valida el formato del UPD', () => {
    const r = createFuidSchema.safeParse({ ...base, upd: ' upd2950163 ' });
    expect(r.success && r.data.upd).toBe('UPD2950163');
  });

  it('rechaza un UPD con un número de dígitos distinto de siete', () => {
    expect(createFuidSchema.safeParse({ ...base, upd: 'UPD123' }).success).toBe(false);
  });
});

describe('punto 10 — la actualización exige la versión del registro', () => {
  it('acepta una actualización que trae la versión', () => {
    expect(updateFuidSchema.safeParse({ version: 3, asunto: 'ALGO' }).success).toBe(true);
  });

  it('rechaza una actualización sin versión', () => {
    expect(updateFuidSchema.safeParse({ asunto: 'ALGO' }).success).toBe(false);
  });

  it('rechaza una versión que no sea un entero positivo', () => {
    expect(updateFuidSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(updateFuidSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(updateFuidSchema.safeParse({ version: 1.5 }).success).toBe(false);
  });
});
