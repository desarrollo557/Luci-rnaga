# Luciérnaga

Luciérnaga es el sistema con el que SIAR lleva el inventario documental de sus
clientes. Cada cliente entrega su archivo en cajas, acompañadas de un acta de
transferencia; el equipo técnico abre las cajas y digita, expediente por
expediente, el Formato Único de Inventario Documental (FUID). De aquí salen el
inventario de cada cliente en el formato oficial, el seguimiento de cuánto
produjo cada persona cada día y el historial de todo lo que se cambió.

Este repositorio contiene la API y la interfaz web. Se despliegan juntas en un
solo servicio de Render, sobre una base de datos PostgreSQL en Supabase.

## De qué está hecho

| Capa | Con qué |
| --- | --- |
| API | Node.js 22, Express 4 y TypeScript. Acceso a PostgreSQL con `pg`, sesiones guardadas en la propia base con `connect-pg-simple`, validación con Zod, `helmet` y `express-rate-limit` delante. |
| Interfaz | React 19 con Vite 6 y Tailwind CSS 4. TanStack Query para los datos, Zustand para la sesión, React Router, Sonner para los avisos y Lucide para los iconos. |
| Base de datos | PostgreSQL en Supabase. El esquema vive en `database/supabase/`. |
| Excel | ExcelJS para el inventario (formato F-PSD-001) y JSZip para el seguimiento (F-PSD-IDA-001). Son dos librerías porque el segundo archivo lleva rangos protegidos y formatos condicionales que ExcelJS no consigue reescribir sin que Excel pida reparación. |
| Pruebas | Vitest en los dos lados. En el backend, además, PostgreSQL en memoria (PGlite) para las consultas cuya lógica está dentro del SQL. |
| Despliegue | Render, un único servicio que sirve la API y el frontend compilado bajo el mismo dominio. |

El software nació sobre MySQL y en septiembre de 2026 pasó a PostgreSQL. Las
consultas siguen escritas con los marcadores `?` de aquella época porque
`backend/src/config/db.ts` los traduce a `$1, $2…` al vuelo: reescribir medio
centenar de consultas a mano habría multiplicado las erratas sin cambiar lo que
hacen. Lo que no se podía traducir (`GROUP_CONCAT`, `DATE_FORMAT`, las columnas
en mayúsculas de `inventario`) está reescrito consulta por consulta.

## Cómo se llaman las cosas

Los nombres de las tablas vienen de la versión anterior del software y no
coinciden con lo que la gente ve en pantalla. La regla es una: en la interfaz,
en los avisos y en la documentación se usa el vocabulario del negocio; en la
base y en la API se conservan los nombres técnicos, porque cambiarlos exigiría
migrar datos sin ganar nada a cambio.

| En pantalla | En la base | En la API |
| --- | --- | --- |
| Cliente | `sub_modulos` | `/api/sub_modulos` |
| Acta de transferencia | `moduloscliente` | `/api/moduloscliente` |
| Caja | `modulos_caja` | `/api/modulos_caja` |
| Registro FUID | `fuiddatosreal` | `/api/fuiddatosreal` |
| Inventario de un cliente | `inventario` | `/api/inventario` |
| Revisión (marcar OK) | `fuiddatosreal.historial_y_cambios = 'OK'` | `/api/fuiddatosreal/marcar-ok` |

La jerarquía es cliente → acta → caja → registro FUID: un cliente tiene actas,
cada acta trae cajas y en cada caja se digitan registros.

## Perfiles

Hay tres perfiles: ADMIN, LIDER y TECNICA. Existió un cuarto, CALIDAD, que se
retiró en septiembre de 2026; la revisión de registros la hacen ahora los tres.

| Perfil | Qué ve en el menú | Qué hace |
| --- | --- | --- |
| ADMIN | Administración | Crea, edita, suspende y elimina usuarios. |
| LIDER | Clientes, Producción, Inventario, Historial | Administra los clientes, actas y cajas de su sede, asigna técnicas a las cajas, revisa registros, descarga inventarios y seguimientos y consulta el historial de cambios. |
| TECNICA | Clientes, Mi Panel | Digita registros FUID en las cajas que tiene asignadas y revisa. Su panel le enseña, antes que nada, las cajas que dejó a medias. |

Una cuenta puede llevar un segundo perfil. El principal decide en qué pantalla
aterriza la persona al entrar; el segundo solo suma permisos, nunca los quita.
Es lo que permite que quien administra el sistema lleve además clientes sin
necesitar dos cuentas. Los guardias de la API (`backend/src/middlewares/auth.ts`)
miran los dos perfiles.

La visibilidad de una técnica se deriva de sus cajas: ve los clientes y las
actas que tienen alguna caja asignada a ella, y nada más.

## Puesta en marcha en local

Hace falta Node.js 22 o superior y npm. No hay que instalar ninguna base de
datos: el entorno local trabaja contra la misma base de Supabase que
producción, así que lo que se ve en local es lo que hay en producción. Conviene
tenerlo presente antes de probar escrituras.

1. Instalar las dependencias de los tres `package.json`:

   ```bash
   npm install
   npm --prefix backend install
   npm --prefix frontend install
   ```

2. Crear `backend/.env` a partir de `backend/.env.example` y rellenar la
   conexión a Supabase (`PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`,
   `PG_PASSWORD`) y `SESSION_SECRET`. Los valores están en
   [`docs/ENTORNOS.md`](docs/ENTORNOS.md), salvo la contraseña, que se pide a
   quien administre el proyecto en Supabase. El `.env` no se versiona.

3. Arrancar los dos procesos desde la raíz:

   ```bash
   npm run dev
   ```

   La API queda en `http://localhost:3000` (con `GET /api/health` para
   comprobarla) y la interfaz en `http://localhost:5173`, que reenvía a la API
   todo lo que empieza por `/api`.

Si falta alguna variable de la base, el backend no arranca: termina con un
mensaje que dice cuál falta y dónde ponerla. Antes arrancaba igual y cada
petición fallaba con un `ECONNREFUSED` que no explicaba nada.

| Comando (en la raíz) | Qué hace |
| --- | --- |
| `npm run dev` | Backend y frontend a la vez, con `concurrently`. |
| `npm run dev:backend`, `npm run dev:frontend` | Cada uno por separado. |
| `npm run typecheck` | Typecheck de los dos lados. |
| `npm run build` | Build de producción del frontend. |
| `npm run start` | Backend compilado (`node backend/dist/server.js`), como corre en Render. |
| `npm run ports:check` | Comprueba que los puertos 3000 y 5173 estén libres y, si no, asigna otros en `.port-config/`. |

## Cómo funciona por dentro

**El camino de una petición.** `express.json()` → `cuerpoEnMayusculas`, que
recorta espacios y pasa a mayúsculas todo texto salvo las contraseñas →
`idNumerico`, que rechaza ids de ruta que no sean enteros → `validate(schema)`,
que aplica el esquema Zod y responde 400 con `{ error, details[] }` → el
controlador, con las reglas que necesitan consultar la base → PostgreSQL, cuyas
restricciones UNIQUE, CHECK y llaves foráneas son el último backstop →
`errorHandler`, que traduce los códigos SQLSTATE a respuestas con sentido. Está
detallado en [`docs/VALIDACIONES.md`](docs/VALIDACIONES.md).

**El esquema se asegura al arrancar.** Antes de atender la primera petición,
`backend/src/config/esquema.ts` aplica los ajustes aditivos e idempotentes que
el código da por hechos: una columna, un índice, una restricción. Existe por un
incidente concreto: se desplegó código que leía una columna cuya migración
nadie había ejecutado y la pantalla de Administración se quedó en 500. Lo que
no es aditivo se sigue aplicando a mano desde `database/supabase/`.

**Hora de Colombia.** El servidor y la base corren en UTC, pero todo el
software trabaja en `America/Bogota`. Cada conexión del pool ejecuta `SET TIME
ZONE`, `fechaHoyLocal()` es la única forma de saber qué día es y
`frontend/src/lib/fechas.ts` da forma a todo lo que se muestra, en formato de
12 horas.

**Las pantallas se refrescan solas.** Las que muestran trabajo compartido
(Producción, Inventario, las cajas) vuelven a consultar cada 15 segundos
mientras la pestaña está en primer plano (`frontend/src/lib/refresco.ts`). Se
eligió consultar en vez de mantener una conexión abierta porque el servicio de
Render, en el plan gratuito, se duerme a los 15 minutos sin tráfico y una
conexión permanente lo mantendría despierto gastando horas del mes.

**Los inventarios se ponen al día a las 4:15 de la tarde.**
`actualizacionDiaria.service.ts` recalcula las cifras de todos los inventarios
cada tarde. Si el servicio estaba dormido a esa hora, lo hace en cuanto
despierta.

**Zoho es opcional.** Con las variables `ZOHO_*` definidas, el inventario de un
cliente se puede subir a Zoho WorkDrive como hoja de cálculo. Sin ellas esa
función queda inactiva y el resto del sistema no se entera.

## Reglas de negocio que conviene conocer

Cada una tiene su razón y su sitio en el código. Están desarrolladas en
[`docs/VALIDACIONES.md`](docs/VALIDACIONES.md); estas son las que más sorprenden
a quien llega nuevo.

**Todo se guarda en mayúsculas, salvo la contraseña.** Lo garantizan tres capas
(el middleware del backend, el interceptor de axios y una regla de CSS) para que
ningún formulario tenga que acordarse. La contraseña conserva mayúsculas y
minúsculas al crear la cuenta y al entrar.

**Lo que se deja vacío se guarda como `N/A`.** Ningún formulario bloquea el
envío por un campo descriptivo en blanco: quien digita llena lo que el documento
tiene. La ausencia se persiste como `N/A`, que es el marcador que ya traían los
registros históricos. Quedan fuera las fechas y los números, que guardan NULL;
lo que identifica o relaciona registros; y los dos asuntos del FUID, que son
obligatorios porque son lo que permite saber qué contiene un documento sin
abrir la caja.

**El UPD es un consecutivo por técnica y por caja.** Tiene la forma `UPD` más
siete dígitos y la técnica nunca escribe las siglas. La primera vez que abre una
caja, la interfaz le pide solo el número de arranque; desde entonces cada
registro viene con el siguiente ya puesto. Es único en toda la base.

**El estado de la caja se deduce, no se marca.** Guardar un registro en una
caja la abre; guardar uno en otra caja cierra la anterior, con la fecha de su
último registro y no la del día del cierre. La única caja abierta es en la que
se está trabajando, que es la que se continúa al día siguiente. Nadie pulsa
"caja terminada": este es un software operativo y un botón que hay que acordarse
de pulsar acaba sin pulsarse, y entonces el seguimiento miente. La lógica está
en `backend/src/services/cicloCaja.service.ts`.

**Las técnicas se asignan por caja.** Solo existe `asignacion_caja_tecnica`. La
asignación por acta de la versión anterior se retiró porque obligaba a asignar
dos veces a la misma persona.

**Quién edita un registro FUID.** LIDER y ADMIN editan cualquiera, sin límite
de autor ni de fecha. TECNICA corrige solo los suyos y solo el mismo día en que
los digitó. Cada versión anterior queda copiada en `historial` por un trigger,
así que levantarle la restricción al líder no borra el rastro.

**Eliminar respeta la jerarquía y deja huella.** Un cliente no se borra si
tiene actas, ni un acta si tiene cajas. Borrar una caja arrastra, en una
transacción, sus registros (el trigger deja copia en `historial`) y sus
asignaciones. Toda eliminación queda en la tabla `auditoria` con entidad, id,
acción, detalle y usuario.

**Contraseñas heredadas.** Se guardan con bcrypt. Quedan cuentas antiguas con
la clave en texto plano y, por defecto, no pueden entrar: se les pide
restablecerla. `PERMITIR_PASSWORD_PLANO=true` abre una ventana de migración en
la que el primer login de cada cuenta heredada la deja cifrada. Está apagado por
defecto porque, encendido de forma permanente, cualquier fila insertada a mano
en `users` con la clave en claro sería una puerta abierta.

## La API

Todas las rutas cuelgan de `/api` y, salvo el login, exigen sesión. La sesión
vive en una cookie `HttpOnly` (`connect.sid`) guardada en la tabla `session` de
la base, de modo que un despliegue no echa a nadie. La columna "Quién" indica el
guardia adicional cuando lo hay.

Sesión:

| Método | Ruta | Quién | Qué hace |
| --- | --- | --- | --- |
| POST | `/login` | cualquiera | Entra con cédula y contraseña. Limitado a 30 intentos por minuto. |
| GET | `/currentUser` | sesión | La cuenta de la sesión, con sus perfiles. |
| GET | `/checkAuth` | sesión | 200 si hay sesión, 401 si no. |
| POST | `/logout` | sesión | Cierra la sesión. |

Usuarios (todas exigen ADMIN, salvo la última):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET, POST | `/users` | Lista y crea. |
| GET, PUT, DELETE | `/users/:id` | Consulta, edita, elimina. No se elimina la propia cuenta ni el único administrador. |
| PATCH | `/users/:id/suspension` | Suspende hasta una fecha. |
| GET | `/usuarios/:rol` | Con sesión: personas de ese perfil en la sede de quien pregunta, para asignarlas a una caja. |

Clientes, actas y cajas (leer exige sesión; crear, editar y borrar exigen LIDER
o ADMIN, y el líder solo dentro de su sede):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET, POST | `/sub_modulos` | Clientes. |
| PUT, DELETE | `/sub_modulos/:id` | Un cliente. No se borra si tiene actas. |
| GET, POST | `/moduloscliente` | Actas. |
| GET, PUT, DELETE | `/moduloscliente/:id` | Un acta. No se borra si tiene cajas. |
| GET | `/moduloscliente/count_cajas` | Cuántas cajas tiene un acta. |
| GET, POST | `/modulos_caja` | Cajas. Para líder y admin, cada caja trae `tecnicos_asignados`. |
| POST | `/modulos_caja/serie` | Crea una serie de cajas (número inicial a final, máximo 500) y, si se indica, les asigna técnicas. |
| GET, PUT, DELETE | `/modulos_caja/:id` | Una caja. Borrarla arrastra registros y asignaciones. |
| GET | `/modulos_caja/next/:prefijo` | Siguiente número de caja libre para el prefijo de un cliente (LIDER o ADMIN). |
| GET | `/modulos_caja/count_fuiddatosreal` | Cuántos registros tiene una caja. |
| GET | `/modulos_caja/:modulo_id/usuarios` | Técnicas asignadas a la caja. |
| GET | `/modulos_caja/tecnica-stats` | Cifras de la técnica que pregunta. |
| PATCH | `/modulos_caja/:id/cambiarEstado` | Corrección manual del estado de una caja (TECNICA). El estado normalmente se deduce solo. |
| GET | `/modulos_caja/next-upd/:caja` | Siguiente UPD de la técnica en esa caja; `requiere_inicio: true` si aún no arrancó. |
| PUT | `/modulos_caja/:caja/upd-inicio` | Fija el UPD de arranque (TECNICA). Se rechaza si ese UPD ya existe. |
| POST | `/asignacion_caja_tecnica` | Asigna técnicas a una caja (LIDER o ADMIN). |
| POST | `/asignacion_caja_tecnica/:modulo_id/eliminar` | Quita técnicas de una caja (LIDER o ADMIN). |

Registros FUID (con sesión; el backend comprueba en cada caso lo que el perfil
puede hacer):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET, POST | `/fuiddatosreal` | Lista (`caja`, `upd`, `q`, `limit`, `offset`) y crea. Una técnica solo digita en cajas asignadas. |
| GET, PUT, DELETE | `/fuiddatosreal/:id` | Un registro. El PUT lleva `version` para el bloqueo optimista. |
| GET | `/fuiddatosreal/check-duplicate-upd` | Si un UPD ya existe, mientras se escribe. |
| GET | `/fuiddatosreal/check-caja-duplicates` | Registros repetidos dentro de una caja. |
| GET | `/fuiddatosreal/:caja/suggestions/:campo` | Valores ya usados en la caja, para autocompletar. |
| POST | `/fuiddatosreal/marcar-ok` | Revisión: aprueba registros. |

Inventario, historial, reportes y formatos:

| Método | Ruta | Quién | Qué hace |
| --- | --- | --- | --- |
| GET, POST | `/inventario` | LIDER o ADMIN | Inventarios. |
| GET, PUT, DELETE | `/inventario/:id` | LIDER o ADMIN | Un inventario. |
| GET | `/inventario/clientes`, `/inventario/clientes/:codigo` | LIDER o ADMIN | Clientes con su árbol de actas y las cifras de trabajo sin reflejar. |
| GET | `/inventario/clientes/:codigo/excel` | LIDER o ADMIN | El inventario FUID del cliente en el formato F-PSD-001. |
| GET | `/inventario/:id/fuid`, `/inventario/:id/excel` | LIDER o ADMIN | Los registros de un inventario y su Excel. |
| POST | `/inventario/:id/recalcular` | LIDER o ADMIN | Vuelve a leer las cifras del cliente. |
| POST | `/inventario/:id/sync` | LIDER o ADMIN | Sube el inventario a Zoho (si está configurado). |
| GET | `/historial` | LIDER o ADMIN | Historial paginado (`page`, `pageSize`, `q`, `tipo`, `sede`, `caja`, `desde`, `hasta`). |
| GET | `/historial/registro/:idDato` | LIDER o ADMIN | Todas las versiones de un registro. |
| GET | `/estadisticas`, `/estadisticas/detalle` | sesión | Cifras de Producción, calculadas con SQL sobre las tablas reales. El detalle admite `desde`, `hasta` y `persona`. |
| GET | `/seguimiento-inventario/resumen`, `/seguimiento-inventario/excel` | LIDER o ADMIN | Cuántas jornadas saldrán, y el seguimiento en el formato F-PSD-IDA-001 (`desde`, `hasta`, `persona`). |
| GET | `/fuid-con-estado-caja`, `/resumen-cajas-agrupado` | sesión | Registros con el estado de su caja; resumen por rangos de caja. |
| POST | `/generarPlantilla` | sesión | Exporta registros a Excel sobre `PLANTILLA.xlsx`, filtrando por caja o entidad. El archivo temporal se borra al enviarlo. |

## Los formatos Excel

Viven en `backend/assets/plantilla/`. Se buscan a partir de la ubicación del
código y no del directorio de trabajo, porque en Render el servidor arranca
desde la raíz del repositorio y no desde `backend/`.

| Archivo | Para qué | Cómo se genera |
| --- | --- | --- |
| `F-PSD-001.xlsx` | Inventario de un cliente en el formato oficial: membrete, código, versión y los 27 encabezados. Los registros empiezan en la fila 8. | `inventarioExcel.service.ts` con ExcelJS. |
| `F-PSD-IDA-001.xlsx` | Seguimiento de inventario: una fila por jornada, cliente y colaborador, con qué caja se empezó, en cuál se acabó y cuántas quedaron terminadas. | `seguimientoInventario.service.ts` reescribe solo la hoja de datos dentro del zip. La plantilla se prepara una vez con `backend/scripts/plantilla/preparar-seguimiento.mts` a partir del original del cliente. |
| `PLANTILLA.xlsx` | Exportación genérica de registros. | `plantilla.service.ts`. |

## Pruebas

Las unitarias corren en cada PR y no necesitan base de datos:

```bash
npm --prefix backend test      # validadores, middlewares, servicios, consultas con PGlite
npm --prefix frontend test     # componentes y utilidades, con jsdom
npm --prefix frontend run lint # solo las reglas de los hooks de React
```

El lint del frontend es deliberadamente pequeño: existe porque un `useState`
colocado después de un `return` dejó Producción en blanco, y ni el typecheck ni
las pruebas lo veían. No hay reglas de estilo, para que nadie acabe
silenciándolo.

Lo que solo la base puede responder está en `backend/scripts/pruebas/` y
`backend/scripts/migracion/`: la matriz de permisos endpoint por perfil, el
esquema y los triggers contra Supabase, el flujo completo de cliente a informe,
la evidencia de la API. Se describen en [`docs/ENTORNOS.md`](docs/ENTORNOS.md).

## Estructura del repositorio

```
├── backend/
│   ├── assets/plantilla/      Los tres formatos Excel
│   ├── scripts/
│   │   ├── migracion/         Paso de MySQL a Supabase y pruebas de humo contra la base
│   │   ├── plantilla/         Preparación del formato de seguimiento
│   │   └── pruebas/           Permisos, base de datos, formato y evidencia de la API
│   └── src/
│       ├── app.ts             Express: seguridad, sesión, rutas, frontend en producción
│       ├── server.ts          Comprobación de configuración, esquema y arranque
│       ├── config/            db.ts (pool y traducción de SQL), esquema.ts, constants.ts
│       ├── controllers/       Uno por recurso
│       ├── middlewares/       auth, validate, mayusculas, paramId, errorHandler
│       ├── routes/            Definición de rutas y guardias
│       ├── services/          Ciclo de caja, FUID, Excel, actualización diaria, Zoho, auditoría
│       ├── validators/        Esquemas Zod
│       └── utils/             Formato de fechas, UPD, N/A, perfiles
├── frontend/src/
│   ├── components/            layout/, ui/ y charts/
│   ├── lib/                   api.ts, fechas, refresco, catálogos, límites, validación
│   ├── pages/                 Una pantalla por ruta
│   └── stores/                Sesión y tema
├── database/
│   ├── supabase/              Esquema y scripts de PostgreSQL, numerados
│   └── *.sql, *.ps1           Scripts de la época de MySQL (ver database/README.md)
├── docs/                      Entornos, flujo de Git, validaciones, histórico
├── render.yaml                El servicio de Render, como Blueprint
└── .github/workflows/ci.yml  El pipeline
```

## Más documentación

- [`docs/ENTORNOS.md`](docs/ENTORNOS.md): las variables de entorno, el entorno local, Render, Supabase y cómo comprobar que todo funciona.
- [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md): las ramas, los PR, el CI y cómo llega un cambio a producción.
- [`docs/VALIDACIONES.md`](docs/VALIDACIONES.md): cada regla de negocio, dónde se valida y por qué.
- [`database/README.md`](database/README.md): qué hay en `database/` y qué es herencia de MySQL.
- [`docs/historico/`](docs/historico/): auditorías de agosto de 2026, anteriores a la migración. Se conservan como registro; no describen el estado actual.
