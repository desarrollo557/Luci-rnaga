# Luciérnaga Host — Sistema de gestión FUID

Monorepo del sistema **FUID Luciérnaga**: gestión de módulos, cajas y digitación de registros FUID (Formato Único de Inventario Documental).

## Stack

| Capa | Tecnología |
| --- | --- |
| Backend | Node.js + Express + TypeScript + MySQL (mysql2) |
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS 4 |
| Sesiones | express-session (cookie `connect.sid`, HttpOnly + SameSite=Lax) |
| UI | React Router, TanStack Query, Zustand, Sonner, Lucide |

## Requisitos

- Node.js 18+
- MySQL 8 (servicio local, puerto 3306)

## Puesta en marcha

### 1. Base de datos

Scripts de PowerShell en `database/` (leen la conexión de `backend/.env` y
respaldan la base en `database/respaldos/` antes de tocar nada):

- `limpiar_bd.ps1`: deja la base **vacía conservando solo los usuarios**. Es la
  forma de arrancar sin datos de prueba ni información antigua.
- `reinstalar_bd.ps1`: borra la base y la recrea con el volcado `schema.sql`
  (datos de enero de 2026) más todas las migraciones. Ninguno carga semillas.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\database\limpiar_bd.ps1
```

A mano, crear la base de datos e importar el esquema **en este orden**:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS fuiddatosluciernaga CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root -p fuiddatosluciernaga < database/schema.sql
mysql -u root -p fuiddatosluciernaga < database/timestamps_auditoria.sql
mysql -u root -p fuiddatosluciernaga < database/asignacion_upd.sql
mysql -u root -p fuiddatosluciernaga < database/inventario_auditoria_zoho.sql
mysql -u root -p fuiddatosluciernaga < database/triggers_y_auditoria.sql
mysql -u root -p fuiddatosluciernaga < database/indices_velocidad.sql
mysql -u root -p fuiddatosluciernaga < database/indices_dashboard.sql
mysql -u root -p fuiddatosluciernaga < database/suspension_usuario.sql
mysql -u root -p fuiddatosluciernaga < database/rangos_upd.sql
```

> **Aviso sobre `schema.sql`.** El volcado se generó con phpMyAdmin y exportó los
> **11 triggers truncados**: cortó cada cuerpo en su primer `;` y lo sustituyó por
> el delimitador `$$`, dejándolos sin cuerpo ni `END`. Importado tal cual, aborta
> con `ERROR 1064 ... at line 88`. Para reimportarlo desde cero hay que filtrar
> esos bloques:
>
> ```bash
> awk '/^DELIMITER \$\$/{s=1;next} /^DELIMITER ;/{if(s){s=0;next}} !s' database/schema.sql > /tmp/schema_sin_triggers.sql
> mysql -u root -p fuiddatosluciernaga < /tmp/schema_sin_triggers.sql
> ```
>
> `database/triggers_y_auditoria.sql` restaura los 4 triggers cuyo cuerpo sobrevivió
> íntegro. Los 7 restantes (`duplicidad_*` e `incrementar_orden`) se perdieron en el
> volcado; recuperarlos exige un `mysqldump` correcto del servidor de origen.

Todos los scripts de `database/` salvo `schema.sql` son **idempotentes**: pueden
ejecutarse varias veces sin error.

> **Por qué hacen falta estas migraciones.** `schema.sql` es un volcado antiguo: no
> incluye varias columnas que el código ya usa. Sin ellas, estos endpoints devuelven
> HTTP 500 aunque el backend arranque sin quejarse:
>
> | Columna ausente | Endpoint afectado |
> | --- | --- |
> | `users.created_at` / `updated_at` | `GET /api/users` (pantalla de Administración) |
> | `asignacion_caja_tecnica.upd_inicio` / `ultimo_upd` | `GET /api/modulos_caja/:id/usuarios`, `/next-upd/:caja`, `/tecnica-stats` |
> | `inventario.ZOHO_*`, `FECHA_ACTUALIZACION`, `USUARIO_ACTUALIZACION` | `POST`/`PUT /api/inventario`, `POST /api/inventario/:id/sync` |

| Script | Qué aporta |
| --- | --- |
| `schema.sql` | Estructura y datos (volcado de phpMyAdmin; ver aviso) |
| `timestamps_auditoria.sql` | Columnas `created_at` / `updated_at` que el código ya espera |
| `asignacion_upd.sql` | `upd_inicio` / `ultimo_upd` en `asignacion_caja_tecnica` |
| `inventario_auditoria_zoho.sql` | Auditoría y estado de sincronización Zoho en `inventario` |
| `triggers_y_auditoria.sql` | Triggers recuperables + tabla `auditoria` |
| `indices_velocidad.sql` | Índices de las consultas de listado |
| `indices_dashboard.sql` | Índices del panel de estadísticas y del historial |
| `suspension_usuario.sql` | Columna `suspendido_hasta` en `users` |
| `rangos_upd.sql` | Tabla `rangos_upd` |
| `caja_modulo_unica.sql` | Índice único sobre `modulos_caja.caja_modulo` (idempotente; falla si hay números repetidos) |
| `limpiar_bd.sql` / `limpiar_bd.ps1` | Vacía todas las tablas de negocio y conserva `users` (con respaldo previo) |
| `reinstalar_bd.ps1` | Respalda y reinstala la base completa desde `schema.sql` + migraciones |
| `seed_dev_users.sql` | Usuarios de desarrollo — **nunca en producción** |

### 2. Backend

```bash
cd backend
npm install
```

Configurar `backend/.env` (no se versiona):

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=fuiddatosluciernaga
PORT=3000
SESSION_SECRET=clave-secreta-de-sesion
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Ejecutar

Desde la raíz (levanta backend + frontend juntos):

```bash
npm install        # solo la primera vez (instala concurrently)
npm run dev        # backend :3000 + frontend :5173
```

O por separado: `npm run dev:backend` / `npm run dev:frontend`.

- API: http://localhost:3000/api/health
- App: http://localhost:5173

### Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Backend + frontend en paralelo (concurrently) |
| `npm run typecheck` | Typecheck de backend y frontend |
| `npm run build` | Build de producción del frontend |
| `npm run start` | Backend en producción (requiere `build` previo) |

## Estructura

```
├── backend/                 # API Express + TypeScript
│   └── src/
│       ├── app.ts           # Configuración de Express (CORS, sesión, estáticos)
│       ├── server.ts        # Arranque del servidor
│       ├── config/db.ts     # Pool de MySQL y helpers de consulta
│       ├── config/constants.ts  # Configuración central (puertos, límites, sesión)
│       ├── controllers/     # Lógica de cada endpoint
│       ├── middlewares/     # auth (roles) y errorHandler
│       ├── routes/          # Definición de rutas por recurso
│       ├── services/        # Lógica de negocio (plantilla, fuid)
│       ├── types/           # Tipos compartidos y de BD
│       └── utils/           # asyncHandler, formateadores
├── frontend/                # SPA React + Vite
│   └── src/
│       ├── components/      # layout/ (AppLayout), ui/ (Button, Table, Modal...)
│       │   └── charts/      # Gráficos SVG y tokens de visualización validados
│       ├── lib/api.ts       # Cliente axios centralizado con todos los endpoints
│       ├── pages/           # Una pantalla por ruta (Admin, Clientes, Datos...)
│       ├── stores/          # Zustand (authStore)
│       └── types.ts         # Tipos compartidos del dominio
├── database/schema.sql      # Esquema de la base de datos
├── docs/                    # Documentación (auditoría de arquitectura)
└── package.json             # Orquestación raíz (concurrently)
```

## Flujo de trabajo en Git

El proyecto usa ramas `develop`, `production` y `main` con pipelines de validación en cada una. **Documentación completa y secuencia paso a paso: [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md).**

Resumen:

1. Desarrollás en feature branches desde `develop` → PR → merge.
2. Al publicar, PR `develop` → `production` → merge.
3. Al liberar versión, PR `production` → `main` + tag `vX.Y.Z`.

Cada PR dispara un pipeline orquestador (`.github/workflows/ci.yml`) que corre typecheck y build de backend y frontend. Si falla, el PR no se mergea.

## Consecutivo UPD del técnico

El UPD tiene formato `UPD` + 7 dígitos (`UPD0009601`). El técnico **nunca escribe
las siglas**: el prefijo es parte fija del control (`components/ui/UpdInput.tsx`) y
el servidor rellena con ceros a la izquierda.

1. La primera vez que el técnico abre una caja asignada, `GET /modulos_caja/next-upd/:caja`
   responde `requiere_inicio: true` y la interfaz muestra un diálogo bloqueante
   pidiendo **solo el número** de arranque.
2. Ese número se guarda con `PUT /modulos_caja/:caja/upd-inicio` en
   `asignacion_caja_tecnica.upd_inicio`. Se rechaza si el UPD resultante ya existe
   en `fuiddatosreal` (la columna es `UNIQUE`), para no chocar al guardar.
3. El primer registro toma ese mismo UPD. Al guardarlo, el backend avanza
   `asignacion_caja_tecnica.ultimo_upd`, así que el siguiente formulario ya viene
   con el consecutivo puesto, sin intervención.

El consecutivo es **por técnico y por caja**, de modo que dos técnicos en la misma
caja no compiten por el mismo número.

## Roles y acceso

| Rol | Acceso |
| --- | --- |
| `ADMIN` | `/admin` — CRUD de usuarios, módulos cliente, sub-módulos, asignaciones |
| `LIDER` | `/clientes` — módulos cliente y cajas, producción e historial |
| `TECNICA` | `/clientes` — digitación FUID en `/cajas/:id/datos` |
| `CALIDAD` | `/clientes` — revisión FUID en `/cajas/:id/revision` |

## Endpoints principales (prefijo `/api`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/login` | Inicia sesión (cc + contrasena) |
| GET | `/currentUser` | Usuario de la sesión actual |
| POST | `/logout` | Cierra sesión |
| GET/POST/PUT/DELETE | `/users` | CRUD de usuarios (admin) |
| GET/POST/PUT/DELETE | `/sub_modulos` | Sub-módulos |
| GET/POST/PUT/DELETE | `/moduloscliente` | Módulos cliente |
| GET/POST/PUT/DELETE | `/modulos_caja` | Cajas por acta (para líder/admin incluye `tecnicos_asignados` y `calidad_asignados`) |
| POST | `/modulos_caja/serie` | Crea una serie de cajas y, opcionalmente, asigna técnicos y calidad (`usuarios_tecnica`, `usuarios_calidad`) |
| GET/POST/PUT/DELETE | `/fuiddatosreal` | Registros FUID |
| GET | `/estadisticas` | Métricas agregadas del panel de Producción |
| GET | `/modulos_caja/next-upd/:caja` | Siguiente UPD del técnico (`requiere_inicio` si aún no arrancó) |
| PUT | `/modulos_caja/:caja/upd-inicio` | Fija el UPD de arranque del técnico (recibe solo el número) |
| POST | `/fuiddatosreal/marcar-ok` | Aprueba FUID (calidad) |
| GET | `/inventario` | Inventario |
| GET | `/historial` | Historial paginado (`page`, `pageSize`, `q`, `tipo`, `sede`, `desde`, `hasta`) |
| POST | `/generarPlantilla` | Exporta plantilla Excel |
| GET | `/fuid-con-estado-caja` | Reporte de producción |

## Notas

- El frontend usa un proxy de Vite (`/api` → `http://localhost:3000`); todas las llamadas al backend usan el prefijo `/api`.
- La sesión vive en cookie HttpOnly; en producción con dominios cruzados hay que ajustar `sameSite` y `secure` en `backend/src/app.ts`.
- `backend/.env` no se versiona: crea el tuyo localmente (ver arriba).

## Contraseñas heredadas en texto plano

Las contraseñas se guardan cifradas con bcrypt. Quedan cuentas antiguas con la
clave en texto plano, y el login las trata así:

| `PERMITIR_PASSWORD_PLANO` | Qué pasa al iniciar sesión con una cuenta sin cifrar |
| --- | --- |
| `false` (por defecto) | Se rechaza el ingreso y se pide restablecer la contraseña a un administrador. La comparación no llega a hacerse. |
| `true` | Se permite el ingreso y, en ese primer login, la contraseña se guarda ya cifrada. |

El valor por defecto es `false` a propósito: con `true` permanente, cualquier fila
insertada a mano en `users` con la clave sin cifrar sería una puerta abierta.

Para migrar las cuentas que queden:

1. Poner `PERMITIR_PASSWORD_PLANO=true` en `backend/.env` y reiniciar el backend.
2. Avisar a esas personas para que inicien sesión una vez; cada login deja su
   contraseña cifrada.
3. Comprobar que no quedan pendientes:
   `SELECT cc, nombre FROM users WHERE contrasena NOT LIKE '$2b$%';`
4. Volver a `false` y reiniciar.

Mientras la variable está en `false`, cada intento rechazado deja una advertencia
en el log del servidor con la cédula de la cuenta, para saber a quién falta migrar.

## Reglas de eliminación (jerarquía)

| Entidad | Quién puede eliminar | Condición |
| --- | --- | --- |
| Usuario | ADMIN | No se puede eliminar el propio usuario ni el único administrador. Las asignaciones a cajas se borran en cascada. |
| Cliente | ADMIN; LIDER solo de su sede | No debe tener actas. |
| Acta | ADMIN; LIDER solo de su sede | No debe tener cajas. |
| Caja | ADMIN; LIDER solo de su sede | Borrado jerárquico en una transacción: primero sus registros FUID (el trigger deja copia en `historial`), luego sus asignaciones y por último la caja. Si existe otra caja con el mismo número, los FUID se conservan. |
| Registro FUID | ADMIN cualquiera; LIDER los de su sede; TECNICA solo los que digitó el mismo día (hora de Colombia); CALIDAD no elimina | El trigger `after_delete_fuiddatosreal` guarda una copia en `historial`. |
| Inventario | ADMIN y LIDER | — |

Toda eliminación queda registrada en la tabla `auditoria` (entidad, id, acción, detalle y usuario).
