# Auditoría de arquitectura - Luciérnaga

Fecha: 2026-08-13

## Resumen

Informe de verificación de rutas, proxy/CORS, sesiones y coincidencia frontend↔backend. Se realizaron pruebas locales con Vite (puerto 5173) y API (puerto 3000). Se añadió una ruta de depuración temporal `/api/__dev_login` para validar sesiones.

## Hallazgos principales

- Backend expone los endpoints esperados bajo el prefijo `/api` (ej: `/api/login`, `/api/currentUser`, `/api/checkAuth`, `/api/users`, `/api/moduloscliente`, `/api/modulos_caja`, `/api/fuiddatosreal`, `/api/inventario`, `/api/historial`, `/api/sub_modulos`, `/api/generarPlantilla`, `/api/fuid-con-estado-caja`).
- Frontend usa un `axios` con `baseURL: '/api'` y `withCredentials: true`, por lo que las llamadas se dirigen al prefijo correcto.
- Vite estaba proxyando también rutas como `/login` (antes) lo que hacía que rutas cliente no se sirvieran como SPA; esos proxies fueron removidos y ahora solo existe el proxy `/api`.
- Backend configura CORS con `origin` por defecto `http://localhost:5173` y `credentials: true` (correcto para desarrollo local con proxy).
- Session cookie (`connect.sid`) se emite con `HttpOnly; SameSite=Lax; Path=/` y llega correctamente a través del proxy Vite según pruebas con `curl`.
- Resultado del comportamiento observado: `401` en `/api/currentUser` se debía a ausencia de sesión válida (comportamiento esperado si no hay cookie o si no se inició sesión correctamente).

## Endpoints verificados manualmente (resumen)

- `GET /api/health` -> 200 OK (proxy y backend)
- `POST /api/__dev_login` -> 200 OK (ruta debug añadida en dev) y emite cookie de sesión
- `GET /api/currentUser` -> 200 con cookie válida; 401 sin sesión (esperado)
- `POST /api/login` -> definido en backend (requiere credenciales y validación contra BD)
- Resto de endpoints CRUD (users, moduloscliente, modulos_caja, fuiddatosreal, inventario, historial, sub_modulos, plantilla, reportes) -> existen y están protegidos por middlewares de auth según rol

## Problemas potenciales detectados

- Si el cliente recibe `401` al iniciar sesión, es probable que:
  - Las credenciales enviadas sean incorrectas (base de datos / comparación de contraseña).
  - El `POST /api/login` no se esté llamando correctamente desde el frontend (ver Network en DevTools).
  - El navegador esté bloqueando cookies (configuración de seguridad, extensiones o políticas SameSite en despliegues cross-domain).
- `net::ERR_INSUFFICIENT_RESOURCES` puede indicar problemas locales del navegador o demasiadas peticiones simultáneas; no fue reproducido consistentemente en pruebas con `curl`.

## Recomendaciones inmediatas (prioritarias)

1. Validar flujo E2E de login:
   - En DevTools > Network inspeccionar `POST /api/login` y confirmar: status 200, body.success true, y que exista `Set-Cookie` en la respuesta.
   - Confirmar que la siguiente llamada `GET /api/currentUser` incluya cookie y obtenga 200.
2. Añadir logs en backend en `auth.controller.login` para registrar intentos fallidos (usuario no encontrado, password mismatch) para diagnosticar problemas de credenciales.
3. Mantener `axios` con `withCredentials: true` (ya está configurado). Confirmar que no haya interceptores que modifiquen `baseURL` en runtime.
4. Para despliegue cross-domain (frontend y backend en dominios distintos) cambiar cookie a `sameSite: 'none'` y `cookie.secure = true` en producción y usar HTTPS.
5. Eliminar la ruta `POST /api/__dev_login` antes de subir a un entorno compartido o a producción.

## Recomendaciones de arquitectura y siguientes pasos

1. Normalizar todas las llamadas del frontend para usar el prefijo `/api` (ya implementado en la mayoría de lugares). Hacer una búsqueda global por llamadas `fetch`/`axios` sin `/api`.
2. Documentar rutas y permisos en `ARCHITECTURE.md` o `API.md` (endpoints, roles requeridos, ejemplos de request/response).
3. Agregar pruebas automáticas básicas (integration tests) para autenticación y rutas protegidas.
4. Centralizar la configuración de CORS, dominio de cookie y secreto de sesión vía variables de entorno y documentarlas.
5. Añadir script de verificación local que realice: start backend, start frontend, POST login con credenciales de prueba, validar `GET /api/currentUser`.

## Próximo paso que puedo ejecutar ahora

- Ejecutar un test E2E de login con credenciales de prueba (si me proporcionas credenciales de desarrollo), orquestar y documentar los resultados.
- O bien generar `API.md` con el listado de endpoints y permisos (lo genero ahora si lo deseas).

---

Archivo generado automáticamente por auditoría local.
