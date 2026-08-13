export type FieldValidator = (value: string, label: string) => string | null;

export function required(value: string, label: string): string | null {
  return value.trim() === '' ? `${label} es requerido` : null;
}

export function onlyDigits(value: string, label: string): string | null {
  return value.trim() !== '' && !/^\d+$/.test(value.trim())
    ? `${label} debe contener solo números`
    : null;
}

export function minLength(value: string, n: number, label: string): string | null {
  return value.trim().length < n ? `${label} debe tener al menos ${n} caracteres` : null;
}

export function validDate(value: string, label: string): string | null {
  if (value.trim() === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? null
    : `${label} debe tener el formato YYYY-MM-DD`;
}

export function validCaja(value: string): string | null {
  if (value.trim() === '') return null;
  return /^\d{3}C\d{6}$/.test(value.trim())
    ? null
    : 'El número de caja debe tener el formato 000C000000';
}

export function createValidator(...checks: FieldValidator[]): FieldValidator {
  return (value, label) => {
    for (const check of checks) {
      const error = check(value, label);
      if (error) return error;
    }
    return null;
  };
}