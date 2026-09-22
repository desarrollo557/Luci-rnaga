# Entornos y configuración

El software corre en dos sitios, y cada uno tiene su rama. El código es el
mismo: lo único que cambia es la configuración.

| Rama | Dónde corre | Para qué |
| --- | --- | --- |
| `develop` | El equipo de cada quien | Desarrollo diario |
| `main` | — | Integración: todo pasa por aquí antes de producción |
| `production` | Render | Lo que usan los digitadores |

El flujo va en un solo sentido, `develop` → `main` → `production`, y está
descrito en [`GIT_WORKFLOW.md`](GIT_WORKFLOW.md).

---

## Variables de entorno

Las lee el backend de `backend/.env` en local y del panel de Render en
producción. Ninguna otra parte del sistema lee variables: el frontend solo
conoce dos, y únicamente en desarrollo.

| Variable | Obligatoria | Qué es |
| --- | --- | --- |
| `NODE_ENV` | sí | `development` o `production`. En producción la cookie de sesión es `Secure`, se confía en el proxy de Render y se sirve el frontend compilado. |
| `PORT`, `HOST` | no | Puerto y dirección de escucha. Por defecto 3000 y `0.0.0.0`. |
| `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` | sí | Conexión a Supabase. Sin `PG_HOST`, `PG_USER` o `PG_PASSWORD` el servidor no arranca, y lo dice. |
| `SESSION_SECRET` | sí | Firma las cookies. En producción, sin ella el backend se niega a arrancar; en desarrollo cae a un valor fijo. |
| `CORS_ORIGIN` | no | Orígenes permitidos, separados por comas. Por defecto `http://localhost:5173`. En producción, con todo bajo el mismo dominio, no hace falta. |
| `COOKIE_CROSS_SITE` | no | `true` solo si el frontend se sirviera desde otro dominio: marca la cookie `SameSite=None` y `Secure`. |
| `FRONTEND_DIST` | no | Dónde está el frontend compilado, relativo al directorio desde el que arranca el proceso. En Render es `frontend/dist`. |
| `PERMITIR_PASSWORD_PLANO` | no | `true` abre la ventana de migración de contraseñas heredadas (ver el README). Apagada por defecto. |
| `RATE_LIMIT_GENERAL`, `RATE_LIMIT_LOGIN` | no | Peticiones por IP cada 15 minutos (1000) e intentos de login por minuto (30). |
| `DB_CONNECTION_LIMIT` | no | Tamaño del pool (10). |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_FOLDER_ID`, `ZOHO_DC` | no | Subida de inventarios a Zoho WorkDrive. Sin ellas la función queda inactiva. `ZOHO_DC` es el centro de datos (`US` por defecto). |

Las variables `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` eran de MySQL. El
backend ya no las lee; solo las usan los scripts de la migración que leían la
base antigua. Si aparecen en un `.env`, sobran.

El frontend, en desarrollo, acepta `VITE_PORT` y `VITE_API_TARGET` para cambiar
el puerto de Vite y la dirección de la API a la que reenvía `/api`. Los pone
`npm run ports:check` cuando encuentra los puertos ocupados.

---

## Trabajar en local (rama `develop`)

La base de datos es la misma de Supabase, así que lo que se ve en local es lo
que hay en producción. No hace falta MySQL ni un PostgreSQL local: el sistema
no los usa.

1. Copiar `backend/.env.example` a `backend/.env` y rellenar:

   ```
   NODE_ENV=development
   PORT=3000

   PG_HOST=aws-0-us-east-2.pooler.supabase.com
   PG_PORT=5432
   PG_DATABASE=postgres
   PG_USER=postgres.<referencia-del-proyecto>
   PG_PASSWORD="<la contraseña de Supabase>"

   SESSION_SECRET=<cualquier cadena larga>
   CORS_ORIGIN=http://localhost:5173
   ```

   **Supabase no publica el host directo** `db.<ref>.supabase.co`: no resuelve
   por DNS. Hay que entrar por el pooler de la región del proyecto (`us-east-2`,
   Ohio), y el usuario lleva la referencia del proyecto detrás del punto. El
   pooler responde "tenant or user not found" si la región no es la correcta.

   Si la contraseña lleva `#`, va entre comillas: sin ellas, dotenv toma el `#`
   como el comienzo de un comentario y la recorta.

2. Arrancar desde la raíz:

   ```
   npm run dev
   ```

   Levanta la API en el puerto 3000 y la interfaz en el 5173. También se pueden
   arrancar por separado con `npm --prefix backend run dev` y
   `npm --prefix frontend run dev`.

En desarrollo la cookie de sesión no es `Secure`, así que funciona sobre HTTP
sin más ajustes. `tsx watch` reinicia el backend en cada cambio de código, pero
no al cambiar el `.env`: para eso hay que parar y volver a arrancar.

Si el backend arranca pero cada petición devuelve 500, lo primero que hay que
mirar es el `.env`: un archivo de la época de MySQL, con `DB_HOST=localhost` y
sin ninguna `PG_*`, producía exactamente eso. Desde septiembre de 2026 el
servidor lo detecta al arrancar y termina con un mensaje que dice qué falta.

---

## Producción (rama `production`, en Render)

Un solo servicio sirve la API y el frontend compilado bajo el mismo dominio, con
lo que no hay CORS ni cookies entre dominios que configurar. Lo describe
[`render.yaml`](../render.yaml), que Render lee como Blueprint: región Ohio (la
misma que Supabase, para que cada consulta viaje lo menos posible), comando de
build, comando de arranque, `healthCheckPath` y las variables que no son
secretas.

Render despliega solo con cada push a `production`. El build instala las
dependencias de desarrollo a propósito (`--include=dev`): con
`NODE_ENV=production` npm las omitiría, y ahí viven Vite, TypeScript y los tipos
de React que hacen falta para compilar.

Variables que hay que cargar a mano en el panel (las demás van en el archivo):

| Variable | Qué es |
| --- | --- |
| `PG_PASSWORD` | Contraseña de la base en Supabase |
| `SESSION_SECRET` | Con ella se firman las cookies; **sin ella el backend no arranca** |
| `ZOHO_*` | Solo si se usa la subida de inventarios |

`CORS_ORIGIN` y `COOKIE_CROSS_SITE` se quedan vacías mientras todo salga del
mismo dominio. Solo hacen falta si algún día el frontend se sirve aparte.

El plan configurado es el gratuito: el servicio **se duerme tras 15 minutos sin
tráfico** y la primera petición después tarda cerca de un minuto. Tiene tres
consecuencias que el código ya contempla: las pantallas consultan cada 15
segundos en vez de mantener una conexión abierta; la actualización diaria de
los inventarios de las 4:15 p. m. se ejecuta al despertar si el servicio estaba
dormido a esa hora; y la conexión abierta de las notificaciones (la única que
se mantiene, para que la solicitud de reapertura llegue al líder al instante)
se cierra cuando la pestaña no está en primer plano, para no mantener el
servicio despierto sin motivo. Cuando el sistema entre en uso real conviene pasar al plan
`starter`, que no se duerme; es cambiar una palabra en `render.yaml`.

---

## La base de datos en Supabase

El esquema está en `database/supabase/`, en scripts numerados en el orden en
que se aplicaron. Todos son idempotentes: se pueden repetir sin romper nada.

| Script | Qué hace | Cuándo se aplica |
| --- | --- | --- |
| `01-esquema.sql` | Todas las tablas, índices y llaves foráneas. Generado a partir del esquema real de MySQL, no del volcado antiguo. | Una vez, al crear el proyecto. |
| `02-triggers.sql` | Los dos triggers de negocio: el asunto que se compone con los dos asuntos del formulario, y la copia de cada versión de un registro en `historial`. | Después del esquema. |
| `03-hora-colombia.sql` | Corrige una sola vez las marcas de tiempo que quedaron en UTC antes de fijar la zona horaria, con un candado para no restar las cinco horas dos veces. | Ya aplicado. |
| `04-sin-calidad.sql` | Retira las tablas del perfil CALIDAD y lista las cuentas que aún lo tienen. | Ya aplicado. |
| `05-rol-secundario.sql` | La columna `users.rol_secundario` y su restricción. | El servidor la asegura al arrancar; el script queda como referencia. |
| `06-ciclo-caja.sql` | `modulos_caja.fecha_finalizacion`, `finalizada_por`, el índice sobre `fuiddatosreal(caja)` y el relleno de las cajas ya finalizadas. | Igual: el servidor lo asegura al arrancar. |
| `07-reapertura-caja.sql` | `modulos_caja.reabierta_por` y `reabierta_el`: quién reabrió la caja a mano y qué día, que es lo que deja a la técnica corregir sus registros de días anteriores mientras la caja siga abierta. | Igual: el servidor lo asegura al arrancar. |
| `08-asunto-sin-marcador.sql` | El trigger del asunto deja fuera el marcador `N/A` al unir los dos asuntos, y los asuntos ya guardados con el marcador pegado se recomponen una sola vez. | Igual: el servidor lo asegura al arrancar. |
| `09-reapertura-por-solicitud.sql` | Las tablas `solicitud_reapertura` (la técnica pide reabrir una caja terminada; el líder la aprueba o rechaza) y `notificacion` (los avisos de cada persona, que la campana muestra y la conexión abierta entrega al instante). | Igual: el servidor lo asegura al arrancar. |

### Lo que el servidor asegura al arrancar

Los cambios de esquema **aditivos** —una columna, un índice, una restricción—
los aplica el propio servidor antes de atender la primera petición
(`backend/src/config/esquema.ts`). La lista completa es el arreglo `AJUSTES` de
ese archivo; hoy cubre el segundo perfil de las cuentas, las columnas del ciclo
de la caja (`fecha_finalizacion`, `finalizada_por`, `reabierta_por`,
`reabierta_el`), las marcas de actividad y escritura de `users`, la tabla
`jornada_caja`, el índice único del código de cliente por sede, el relleno de
la jornada de cierre de las cajas que ya estaban finalizadas cuando esas
columnas no existían, y la definición del trigger que compone el asunto sin el
marcador `N/A` junto con la recomposición de los asuntos que ya lo traían
pegado. Solo esos dos últimos escriben datos, y siempre datos derivados: la
columna nueva de filas que la tienen vacía, y el asunto, que se vuelve a armar
a partir de sus dos campos de origen sin tocar lo que escribió nadie.

Esto existe por un incidente: se desplegó una versión que leía una columna nueva
antes de que nadie ejecutara su migración, y la pantalla de Administración se
quedó respondiendo 500 hasta que alguien se acordó del SQL pendiente. El
despliegue y la migración eran dos pasos y solo se dio uno.

No es un sistema de migraciones y no debe convertirse en uno. Solo caben ahí
cambios aditivos, idempotentes y baratos. Lo demás se aplica a mano desde el
editor SQL de Supabase:

| Qué | Por qué a mano |
| --- | --- |
| Volcados y cargas de datos | No son repetibles: ejecutarlos dos veces duplica |
| Cambios de tipo de columna | Reescriben la tabla entera y pueden tardar |
| Limpiezas y correcciones de datos | No se pueden deshacer si salen mal |
| Borrados de columnas o tablas | Un `DROP` que corre en cada arranque es una bomba |

Si un ajuste del arranque falla, por ejemplo porque el usuario de la base no
tiene permiso, queda registrado en el log con el nombre de lo que no pudo hacer
y **el servidor arranca igual**. Quedarse sin servicio entero por no haber
podido añadir una columna sería peor que el problema que se está evitando.

### Tablas que el código ya no usa

`asignacion_tecnica`, `modulo_tecnica` y `rangos_upd` siguen en el esquema
porque venían de MySQL, pero ninguna consulta las toca: la asignación por acta
se retiró en favor de la asignación por caja, y los rangos de UPD se
sustituyeron por el consecutivo por técnica y caja. Se pueden retirar cuando se
quiera con un script a mano; no molestan.

---

## Hora

Todo el software trabaja en la **hora de Colombia** (`America/Bogota`, UTC-5,
sin horario de verano), aunque el servidor y la base corran en UTC. Lo
garantizan dos piezas:

- `backend/src/config/db.ts` ejecuta `SET TIME ZONE 'America/Bogota'` en cada
  conexión del pool, así que `now()` (valores por defecto de `created_at`,
  triggers del historial, `NOW()` del inventario) se guarda ya en hora de
  Colombia. El pooler en modo sesión (puerto 5432) conserva el ajuste mientras
  dura la conexión; en modo transacción (6543) se perdería, así que no hay que
  cambiar de puerto sin revisar esto.
- `frontend/src/lib/fechas.ts` da forma a todo lo que se muestra: día/mes/año y
  hora de 12 horas (`16/09/2026 8:21 a. m.`). Las páginas no formatean fechas
  por su cuenta.

Las marcas escritas antes de este ajuste quedaron cinco horas adelantadas;
`03-hora-colombia.sql` las corrigió una sola vez.

---

## Comprobar que todo funciona

De menos a más completo. Lo primero corre en cada PR; lo demás necesita la base
y, en algunos casos, una instancia en marcha y las credenciales de los usuarios
de trabajo. Todo se lanza desde `backend/`.

```bash
# 1. Pruebas unitarias. Las del backend incluyen PostgreSQL en memoria (PGlite)
#    para el ciclo de caja y las columnas del seguimiento.
npm test
npm --prefix ../frontend test
npm --prefix ../frontend run lint

# 2. La base real: traducción de consultas, triggers, bloqueo optimista.
npx tsx scripts/migracion/humo-supabase.ts

# 3. Esquema, restricciones, triggers y coherencia de los datos actuales.
npx tsx scripts/pruebas/base-de-datos.ts

# 4. Matriz de permisos: cada endpoint contra cada perfil y sin sesión.
API=http://localhost:3000 npx tsx scripts/pruebas/roles.ts

# 5. Todos los endpoints de lectura, con sesión (no modifica nada).
LIDER_CC=… LIDER_PASS=… ADMIN_CC=… ADMIN_PASS=… \
  npx tsx scripts/migracion/humo-endpoints.ts https://<host>

# 6. El flujo completo: cliente → acta → caja → FUID → asignaciones →
#    inventario → informes. Crea y borra sus propios datos.
LIDER_CC=… LIDER_PASS=… ADMIN_CC=… ADMIN_PASS=… TECNICA_CC=… TECNICA_PASS=… \
  npx tsx scripts/migracion/humo-flujo.ts https://<host>

# 7. El inventario sale en el formato oficial, abriendo el archivo generado.
npx tsx scripts/pruebas/formato-fuid.ts
```

Las pruebas contra la base existen por una razón concreta: al pasar de MySQL a
PostgreSQL, los fallos de SQL que MySQL toleraba (`CONCAT` con parámetros sin
tipo, `SUBSTRING_INDEX`, `SUM` sobre una columna de texto) **no los detecta ni
el compilador ni las pruebas unitarias**. Solo aparecen al ejecutar la consulta,
y así se descubren de una pasada en vez de uno a uno abriendo pantallas.

Los scripts que escriben marcan sus registros (`HUMO-MIGRACION`, `PRUEBA-BD`,
`EVIDENCIA-API`) y los borran al terminar aunque algo falle. Aun así, como la
base es la de producción, conviene lanzarlos fuera del horario de digitación.
