import { describe, expect, it } from 'vitest';
import { createModuloClienteSchema } from '../moduloscliente.validator.js';
import { VALOR_NO_DILIGENCIADO } from '../../config/constants.js';

/** Lo que identifica un acta: el cliente al que pertenece y su número. */
const base = {
  id_submodulo: 2,
  acta_transferencia_modulo: '001',
  fecha_trans_modulo: '2025-03-10',
};

describe('campos descriptivos del acta', () => {
  it('deja crear el acta sin código ni entidad remitente', () => {
    expect(createModuloClienteSchema.safeParse(base).success).toBe(true);
  });

  it('los guarda como N/A', () => {
    for (const campo of ['codigo', 'entidad_remitente'] as const) {
      for (const valor of [undefined, null, '', '  ']) {
        const resultado = createModuloClienteSchema.safeParse({ ...base, [campo]: valor });
        expect(resultado.success, `${campo} con ${JSON.stringify(valor)}`).toBe(true);
        if (resultado.success) expect(resultado.data[campo]).toBe(VALOR_NO_DILIGENCIADO);
      }
    }
  });

  it('respeta lo que sí se escribió', () => {
    const r = createModuloClienteSchema.safeParse({ ...base, codigo: '054' });
    expect(r.success && r.data.codigo).toBe('054');
  });
});

describe('lo que el acta sigue exigiendo', () => {
  it('el número de acta, que es lo que la distingue', () => {
    expect(createModuloClienteSchema.safeParse({ ...base, acta_transferencia_modulo: '' }).success).toBe(false);
  });

  it('el cliente al que pertenece', () => {
    expect(createModuloClienteSchema.safeParse({ ...base, id_submodulo: undefined }).success).toBe(false);
    expect(createModuloClienteSchema.safeParse({ ...base, id_submodulo: 0 }).success).toBe(false);
  });

  it('una fecha de transferencia válida cuando viene', () => {
    expect(createModuloClienteSchema.safeParse({ ...base, fecha_trans_modulo: '2030-01-01' }).success).toBe(false);
  });
});
