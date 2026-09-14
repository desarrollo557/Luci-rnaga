/**
 * Confirmación de campos sin diligenciar.
 *
 * La base ya venía usando el literal `N/A` para las columnas de texto que el
 * digitador dejaba en blanco (ver los registros históricos de `fuiddatosreal`:
 * `codigo`, `serie`, `subserie`, `radicado`, `folios` y `notas` lo traen). Antes
 * el formulario mandaba NULL en su lugar, así que la misma ausencia quedaba
 * representada de dos formas distintas según la época del registro.
 *
 * El flujo unifica eso: al guardar se avisa qué campos van vacíos y, si la
 * persona confirma, se rellenan con `N/A` y el formulario queda a la vista para
 * que revise antes de guardar de verdad.
 *
 * IMPORTANTE: solo se declaran aquí campos que la base guarda como texto. Las
 * columnas `date`, `int` y `time` (`fecha_inicial`, `n_orden`, `tiempo`...) no
 * admiten `N/A` y deben seguir viajando como NULL.
 */

export const VALOR_VACIO = 'N/A';

export interface CampoVacio {
  /** Clave del campo dentro del formulario. */
  campo: string;
  /** Etiqueta visible, la misma que muestra el input. */
  label: string;
}

/**
 * Campos candidatos a rellenarse, con la etiqueta que se le muestra a la
 * persona. Declarar un campo aquí es lo que lo habilita: lo que no está en el
 * mapa nunca se toca.
 */
export type EtiquetasCampos<T> = Partial<Record<keyof T, string>>;

/**
 * Campos de texto que quedaron en blanco, en el orden del mapa de etiquetas.
 *
 * El genérico es `object` y no `Record<string, unknown>` porque las interfaces
 * declaradas (`FuidFormValues` y compañía) no tienen índice de string y TypeScript
 * las rechazaría; el acceso por clave se hace con un cast local acotado.
 */
export function detectarCamposVacios<T extends object>(
  values: T,
  etiquetas: EtiquetasCampos<T>,
): CampoVacio[] {
  const registro = values as Record<string, unknown>;
  const vacios: CampoVacio[] = [];
  for (const [campo, label] of Object.entries(etiquetas)) {
    if (typeof label !== 'string' || label === '') continue;
    const valor = registro[campo];
    if (typeof valor === 'string' && valor.trim() === '') {
      vacios.push({ campo, label });
    }
  }
  return vacios;
}

/** Devuelve una copia del formulario con los campos indicados puestos en `N/A`. */
export function rellenarCamposVacios<T extends object>(values: T, vacios: CampoVacio[]): T {
  const siguiente: Record<string, unknown> = { ...(values as Record<string, unknown>) };
  for (const { campo } of vacios) {
    siguiente[campo] = VALOR_VACIO;
  }
  return siguiente as T;
}

/**
 * `true` si el valor es el marcador de vacío. Lo usan los validadores de formato
 * para no rechazar un campo que la propia persona aceptó dejar sin diligenciar.
 */
export function esValorVacio(valor: string | null | undefined): boolean {
  return (valor ?? '').trim().toUpperCase() === VALOR_VACIO;
}
