import { useState } from 'react';

/**
 * Validador individual: recibe valor y label, retorna mensaje de error o null.
 */
type Validator = (value: string, label: string) => string | null;

/**
 * Hook de validación reutilizable para formularios.
 * 
 * Uso:
 * const { errors, validate, isValid } = useFormValidation(validations);
 * 
 * @param validations Objeto donde cada valor es un array de validadores (strings o funciones)
 * @returns {errors, validate, isValid}
 */
export function useFormValidation(validations: Record<string, (Validator | string)[]>) {
  // Estado inicial: vacío (todas las claves empiezan sin errors)
  const initialErrors: Record<string, string> = {};
  Object.keys(validations).forEach((key) => {
    initialErrors[key] = '';
  });

  const [errors, setErrors] = useState<Record<string, string>>(initialErrors);

  const validate = (values: Record<string, unknown>): boolean => {
    const errorsPartial: Record<string, string> = {};

    for (const [field, rules] of Object.entries(validations)) {
      const value = values[field];
      let fieldError: string | null = null;

      for (const rule of rules) {
        if (typeof rule === 'string') {
          // Mensaje de error directo (string)
          if (!fieldError) {
            errorsPartial[field] = rule;
          }
          break;
        }
        if (typeof rule === 'function') {
          // Validador funcional
          const result = rule(String(value), String(field));
          if (result) {
            fieldError = typeof result === 'string' ? result : null;
            break;
          }
        }
      }

      if (fieldError) {
        errorsPartial[field] = fieldError;
      }
    }

    // Actualizar state de errors
    setErrors(errorsPartial as Record<string, string>);
    return Object.keys(errorsPartial).length === 0;
  };

  const isValid = Object.keys(errors).length === 0;

  return { errors, validate, isValid };
}

/** Validadores reutilizables por tipo de campo */

export const validators = {
  required: (value: string, label: string): string | null =>
    !value?.trim() ? `El campo ${label} es requerido` : null,

  minLength: (min: number) => (value: string, label: string): string | null =>
    value?.trim().length < min
      ? `El campo ${label} debe tener como mínimo ${min} caracteres`
      : null,

  maxLength: (max: number) => (value: string, label: string): string | null =>
    value?.trim().length > max
      ? `El campo ${label} no puede exceder los ${max} caracteres`
      : null,

  email: (value: string, label: string): string | null =>
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? `El campo ${label} debe ser un email válido`
      : null,

  numeric: (value: string, label: string): string | null =>
    !/^\d+$/.test(value) && value?.trim() ? `El campo ${label} debe ser numérico` : null,

  positiveNumber: (value: string, label: string): string | null => {
    if (!/^\d+$/.test(value)) return `El campo ${label} debe ser un número positivo`;
    if (Number(value) <= 0) return `El campo ${label} debe ser mayor a 0`;
    return null;
  },
};

/** Mapeo de campos ActasPage a validaciones */
export const actasFormValidations = {
  caja_modulo: [validators.required, (value: string) => validators.minLength(3)(value, 'Caja') || null],
  entidad_remitente_caja: [validators.required],
  entidad_productora_caja: [validators.required],
  unidad_administrativa_caja: [validators.required],
  oficina_productora_caja: [validators.required],
  objeto_caja: [validators.required],
  acta_trans_caja: [validators.required],
  fecha_trans_caja: [validators.required],
  estado_caja: [validators.required],
};

/** Mapeo de campos DatosPage a validaciones */
export const datosFormValidations = {};

/** Mapeo de campos CajasPage a validaciones */
export const cajasFormValidations = {};