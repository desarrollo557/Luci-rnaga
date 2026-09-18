import { presenciaDe, ritmoPorHora, type SeñalesDePresencia } from '@/lib/presencia';

/**
 * Quién se destaca en la jornada, y quién necesita una mirada.
 *
 * El líder no compara veinte filas a ojo: quiere saber a quién reconocer y a
 * quién preguntarle qué pasa. Esto lo resuelve con tres respuestas y ninguna
 * más, porque una lista de "destacados" con diez criterios no destaca nada.
 *
 * **Volumen y ritmo se separan a propósito.** Quien más lleva hecho suele ser
 * quien lleva más horas, no quien va más rápido; y quien entra a media mañana
 * puede ir volando y aparecer abajo en cualquier lista por total. Son dos
 * méritos distintos y mezclarlos en un solo número los esconde a los dos.
 *
 * **El tercero no es un mérito, es una alerta**: alguien conectado que no está
 * produciendo. Es lo único de esta pantalla sobre lo que hay que actuar hoy.
 */

export interface PersonaMedible extends SeñalesDePresencia {
  nombre: string;
  registros: number;
  primerRegistro?: string | null;
}

export interface Destacado<T> {
  persona: T;
  /** El número que lo destaca, ya redondeado. */
  valor: number;
}

export interface Destacados<T> {
  porVolumen: Destacado<T> | null;
  porRitmo: Destacado<T> | null;
  /** Conectados que llevan rato sin guardar nada. */
  detenidos: T[];
}

/**
 * Para el ritmo se exige un mínimo de trabajo hecho.
 *
 * Con tres registros en diez minutos sale una cifra altísima que no se sostiene
 * y que dejaría fuera a quien lleva toda la mañana produciendo de verdad.
 */
export const REGISTROS_MINIMOS_PARA_RITMO = 10;

export function destacadosDe<T extends PersonaMedible>(personas: readonly T[], ahora: Date): Destacados<T> {
  let porVolumen: Destacado<T> | null = null;
  let porRitmo: Destacado<T> | null = null;
  const detenidos: T[] = [];

  for (const persona of personas) {
    if (persona.registros > 0 && (porVolumen === null || persona.registros > porVolumen.valor)) {
      porVolumen = { persona, valor: persona.registros };
    }

    if (persona.registros >= REGISTROS_MINIMOS_PARA_RITMO) {
      const ritmo = ritmoPorHora(persona.primerRegistro, persona.ultimoRegistro, persona.registros);
      if (ritmo !== null && (porRitmo === null || ritmo > porRitmo.valor)) {
        porRitmo = { persona, valor: ritmo };
      }
    }

    // Conectado pero sin guardar nada: es lo que hay que mirar hoy.
    if (presenciaDe(persona, ahora).estado === 'en-linea') detenidos.push(persona);
  }

  return { porVolumen, porRitmo, detenidos };
}

/** Las personas que están de verdad dentro del software, de más a menos activas. */
export function soloConectadas<T extends SeñalesDePresencia>(personas: readonly T[], ahora: Date): T[] {
  const orden = { escribiendo: 0, digitando: 1, 'en-linea': 2, inactivo: 3, fuera: 9, nunca: 9 };
  return personas
    .filter((p) => orden[presenciaDe(p, ahora).estado] < 9)
    .sort((a, b) => orden[presenciaDe(a, ahora).estado] - orden[presenciaDe(b, ahora).estado]);
}
