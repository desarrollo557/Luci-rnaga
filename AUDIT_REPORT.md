# Auditoría de Código — Luciernaga Host

**Fecha:** 2025-08-19  
**Alcance:** `backend/src/**/*.ts` + `frontend/src/**/*.tsx`

---

## 1. Hardcoded Values

| Archivo | Línea | Valor | Sugerencia |
|---------|-------|-------|------------|
| **Backend** |
| `server.ts` | 4 | `3000` | Mover a `config/constants.ts` → `DEFAULT_PORT` |
| `server.ts` | 6 | `'0.0.0.0'` | Constante `DEFAULT_HOST` |
| `app.ts` | 18 | `15 * 60 * 1000` (15 min) | `RATE_LIMIT_WINDOW_MS` |
| `app.ts` | 19 | `1000` | `RATE_LIMIT_GENERAL_DEFAULT` |
| `app.ts` | 27 | `60 * 1000` (1 min) | `RATE_LIMIT_LOGIN_WINDOW_MS` |
| `app.ts` | 28 | `30` | `RATE_LIMIT_LOGIN_DEFAULT` |
| `app.ts` | 37 | `'http://localhost:5173'` | `DEFAULT_CORS_ORIGIN` |
| `app.ts` | 47 | `'luciernaga-dev-secret'` | **Eliminar fallback**; exigir `SESSION_SECRET` en `.env` |
| `app.ts` | 54 | `1000 * 60 * 60 * 8` (8 h) | `SESSION_MAX_AGE_MS` |
| `app.ts` | 61 | `'ok'`, `'luciernaga-api'` | Constantes `HEALTH_STATUS_OK`, `SERVICE_NAME` |
| `app.ts` | 73 | `'../frontend/dist'` | `DEFAULT_FRONTEND_DIST_PATH` |
| `db.ts` | 9 | `10` | `DB_CONNECTION_LIMIT` |
| `db.ts` | 10 | `0` | `DB_QUEUE_LIMIT` |
| `db.ts` | 11 | `true` | `DB_DATE_STRINGS` |
| `utils/updFormat.ts` | 1-3 | `'UPD'`, `7`, `/^UPD\d{7}$/` | Mover a `constants/upd.ts` (ya es módulo dedicado, pero exportar como `UPD_CONFIG`) |
| `controllers/auth.controller.ts` | 7 | `10` | `BCRYPT_SALT_ROUNDS` (compartido con users.controller.ts) |
| `controllers/users.controller.ts` | 7 | `10` | Usar la misma constante compartida |
| `services/workDrive.service.ts` | 1-8 | `DC_DOMAINS` record | `config/zoho.ts` → `ZOHO_DC_DOMAINS` |
| `services/workDrive.service.ts` | 32 | `60_000` (60 s buffer) | `TOKEN_REFRESH_BUFFER_MS` |
| `services/workDrive.service.ts` | 72 | `3600` (1 h default expiry) | `DEFAULT_TOKEN_EXPIRY_SECONDS` |
| `services/workDrive.service.ts` | 99 | `1500` (retry sleep) | `UPLOAD_RETRY_DELAY_MS` |
| `services/plantilla.service.ts` | 7-8 | Rutas `assets/plantilla/PLANTILLA.xlsx`, `temp/` | `config/paths.ts` → `TEMPLATE_PATH`, `TEMP_DIR` |
| `services/plantilla.service.ts` | 64 | `8` (startRow) | `TEMPLATE_START_ROW` |
| `services/plantilla.service.ts` | 83,88,103,109 | `'DD/MM/YYYY'` | `EXCEL_DATE_FORMAT` |
| `services/inventarioExcel.service.ts` | 3-27 | `LABELS` record | `constants/inventarioLabels.ts` |
| `services/inventarioExcel.service.ts` | 29 | `ORDER` array | Derivar de `LABELS` o mover a constante |
| `services/inventarioExcel.service.ts` | 39 | `24` (col width) | `EXCEL_DEFAULT_COL_WIDTH` |
| `services/inventarioExcel.service.ts` | 49-55 | Colores ARGB hardcoded | `EXCEL_HEADER_STYLE` objeto de estilo |
| `services/inventarioExcel.service.ts` | 71-78 | Formato filename | `INVENTARIO_FILENAME_TEMPLATE` |
| `services/audit.service.ts` | 30 | `500` (detalle slice) | `AUDIT_DETALLE_MAX_LENGTH` |
| `validators/fuiddatosreal.validator.ts` | 8 | `/^\d{4}-\d{2}-\d{2}$/` | `ISO_DATE_REGEX` compartida |
| `validators/auth.validator.ts` | 9 | `['ADMIN','LIDER','TECNICA','CALIDAD']` | Usar `ROLES` de `validators/users.validator.ts` |
| `validators/users.validator.ts` | 3 | `ROLES` array | Exportar desde `constants/roles.ts` (compartido backend/frontend) |
| `validators/users.validator.ts` | 7 | `/^\d{1,20}$/` | `CC_REGEX` |
| `validators/users.validator.ts` | 10 | `3` (min nombre) | `MIN_NOMBRE_LENGTH` |
| `validators/users.validator.ts` | 13 | `4` (min contrasena) | `MIN_PASSWORD_LENGTH` |
| `validators/rangosUpd.validator.ts` | 4-7 | `positiveInt` schema | Reutilizable → `schemas/positiveInt.ts` |
| `validators/rangosUpd.validator.ts` | 10-15 | `updField` con regex | Reutilizar `UPD_REGEX` de `updFormat.ts` |
| **Frontend** |
| `App.tsx` | 41-47 | `roleRestrictedRoutes` object | `config/routes.ts` → `ROLE_ROUTE_GUARDS` |
| `App.tsx` | 90 | Rutas de fallback hardcoded | Derivar de `ROLE_ROUTE_GUARDS` |
| `Login.tsx` | 11-16 | `ROLE_LABELS` record | Usar `ROLE_LABEL` de `types.ts` o `constants/roles.ts` |
| `Login.tsx` | 23-27 | `SEDE_OPTIONS` array | `constants/sedes.ts` (compartido con AdminPage) |
| `Login.tsx` | 67 | `'redirect'` (localStorage key) | `STORAGE_KEYS.REDIRECT` |
| `AppLayout.tsx` | 30-38 | `NAV_ITEMS` array | `config/nav.ts` → `NAV_ITEMS` |
| `AppLayout.tsx` | 40-45 | `ROL_LABEL` record | Compartir con `types.ts` / `constants/roles.ts` |
| `AppLayout.tsx` | 47 | `'sidebar-collapsed'` | `STORAGE_KEYS.SIDEBAR_COLLAPSED` |
| `types.ts` | 272 | `ROLES` array | Fuente única en `constants/roles.ts` |
| `types.ts` | 275-297 | `SUGGESTION_FIELDS` array | Compartir con backend `services/fuid.service.ts` |
| `types.ts` | 3 | Comentario de formato UPD | Eliminar; usar `UPD_REGEX` de `validation.ts` |
| `lib/validation.ts` | 8 | `/^\d+$/` | `DIGITS_ONLY_REGEX` |
| `lib/validation.ts` | 19 | `/^\d{4}-\d{2}-\d{2}$/` | `ISO_DATE_REGEX` (compartida con backend) |
| `lib/validation.ts` | 26 | `/^\d{3}C\d{6}$/` | `CAJA_REGEX` |
| `lib/validation.ts` | 33 | `/^UPD\d{7}$/` | **Duplicado** de `updFormat.ts` → importar de `constants/upd.ts` |
| `lib/api.ts` | 25 | `PUBLIC_AUTH_PATHS` array | `constants/authPaths.ts` |
| `lib/api.ts` | 28 | `'/api'` | `API_BASE_PATH` |
| `lib/api.ts` | 66, 83, 85 | Strings de error fallback | `ERROR_MESSAGES` object |
| `stores/authStore.ts` | 16 | `fetching` flag (module-level) | Mover a store interno o usar `zustand` middleware |
| `pages/RangosUpdPage.tsx` | 23 | `UPD_REGEX` duplicado | Importar de `constants/upd.ts` |
| `pages/RangosUpdPage.tsx` | 25-38 | `normalizeUpd`, `validUpd`, `updToNumber` | **Duplicados exactos** de `utils/updFormat.ts` → crear `lib/upd.ts` compartido |
| `pages/AdminPage.tsx` | 37-42 | `ROLE_BADGE` record | `constants/roleBadges.ts` |
| `pages/AdminPage.tsx` | 44-49 | `ROLE_LABEL` duplicado | Compartir |
| `pages/AdminPage.tsx` | 51-56 | `ROLE_AVATAR` record | `constants/roleAvatars.ts` |
| `pages/AdminPage.tsx` | 58 | `SEDES` array | **Duplicado** de `Login.tsx` → `constants/sedes.ts` |
| `pages/AdminPage.tsx` | 60-66 | `EMPTY_FORM` object | `constants/emptyUserForm.ts` |
| `pages/AdminPage.tsx` | 68-81 | Validators inline | Mover a `lib/validators/user.ts` |

---

## 2. Redundant Comments

| Archivo | Línea | Comentario | Acción |
|---------|-------|------------|--------|
| **Backend** |
| `app.ts` | 25 | `// Limitador estricto para login...` | **Eliminar** (repite el código) |
| `app.ts` | 34 | `// Health check ANTES de los routers...` | **Mantener** (explica decisión de orden) |
| `app.ts` | 64 | `// Rate limit: general sobre toda la API...` | **Eliminar** (obvio por el código) |
| `app.ts` | 68 | `// API` | **Eliminar** (ruido) |
| `app.ts` | 71-72 | `// En producción servimos el build...` | **Mantener** (explica rama condicional) |
| `db.ts` | 14-15 | `/** Ejecuta una consulta... */` | **Eliminar** (JSDoc que repite firma) |
| `db.ts` | 20-21 | `/** Devuelve la primera fila... */` | **Eliminar** |
| `db.ts` | 27-28 | `/** Ejecuta una consulta que devuelve... */` | **Eliminar** |
| `utils/updFormat.ts` | 5, 11, 16, 21 | JSDoc en cada función | **Eliminar** (nombres autoexplicativos) |
| `services/fuid.service.ts` | 45 | `/** Valores en el mismo orden... */` | **Eliminar** (obvio por el código) |
| `services/fuid.service.ts` | 91 | `/** Campos permitidos para autocompletado. */` | **Eliminar** |
| `services/workDrive.service.ts` | 25-26 | `/** Respuesta acotada a ~200 caracteres... */` | **Mantener** (explica *por qué* 200) |
| `services/plantilla.service.ts` | 23 | `/** Genera el archivo .xlsx... */` | **Eliminar** |
| `services/inventarioExcel.service.ts` | 31 | `/** Builds an .xlsx buffer... */` | **Eliminar** |
| `services/audit.service.ts` | 22 | `/** Inserta un evento de auditoría... */` | **Mantener** (explica *never debe romper*) |
| `controllers/auth.controller.ts` | 103 | `function formatDate...` | **Eliminar** (función privada obvia) |
| `controllers/users.controller.ts` | 111 | `function formatDate...` | **Eliminar** (duplicada con auth.controller) |
| `validators/fuiddatosreal.validator.ts` | 12-16 | Bloque explicando enforcement UPD | **Mantener** (contexto de negocio) |
| `validators/rangosUpd.validator.ts` | 9-10 | `/** Normaliza... */` | **Eliminar** |
| `validators/rangosUpd.validator.ts` | 17-26 | `/** Rechaza rangos invertidos... */` | **Mantener** (explica regla de negocio) |
| **Frontend** |
| `App.tsx` | 40-43 | `// Guarda de ruta por rol...` | **Mantener** (explica lógica no obvia) |
| `App.tsx` | 62-66 | `// Se invoca UNA vez al montar...` | **Mantener** (evita bug de StrictMode) |
| `Login.tsx` | 37-39 | `// App ya consulta /currentUser...` | **Mantener** (documenta fix previo) |
| `Login.tsx` | 81-87 | `{/* Blobs decorativos... */}` | **Mantener** (explica elementos visuales sin semántica) |
| `AppLayout.tsx` | 82-86 | `{/* Logo SIAR */}` | **Eliminar** (alt text ya dice lo mismo) |
| `AppLayout.tsx` | 91-95 | Comentarios de texto de marca | **Eliminar** (JSX autoexplicativo) |
| `RangosUpdPage.tsx` | 22 | `/** Formato del UPD... */` | **Eliminar** (duplicado de constante) |
| `RangosUpdPage.tsx` | 40-47 | `/** Barra de progreso compacta... */` | **Eliminar** (nombre `Barra` + props claras) |
| `RangosUpdPage.tsx` | 50-55 | `const ESTADO_BADGE...` | **Datos, no comentario** — mover a `constants/` |
| `RangosUpdPage.tsx` | 75-80 | Comentarios sobre queries | **Mantener** (contexto de producto) |
| `RangosUpdPage.tsx` | 117-119 | `// ── Pre-check del rango candidato...` | **Mantener** (explica regla de producto) |
| `RangosUpdPage.tsx` | 159-162 | `function setFormCompletoReset...` | **Eliminar** (nombre autoexplicativo) |
| `AdminPage.tsx` | 37-42 | `ROLE_BADGE` | **Datos** → `constants/` |
| `AdminPage.tsx` | 44-49 | `ROLE_LABEL` | **Datos duplicados** → `constants/` |
| `AdminPage.tsx` | 51-56 | `ROLE_AVATAR` | **Datos** → `constants/` |
| `AdminPage.tsx` | 58 | `SEDES` | **Duplicado** → `constants/sedes.ts` |
| `AdminPage.tsx` | 60-66 | `EMPTY_FORM` | **Datos** → `constants/` |
| `AdminPage.tsx` | 68-81 | Validators inline | **Lógica** → `lib/validators/user.ts` |
| `AdminPage.tsx` | 83-90 | `getInitials` + JSDoc | **Eliminar JSDoc**; mover fn a `lib/utils.ts` |
| `AdminPage.tsx` | 153-161 | `stats` useMemo | **Datos derivados** — OK inline |
| `AdminPage.tsx` | 163-167 | `sedes` useMemo | **Datos derivados** — OK inline |
| `AdminPage.tsx` | 184-189 | `statCards` array | **Datos de UI** → `constants/adminStats.ts` |
| `AdminPage.tsx` | 254-257 | `formatDisplayDate` + JSDoc | **Duplicada** con `auth.controller`/`users.controller` → `lib/date.ts` compartido |

---

## 3. Plan de Refactor (Resumen)

### Backend — Nuevos archivos de configuración
```
backend/src/config/
├── constants.ts          # Puerto, host, timeouts, rate limits, session
├── paths.ts              # Rutas de plantillas, temp, assets
├── zoho.ts               # DC_DOMAINS, timeouts, retry
├── upd.ts                # UPD_PREFIX, UPD_DIGITS, UPD_REGEX (re-export de utils)
├── roles.ts              # ROLES array, etiquetas, badges, avatares
├── regex.ts              # CC_REGEX, ISO_DATE_REGEX, CAJA_REGEX
├── excel.ts              # Estilos, formatos, anchos, labels inventario
└── audit.ts              # AUDIT_DETALLE_MAX_LENGTH
```

### Frontend — Nuevos archivos
```
frontend/src/
├── config/
│   ├── routes.ts         # ROLE_ROUTE_GUARDS, fallback routes
│   ├── nav.ts            # NAV_ITEMS
│   └── authPaths.ts      # PUBLIC_AUTH_PATHS
├── constants/
│   ├── roles.ts          # ROLES, ROLE_LABEL, ROLE_BADGE, ROLE_AVATAR (compartido)
│   ├── sedes.ts          # SEDES array
│   ├── upd.ts            # UPD_REGEX, normalizeUpd, toNumeric, formatUpd (re-export)
│   ├── roleBadges.ts     # ROLE_BADGE
│   ├── roleAvatars.ts    # ROLE_AVATAR
│   ├── emptyUserForm.ts  # EMPTY_FORM
│   ├── adminStats.ts     # statCards config
│   └── storageKeys.ts    # STORAGE_KEYS
├── lib/
│   ├── validators/
│   │   └── user.ts       # validateCc, validateNombre, validateContrasena
│   ├── date.ts           # formatDisplayDate, ISO_DATE_REGEX
│   └── upd.ts            # Funciones UPD compartidas (eliminar duplicados en RangosUpdPage)
└── types.ts              # Solo tipos; mover arrays/constantes a constants/
```

### Eliminación de comentarios
- Borrar todos los JSDoc que solo repiten firma/nombre de función
- Borrar comentarios de una línea que describen lo obvio (`// API`, `// Rate limit...`)
- Mantener solo comentarios que explican **por qué**: decisiones de negocio, workarounds, reglas de producto, orden de middleware crítico

### Naming consistente
- Constantes: `UPPER_SNAKE_CASE` (ej. `BCRYPT_SALT_ROUNDS`)
- Tipos/interfaces: `PascalCase` (ya correcto)
- Archivos de config: `kebab-case.ts` (`constants.ts`, `zoho.ts`)
- Exportar todo desde `index.ts` de cada carpeta para imports limpios