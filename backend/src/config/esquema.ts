import { query } from './db.js';

/**
 * Ajustes de esquema que el código da por hechos, aplicados al arrancar.
 *
 * Existe por un incidente concreto: se desplegó una versión que leía la columna
 * `users.rol_secundario` antes de que nadie ejecutara su migración en Supabase.
 * PostgreSQL rechazaba la consulta, el servidor respondía 500 y la pantalla de
 * Administración se quedó caída hasta que alguien se acordó del SQL pendiente.
 * El despliegue y la migración eran dos pasos y solo se dio uno.
 *
 * Esto **no es un sistema de migraciones**, y no debe convertirse en uno. Aquí
 * solo caben cambios que cumplan las tres condiciones a la vez:
 *
 * 1. **Aditivos**: añaden una columna, un índice o una restricción. Nada que
 *    borre, renombre o transforme datos, porque eso no se puede repetir sin
 *    consecuencias ni deshacer si sale mal.
 * 2. **Idempotentes**: `IF NOT EXISTS` o equivalente. Se ejecutan en cada
 *    arranque y no pueden fallar por haberse aplicado ya.
 * 3. **Baratos**: sobre tablas pequeñas o sin reescribir filas. El arranque
 *    espera a que terminen.
 *
 * Rellenar la columna que se acaba de crear cuenta como aditivo, y es el único
 * caso en que aquí se escriben datos: solo toca la columna nueva, nunca lo que
 * ya había, y va protegido por una comprobación previa para que en los arranques
 * siguientes no vuelva a mirar la tabla grande.
 *
 * Todo lo demás —volcados, cambios de tipo, limpiezas— sigue viviendo en
 * `database/supabase/` y se aplica a mano, como hasta ahora.
 *
 * Si un ajuste falla, se registra y el servidor arranca igual. Quedarse sin
 * servicio entero por no haber podido añadir una columna sería peor que el
 * problema que esto evita.
 */

interface AjusteDeEsquema {
  /** Qué arregla, en palabras. Sale en el registro del servidor. */
  nombre: string;
  sql: string;
}

export const AJUSTES: AjusteDeEsquema[] = [
  {
    nombre: 'users.rol_secundario (segundo perfil de una cuenta)',
    sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS rol_secundario varchar(255)',
  },
  {
    nombre: 'users.rol_secundario distinto del perfil principal',
    sql: `DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'users_rol_secundario_distinto'
            ) THEN
              ALTER TABLE users ADD CONSTRAINT users_rol_secundario_distinto
                CHECK (rol_secundario IS NULL OR rol_secundario <> rol);
            END IF;
          END $$`,
  },
  {
    nombre: 'modulos_caja.fecha_finalizacion (jornada en que se terminó la caja)',
    sql: 'ALTER TABLE modulos_caja ADD COLUMN IF NOT EXISTS fecha_finalizacion date',
  },
  {
    nombre: 'modulos_caja.finalizada_por (a quién se le atribuye la caja terminada)',
    sql: 'ALTER TABLE modulos_caja ADD COLUMN IF NOT EXISTS finalizada_por varchar(255)',
  },
  {
    /*
     * El cierre de cajas mira el último registro de cada caja abierta cada vez
     * que alguien digita. Sin este índice esa consulta recorre entera la tabla
     * de registros, que es la más grande del sistema, en cada guardado.
     */
    nombre: 'índice fuiddatosreal(caja) (último registro de una caja)',
    sql: 'CREATE INDEX IF NOT EXISTS idx_fuiddatosreal_caja ON fuiddatosreal (caja)',
  },
  {
    /*
     * Las cajas que ya estaban finalizadas antes de existir estas columnas se
     * atribuyen a la jornada de su último registro. Sin esto, los seguimientos
     * de fechas anteriores saldrían con cero cajas terminadas, que es peor que
     * no tener el dato: parecería que nadie cerró nada.
     *
     * El `IF EXISTS` es lo que lo hace barato de repetir: en cuanto no queda
     * ninguna caja por rellenar, el arranque no vuelve a tocar los registros.
     */
    nombre: 'jornada de cierre de las cajas finalizadas antes de este cambio',
    sql: `DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM modulos_caja
               WHERE estado_caja = 'FINALIZADO' AND fecha_finalizacion IS NULL
            ) THEN
              UPDATE modulos_caja mc
                 SET fecha_finalizacion = u.fecha_del_dato,
                     finalizada_por = u.elaborado_por
                FROM (
                  SELECT DISTINCT ON (f.caja) f.caja, f.fecha_del_dato, f.elaborado_por
                    FROM fuiddatosreal f
                   ORDER BY f.caja, f.created_at DESC NULLS LAST, f.id DESC
                ) u
               WHERE mc.caja_modulo = u.caja
                 AND mc.estado_caja = 'FINALIZADO'
                 AND mc.fecha_finalizacion IS NULL;
            END IF;
          END $$`,
  },
];

/**
 * Aplica los ajustes. Nunca lanza: informa de lo que no pudo hacer y sigue.
 *
 * Devuelve cuántos se aplicaron sin error, para que quien la llame pueda
 * decidir si avisar. En el arranque normal se aplican todos y no se imprime
 * nada más que una línea.
 */
export async function asegurarEsquema(): Promise<{ aplicados: number; fallidos: number }> {
  let aplicados = 0;
  let fallidos = 0;

  for (const ajuste of AJUSTES) {
    try {
      await query(ajuste.sql);
      aplicados++;
    } catch (error) {
      fallidos++;
      console.error(
        `[Esquema] No se pudo asegurar ${ajuste.nombre}. ` +
          'Hay que aplicar su archivo de database/supabase/ a mano. Motivo:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (fallidos === 0) {
    console.log(`[Esquema] ${aplicados} ajuste(s) comprobado(s); la base tiene lo que el código espera.`);
  }
  return { aplicados, fallidos };
}
