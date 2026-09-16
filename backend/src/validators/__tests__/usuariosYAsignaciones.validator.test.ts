import { describe, expect, it } from 'vitest';
import { ROLES, createUserSchema, updateUserSchema } from '../users.validator.js';
import { loginSchema } from '../auth.validator.js';
import {
  asignarUsuariosSchema,
  usuariosOnlySchema,
} from '../asignaciones.validator.js';
import { createSubModuloSchema } from '../submodulos.validator.js';

/**
 * Lo que guarda la puerta de los datos que identifican a alguien o relacionan
 * registros entre sí: la cuenta de un usuario, el inicio de sesión, la
 * asignación de una caja y el código de un cliente.
 *
 * Ninguno de estos campos admite el marcador `N/A`: una cédula en blanco no es
 * un dato que falte, es una cuenta con la que nadie puede entrar, y una caja
 * asignada a un usuario inexistente no se descubre hasta que alguien pregunta
 * por qué no le aparece el trabajo.
 */

const usuarioBase = {
  cc: '1234567890',
  nombre: 'MARIA PEREZ',
  contrasena: 'clave-larga',
  rol: 'TECNICA',
  sede: 'BARRANQUILLA',
};

describe('crear un usuario', () => {
  it('acepta los tres perfiles del software', () => {
    expect([...ROLES]).toEqual(['ADMIN', 'LIDER', 'TECNICA']);
    for (const rol of ROLES) {
      expect(createUserSchema.safeParse({ ...usuarioBase, rol }).success, rol).toBe(true);
    }
  });

  it('rechaza el perfil CALIDAD, que se retiró del software', () => {
    expect(createUserSchema.safeParse({ ...usuarioBase, rol: 'CALIDAD' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ ...usuarioBase, rol: 'CALIDAD' }).success).toBe(false);
  });

  it('rechaza un perfil inventado', () => {
    expect(createUserSchema.safeParse({ ...usuarioBase, rol: 'SUPERVISOR' }).success).toBe(false);
  });

  it('exige cédula, nombre, contraseña y sede', () => {
    for (const campo of ['cc', 'nombre', 'contrasena', 'sede'] as const) {
      const { [campo]: _quitado, ...sinEse } = usuarioBase;
      expect(createUserSchema.safeParse(sinEse).success, campo).toBe(false);
    }
  });

  it('la cédula solo admite dígitos', () => {
    expect(createUserSchema.safeParse({ ...usuarioBase, cc: '12.345.678' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...usuarioBase, cc: 'ABC' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...usuarioBase, cc: '' }).success).toBe(false);
  });

  it('la contraseña tiene un mínimo', () => {
    expect(createUserSchema.safeParse({ ...usuarioBase, contrasena: '123' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...usuarioBase, contrasena: '1234' }).success).toBe(true);
  });

  it('el nombre necesita al menos tres caracteres', () => {
    expect(createUserSchema.safeParse({ ...usuarioBase, nombre: 'AB' }).success).toBe(false);
  });
});

describe('editar un usuario', () => {
  it('deja cambiar los datos sin tocar la contraseña', () => {
    const { contrasena: _sinClave, ...sinContrasena } = usuarioBase;
    expect(updateUserSchema.safeParse(sinContrasena).success).toBe(true);
  });

  it('si se manda una contraseña, sigue teniendo mínimo', () => {
    expect(updateUserSchema.safeParse({ ...usuarioBase, contrasena: '12' }).success).toBe(false);
  });
});

describe('inicio de sesión', () => {
  it('acepta cédula y contraseña', () => {
    expect(loginSchema.safeParse({ cc: '123456789', contrasena: 'x' }).success).toBe(true);
  });

  it('no deja entrar sin cédula o sin contraseña', () => {
    expect(loginSchema.safeParse({ contrasena: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ cc: '123456789' }).success).toBe(false);
    expect(loginSchema.safeParse({ cc: '', contrasena: 'x' }).success).toBe(false);
  });

  it('la cédula no admite letras', () => {
    expect(loginSchema.safeParse({ cc: 'admin', contrasena: 'x' }).success).toBe(false);
  });
});

describe('asignar usuarios a una caja', () => {
  it('acepta una lista de identificadores', () => {
    const r = asignarUsuariosSchema.safeParse({ modulo_id: 22, usuarios: [4, 7] });
    expect(r.success && r.data.usuarios).toEqual([4, 7]);
  });

  it('convierte los identificadores que llegan como texto', () => {
    const r = asignarUsuariosSchema.safeParse({ modulo_id: '22', usuarios: ['4'] });
    expect(r.success && r.data.modulo_id).toBe(22);
  });

  it('exige al menos un usuario', () => {
    expect(asignarUsuariosSchema.safeParse({ modulo_id: 22, usuarios: [] }).success).toBe(false);
    expect(usuariosOnlySchema.safeParse({ usuarios: [] }).success).toBe(false);
  });

  it('rechaza identificadores que no son enteros positivos', () => {
    for (const usuarios of [[0], [-3], [1.5], ['abc']]) {
      expect(asignarUsuariosSchema.safeParse({ modulo_id: 22, usuarios }).success, JSON.stringify(usuarios)).toBe(false);
    }
  });
});

describe('crear un cliente', () => {
  it('acepta código y entidad remitente, con la sede opcional', () => {
    expect(createSubModuloSchema.safeParse({ codigo: '051', entidad_remitente: 'ALCALDIA' }).success).toBe(true);
  });

  it('exige el código y la entidad, que son lo que identifica al cliente', () => {
    expect(createSubModuloSchema.safeParse({ codigo: '', entidad_remitente: 'ALCALDIA' }).success).toBe(false);
    expect(createSubModuloSchema.safeParse({ codigo: '051', entidad_remitente: '' }).success).toBe(false);
  });
});
