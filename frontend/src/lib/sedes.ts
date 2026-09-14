/**
 * Catálogo único de sedes de la operación.
 *
 * A nivel nacional solo existen estas cuatro sedes. Cualquier selector, filtro o
 * validación de sede debe alimentarse de aquí y no redeclarar la lista.
 *
 * El formato es MAYÚSCULAS porque así están almacenados los datos históricos en
 * la base (`users.sede`, `fuiddatosreal.sede`, `fuiddatosreal.sede_calidad`);
 * capitalizarlas rompería la coincidencia exacta que hace el frontend al
 * preseleccionar la sede de un registro existente.
 */
export const SEDES = ['BARRANQUILLA', 'BUCARAMANGA', 'BOGOTÁ', 'SANTA MARTA'] as const;

export type Sede = (typeof SEDES)[number];

/** Opciones listas para <Select>. */
export const SEDE_OPTIONS = SEDES.map((sede) => ({ value: sede, label: sede }));

/**
 * Opciones del catálogo más el valor actual cuando este quedó fuera de la lista
 * (registros antiguos con una sede que ya no opera). Evita que al editar se
 * pierda silenciosamente el dato guardado.
 */
export function sedeOptionsCon(valor?: string | null) {
  const actual = valor?.trim();
  if (!actual || SEDES.some((sede) => sede === actual)) return SEDE_OPTIONS;
  return [...SEDE_OPTIONS, { value: actual, label: `${actual} (fuera de catálogo)` }];
}
