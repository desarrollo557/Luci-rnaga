# Entornos y ramas

El software corre en dos sitios, y cada uno tiene su rama. El código es el
mismo: lo único que cambia es la configuración.

| Rama | Dónde corre | Para qué |
| --- | --- | --- |
| `develop` | El equipo de cada quien | Desarrollo diario |
| `main` | — | Integración: todo pasa por aquí antes de producción |
| `production` | Render | Lo que usan los digitadores |

El flujo va **en un solo sentido**: `develop` → `main` → `production`. Nunca al
revés. Las tres ramas están protegidas en GitHub, así que los cambios entran por
Pull Request y con el CI en verde.

---

## Trabajar en local (rama `develop`)

La base de datos es la misma de Supabase, así que lo que se ve en local es lo
que hay en producción. No hace falta MySQL: el sistema ya no lo usa.

1. Copiar `backend/.env.example` a `backend/.env` y rellenar:

   ```
   NODE_ENV=development
   PORT=3000

   PG_HOST=aws-0-us-east-2.pooler.supabase.com
   PG_PORT=5432
   PG_DATABASE=postgres
   PG_USER=postgres.<referencia-del-proyecto>
   PG_PASSWORD=<la contraseña de Supabase>

   SESSION_SECRET=<cualquier cadena larga>
   CORS_ORIGIN=http://localhost:5173
   ```

   **Supabase no publica el host directo** `db.<ref>.supabase.co`: no resuelve
   por DNS. Hay que entrar por el pooler, y el usuario lleva la referencia del
   proyecto detrás del punto.

2. Arrancar:

   ```
   npm --prefix backend run dev      # API en el puerto 3000
   npm --prefix frontend run dev     # interfaz en el 5173
   ```

En desarrollo la cookie de sesión no es `Secure`, así que funciona sobre HTTP
sin más ajustes.

---

## Producción (rama `production`, en Render)

Un solo servicio sirve la API y el frontend compilado bajo el mismo dominio, con
lo que no hay CORS ni cookies entre dominios que configurar. Lo describe
[`render.yaml`](../render.yaml), que Render lee como Blueprint.

Variables que hay que cargar a mano en el panel (las demás van en el archivo):

| Variable | Qué es |
| --- | --- |
| `PG_PASSWORD` | Contraseña de la base en Supabase |
| `SESSION_SECRET` | Con ella se firman las cookies; **sin ella el backend no arranca** |
| `ZOHO_*` | Solo si se usa la subida de inventarios; sin ellas esa función queda inactiva |

`CORS_ORIGIN` y `COOKIE_CROSS_SITE` se quedan vacías mientras todo salga del
mismo dominio. Solo hacen falta si algún día el frontend se sirve aparte.

El plan configurado es el gratuito: el servicio **se duerme tras 15 minutos sin
tráfico** y la primera petición tarda cerca de un minuto. Cuando el sistema
entre en uso real conviene pasar a `starter`.

---

## Hora

Todo el software trabaja en la **hora de Colombia** (`America/Bogota`, UTC-5),
aunque el servidor y la base corran en UTC. Lo garantizan dos piezas:

- `backend/src/config/db.ts` ejecuta `SET TIME ZONE 'America/Bogota'` en cada
  conexión, así que `now()` —valores por defecto de `created_at`, triggers del
  historial, `NOW()` del inventario— se guarda ya en hora de Colombia.
- `frontend/src/lib/fechas.ts` da forma a todo lo que se muestra: día/mes/año y
  hora de 12 horas (`16/09/2026 8:21 a. m.`). Las páginas no formatean fechas
  por su cuenta.

Las marcas de tiempo escritas antes de este ajuste quedaron en UTC, cinco horas
adelantadas. `database/supabase/03-hora-colombia.sql` las corrige una sola vez
(lleva su propio candado para no aplicarse dos veces) y, si el permiso lo
permite, deja la zona fijada también en la base.

---

## Comprobar que todo funciona

Tres pruebas, de menos a más completa. Las dos últimas necesitan una instancia
en marcha y las credenciales de los usuarios de trabajo.

```bash
# 1. Pruebas unitarias: validadores, middlewares, utilidades
npm --prefix backend test

# 2. La base: traducción de consultas, triggers, bloqueo optimista
npx tsx scripts/migracion/humo-supabase.ts

# 3. Todos los endpoints de lectura, con sesión (no modifica nada)
LIDER_CC=… LIDER_PASS=… ADMIN_CC=… ADMIN_PASS=… \
  npx tsx scripts/migracion/humo-endpoints.ts https://<host>

# 4. El flujo completo: cliente → acta → caja → FUID → asignaciones →
#    inventario → informes. Crea y borra sus propios datos.
LIDER_CC=… LIDER_PASS=… ADMIN_CC=… ADMIN_PASS=… TECNICA_CC=… TECNICA_PASS=… \
  npx tsx scripts/migracion/humo-flujo.ts https://<host>
```

Las dos últimas existen por una razón concreta: al pasar de MySQL a PostgreSQL,
los fallos de SQL que MySQL toleraba (`CONCAT` con parámetros sin tipo,
`SUBSTRING_INDEX`, `SUM` sobre una columna de texto) **no los detecta ni el
compilador ni las pruebas unitarias**. Solo aparecen al ejecutar la consulta, y
así se descubren de una pasada en vez de uno a uno abriendo pantallas.
