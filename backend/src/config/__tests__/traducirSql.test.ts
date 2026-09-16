import { describe, expect, it } from 'vitest';
import { traducirSql } from '../db.js';

/**
 * Traducción de las consultas al dialecto de PostgreSQL.
 *
 * El código se escribe con `?`, como en MySQL, y esta capa los convierte en `$1`,
 * `$2`… **por orden de aparición en el texto**. Es una fuente de errores callados:
 * el SQL sigue siendo válido, la consulta se ejecuta, y lo único que pasa es que
 * los valores entran en el sitio equivocado. Nada falla, solo sale mal.
 *
 * Es exactamente lo que ocurriría en la consulta de actas del inventario si
 * alguien moviera la fecha de última lectura detrás del cliente en el array de
 * parámetros: el `FILTER` compararía contra el identificador del cliente y la
 * cuenta de trabajo sin reflejar saldría en cero siempre.
 */

describe('los parámetros se numeran por orden de aparición', () => {
  it('uno solo se convierte en $1', () => {
    const r = traducirSql('SELECT * FROM users WHERE cc = ?', ['123']);
    expect(r.text).toBe('SELECT * FROM users WHERE cc = $1');
    expect(r.values).toEqual(['123']);
  });

  it('varios se numeran en el orden del texto, no en el del array', () => {
    const r = traducirSql('SELECT * FROM t WHERE a = ? AND b = ? AND c = ?', [1, 2, 3]);
    expect(r.text).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3');
    expect(r.values).toEqual([1, 2, 3]);
  });

  it('un parámetro del SELECT va antes que uno del WHERE', () => {
    // La forma de la consulta de actas del inventario: la fecha de última
    // lectura vive en el FILTER, que está en el SELECT, y el cliente en el WHERE.
    const r = traducirSql(
      `SELECT COUNT(f.id) FILTER (WHERE f.created_at > ?) AS sin_reflejar
       FROM moduloscliente mcl
       LEFT JOIN fuiddatosreal f ON f.caja = mcl.codigo
       WHERE mcl.id_submodulo = ?`,
      ['2026-09-16 10:00:00', 7],
    );
    expect(r.text).toContain('created_at > $1');
    expect(r.text).toContain('id_submodulo = $2');
    expect(r.values).toEqual(['2026-09-16 10:00:00', 7]);
  });

  it('un valor nulo se pasa tal cual y sigue ocupando su posición', () => {
    // Un cliente sin inventario todavía: la fecha de referencia llega nula y la
    // comparación no cuenta nada, que es lo correcto.
    const r = traducirSql('SELECT COUNT(*) FILTER (WHERE created_at > ?) FROM t WHERE id = ?', [null, 7]);
    expect(r.text).toContain('created_at > $1');
    expect(r.text).toContain('id = $2');
    expect(r.values).toEqual([null, 7]);
  });
});

describe('formas que la capa expande', () => {
  it('`IN (?)` con un array se abre en tantos parámetros como elementos', () => {
    const r = traducirSql('SELECT * FROM users WHERE id IN (?)', [[4, 5, 6]]);
    expect(r.text).toBe('SELECT * FROM users WHERE id IN ($1, $2, $3)');
    expect(r.values).toEqual([4, 5, 6]);
  });

  it('`IN (?)` con un array vacío no rompe la consulta', () => {
    // Sin este caso, un listado sin selección generaría `IN ()`, que es un error
    // de sintaxis y tumbaría la petición entera.
    const r = traducirSql('SELECT * FROM users WHERE id IN (?)', [[]]);
    expect(r.text).toContain('NULL');
    expect(r.values).toEqual([]);
  });

  it('una consulta sin parámetros se deja como está', () => {
    const r = traducirSql('SELECT NOW()', []);
    expect(r.text).toBe('SELECT NOW()');
    expect(r.values).toEqual([]);
  });
});
