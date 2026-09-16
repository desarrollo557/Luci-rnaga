import { describe, expect, it } from 'vitest';
import { etiquetaDeRuta, origenInterno, retornoDeCaja, rutaDelActa } from '../navegacion';

/**
 * El botón "atrás" de las vistas de caja.
 *
 * La jerarquía es Cliente → Acta → Caja → Digitación, pero las dos últimas
 * vistas cuelgan de rutas planas que no dicen de qué acta vienen. El agujero
 * que esto cierra era concreto: al entrar por un enlace directo, el botón decía
 * "Volver a Cajas" y saltaba dos niveles de golpe hasta la lista de clientes.
 */

describe('de dónde se vino', () => {
  it('reconoce una ruta interna', () => {
    expect(origenInterno({ from: '/clientes/33/actas' })).toBe('/clientes/33/actas');
  });

  it('descarta lo que no es una ruta', () => {
    expect(origenInterno(null)).toBeNull();
    expect(origenInterno({})).toBeNull();
    expect(origenInterno({ from: 42 })).toBeNull();
  });

  it('no deja que el estado de navegación mande fuera de la aplicación', () => {
    // `//evil.com` lo interpreta el navegador como otro dominio.
    expect(origenInterno({ from: '//otro-sitio.com' })).toBeNull();
    expect(origenInterno({ from: 'https://otro-sitio.com' })).toBeNull();
  });
});

describe('el acta de la caja', () => {
  it('se deriva del propio dato de la caja', () => {
    expect(rutaDelActa({ id_modulo_caja: 33 })).toBe('/clientes/33/actas');
  });

  it('sin acta no hay ruta', () => {
    expect(rutaDelActa(null)).toBeNull();
    expect(rutaDelActa({})).toBeNull();
    expect(rutaDelActa({ id_modulo_caja: null })).toBeNull();
  });
});

describe('el botón nombra el sitio al que lleva', () => {
  it('cada vista tiene su nombre', () => {
    expect(etiquetaDeRuta('/mi-panel')).toBe('Volver a Mi Panel');
    expect(etiquetaDeRuta('/clientes')).toBe('Volver a Clientes');
    expect(etiquetaDeRuta('/clientes/33/actas')).toBe('Volver al acta');
    expect(etiquetaDeRuta('/clientes/33/actas/22/cajas')).toBe('Volver a la caja');
  });

  it('una ruta desconocida no inventa un nombre', () => {
    expect(etiquetaDeRuta('/otra-cosa')).toBe('Volver');
  });
});

describe('a dónde vuelve, en los tres casos', () => {
  it('a la vista de la que se vino, cuando consta', () => {
    const retorno = retornoDeCaja({ from: '/mi-panel' }, { id_modulo_caja: 33 });
    expect(retorno).toEqual({ to: '/mi-panel', label: 'Volver a Mi Panel' });
  });

  it('al acta de la caja cuando se entró por enlace directo', () => {
    // Este es el hueco que se arregló: antes caía en /clientes.
    const retorno = retornoDeCaja(null, { id_modulo_caja: 33 });
    expect(retorno).toEqual({ to: '/clientes/33/actas', label: 'Volver al acta' });
  });

  it('a clientes solo si la caja no tiene acta', () => {
    const retorno = retornoDeCaja(null, null);
    expect(retorno).toEqual({ to: '/clientes', label: 'Volver a Clientes' });
  });

  it('el origen manda sobre el acta', () => {
    const retorno = retornoDeCaja({ from: '/clientes/33/actas/22/cajas' }, { id_modulo_caja: 99 });
    expect(retorno.to).toBe('/clientes/33/actas/22/cajas');
  });
});
