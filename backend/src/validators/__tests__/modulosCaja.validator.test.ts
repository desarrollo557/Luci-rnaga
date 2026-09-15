import { describe, expect, it } from 'vitest';
import {
  createModuloCajaSchema,
  createSerieCajasSchema,
  updateModuloCajaSchema,
} from '../modulosCaja.validator.js';
import { VALOR_NO_DILIGENCIADO } from '../../config/constants.js';

/**
 * Lo que identifica una caja y MySQL declara NOT NULL. Cada prueba añade encima
 * solo el campo que está comprobando.
 */
const base = {
  caja_modulo: '051C000456',
  entidad_remitente_caja: 'CLINICA ALTOS DE SAN VICENTE',
  acta_trans_caja: '001',
  fecha_trans_caja: '2025-03-10',
  id_modulo_caja: 3,
  estado_caja: 'EN PROCESO',
};

const DESCRIPTIVOS = [
  'entidad_productora_caja',
  'unidad_administrativa_caja',
  'oficina_productora_caja',
  'objeto_caja',
] as const;

describe('campos descriptivos de la caja', () => {
  it('deja crear la caja sin ninguno de los cuatro', () => {
    const resultado = createModuloCajaSchema.safeParse(base);
    expect(resultado.success).toBe(true);
  });

  it('los guarda como N/A cuando llegan vacíos, en blanco o ausentes', () => {
    for (const campo of DESCRIPTIVOS) {
      for (const valor of [undefined, null, '', '   ']) {
        const resultado = createModuloCajaSchema.safeParse({ ...base, [campo]: valor });
        expect(resultado.success, `${campo} con ${JSON.stringify(valor)}`).toBe(true);
        if (resultado.success) {
          expect(resultado.data[campo]).toBe(VALOR_NO_DILIGENCIADO);
        }
      }
    }
  });

  it('respeta el valor cuando sí se diligenció', () => {
    const resultado = createModuloCajaSchema.safeParse({
      ...base,
      oficina_productora_caja: 'ARCHIVO CENTRAL',
    });
    expect(resultado.success && resultado.data.oficina_productora_caja).toBe('ARCHIVO CENTRAL');
  });

  it('rechaza un texto más largo que su columna', () => {
    const resultado = createModuloCajaSchema.safeParse({
      ...base,
      oficina_productora_caja: 'A'.repeat(256),
    });
    expect(resultado.success).toBe(false);
  });
});

describe('objeto de la caja', () => {
  it('acepta los dos valores del catálogo', () => {
    for (const objeto of ['TRANSFERENCIA PRIMARIA', 'VALORACION DOCUMENTAL']) {
      const resultado = createModuloCajaSchema.safeParse({ ...base, objeto_caja: objeto });
      expect(resultado.success && resultado.data.objeto_caja, objeto).toBe(objeto);
    }
  });

  it('rechaza al crear cualquier otro texto', () => {
    const resultado = createModuloCajaSchema.safeParse({ ...base, objeto_caja: 'HISTORIAS CLINICAS' });
    expect(resultado.success).toBe(false);
  });

  it('lo admite al editar, porque las cajas antiguas lo tienen guardado', () => {
    const { id_modulo_caja: _omitido, ...paraEditar } = base;
    const resultado = updateModuloCajaSchema.safeParse({
      ...paraEditar,
      objeto_caja: 'ORGANIZACION Y DESCRIPCION DOCUMENTAL',
    });
    expect(resultado.success && resultado.data.objeto_caja).toBe(
      'ORGANIZACION Y DESCRIPCION DOCUMENTAL',
    );
  });
});

/**
 * El formulario "Nueva caja" no usa `POST /modulos_caja`, sino el de la serie.
 * Ahí es donde el usuario veía "Faltan campos requeridos" al dejar en blanco la
 * oficina productora o el objeto, así que la regla del N/A se comprueba también
 * sobre este esquema y no solo sobre el de la caja suelta.
 */
describe('serie de cajas del formulario', () => {
  const serie = (() => {
    const { caja_modulo: _omitido, ...resto } = base;
    return { ...resto, numero_inicial: '000456', numero_final: '000460' };
  })();

  it('deja crear la serie sin los campos descriptivos y los guarda como N/A', () => {
    const resultado = createSerieCajasSchema.safeParse(serie);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      for (const campo of DESCRIPTIVOS) {
        expect(resultado.data[campo], campo).toBe(VALOR_NO_DILIGENCIADO);
      }
    }
  });

  it('sigue exigiendo los dos números de seis dígitos', () => {
    expect(createSerieCajasSchema.safeParse({ ...serie, numero_inicial: '456' }).success).toBe(false);
    expect(createSerieCajasSchema.safeParse({ ...serie, numero_final: undefined }).success).toBe(false);
  });

  it('conserva los usuarios que se asignan a toda la serie', () => {
    const resultado = createSerieCajasSchema.safeParse({
      ...serie,
      usuarios_tecnica: [4, 7],
      usuarios_calidad: [9],
    });
    expect(resultado.success && resultado.data.usuarios_tecnica).toEqual([4, 7]);
    expect(resultado.success && resultado.data.usuarios_calidad).toEqual([9]);
  });
});

describe('lo que la caja sigue exigiendo', () => {
  it('el número de caja, con su formato', () => {
    expect(createModuloCajaSchema.safeParse({ ...base, caja_modulo: undefined }).success).toBe(false);
    expect(createModuloCajaSchema.safeParse({ ...base, caja_modulo: '51C456' }).success).toBe(false);
  });

  it('la entidad remitente y el acta de transferencia', () => {
    expect(createModuloCajaSchema.safeParse({ ...base, entidad_remitente_caja: '' }).success).toBe(false);
    expect(createModuloCajaSchema.safeParse({ ...base, acta_trans_caja: '' }).success).toBe(false);
  });

  it('un estado de la lista cerrada', () => {
    expect(createModuloCajaSchema.safeParse({ ...base, estado_caja: 'ARCHIVADA' }).success).toBe(false);
  });

  it('una fecha de transferencia dentro de los límites documentales', () => {
    expect(createModuloCajaSchema.safeParse({ ...base, fecha_trans_caja: '1919-12-31' }).success).toBe(false);
    expect(createModuloCajaSchema.safeParse({ ...base, fecha_trans_caja: '2025-02-30' }).success).toBe(false);
  });
});
