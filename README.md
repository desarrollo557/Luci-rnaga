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

Crear la base de datos e importar el esquema:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS fuiddatosluciernaga CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root -p fuiddatosluciernaga < database/schema.sql
```

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
│       ├── controllers/     # Lógica de cada endpoint
│       ├── middlewares/     # auth (roles) y errorHandler
│       ├── routes/          # Definición de rutas por recurso
│       ├── services/        # Lógica de negocio (plantilla, fuid)
│       ├── types/           # Tipos compartidos y de BD
│       └── utils/           # asyncHandler, formateadores
├── frontend/                # SPA React + Vite
│   └── src/
│       ├── components/      # layout/ (AppLayout) y ui/ (Button, Table, Modal...)
│       ├── lib/api.ts       # Cliente axios centralizado con todos los endpoints
│       ├── pages/           # Una pantalla por ruta (Admin, Clientes, Datos...)
│       ├── stores/          # Zustand (authStore)
│       └── types.ts         # Tipos compartidos del dominio
├── database/schema.sql      # Esquema de la base de datos
├── docs/                    # Documentación (auditoría de arquitectura)
└── package.json             # Orquestación raíz (concurrently)
```

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
| GET/POST/PUT/DELETE | `/modulos_caja` | Cajas por módulo |
| GET/POST/PUT/DELETE | `/fuiddatosreal` | Registros FUID |
| POST | `/fuiddatosreal/marcar-ok` | Aprueba FUID (calidad) |
| GET | `/inventario` | Inventario |
| GET | `/historial` | Historial |
| POST | `/generarPlantilla` | Exporta plantilla Excel |
| GET | `/fuid-con-estado-caja` | Reporte de producción |

## Notas

- El frontend usa un proxy de Vite (`/api` → `http://localhost:3000`); todas las llamadas al backend usan el prefijo `/api`.
- La sesión vive en cookie HttpOnly; en producción con dominios cruzados hay que ajustar `sameSite` y `secure` en `backend/src/app.ts`.
- `backend/.env` no se versiona: crea el tuyo localmente (ver arriba).