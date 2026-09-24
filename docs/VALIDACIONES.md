# Validaciones de Luciérnaga

Documento de referencia único del equipo: qué se valida, dónde y por qué.

**El backend es siempre la barrera real.** El frontend valida para avisar antes
de enviar, nunca como única defensa: quien llame directamente a la API se salta
todo lo que viva solo en React.

El orden en que se aplican las cosas a una petición es este:

```
express.json()
  → cuerpoEnMayusculas      recorta espacios y pasa a MAYÚSCULAS (salvo contraseñas)
  → idNumerico              rechaza ids de ruta que no sean enteros
  → validate(schema)        schema zod; responde 400 con { error, details[] }
  → controlador             reglas que necesitan consultar la base
  → PostgreSQL              UNIQUE, CHECK y llaves foráneas, último backstop
  → errorHandler            traduce los códigos SQLSTATE a respuestas con sentido
```

El formato de error es siempre el mismo:

```json
{ "error": "Datos inválidos", "details": [{ "field": "fecha_final", "message": "…" }] }
```

---

## Registro FUID

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| La caja es obligatoria | `fuiddatosreal.validator.ts` → `createFuidSchema.caja` | — (el formulario la hereda de la caja abierta) |
| El número de orden lo pone el servidor y es el consecutivo de la caja | `createFuid` bloquea la fila de la caja y asigna el siguiente `n_orden`; lo que se muestra y se exporta es `n_orden_caja`, calculado con `sqlOrdenEnCaja()` (`fuid.service.ts`) | El formulario no lo pide; las tablas leen `n_orden_caja` |
| El asunto automático y el asunto manual son obligatorios | `fuiddatosreal.validator.ts` → `textoRequerido`, al crear y al editar | `DatosPage.tsx` marca ambos con `*`, avisa bajo el campo y bloquea el envío |
| El UPD es obligatorio y tiene formato `UPD` + 7 dígitos | `fuiddatosreal.validator.ts` → `updField`, que además normaliza el valor | `UpdInput.tsx`; `validUpd()` en `lib/validation.ts` |
| El UPD no se puede repetir | Restricción `unique_upd` en la base; `createFuid` y `updateFuid` traducen el `23505` a 409 `UPD_YA_USADO` | `DatosPage.tsx` consulta `check-duplicate-upd` mientras se escribe |
| Una técnica solo digita en las cajas que tiene asignadas | `createFuid` comprueba `asignacion_caja_tecnica` | La interfaz solo muestra sus cajas asignadas |
| Ninguna fecha es anterior a 1920-01-01 ni posterior a hoy | `common.validator.ts` → `fechaDocumental()`, con `FECHA_MINIMA_DOCUMENTAL` y `fechaHoyLocal()` | `dateInRange()` en `lib/validation.ts`; `min` y `max` en los inputs de fecha |
| Una fecha debe existir en el calendario (no `2025-02-30`) | `common.validator.ts` → `esFechaReal()` | `esFechaReal()` en `lib/validation.ts` |
| `fecha_final` no puede ser anterior a `fecha_inicial` | `fuiddatosreal.validator.ts` → `ordenDeFechas` | `dateOrderValid()`; el `min` de Fecha Final toma el valor de Fecha Inicial |
| Lo anterior también en una edición que solo cambia una de las dos | `updateFuid` → `validarOrdenDeFechasParcial()` con el registro guardado | — (el formulario siempre envía ambas) |
| `numero_doc_hasta` no puede ser menor que `numero_doc` | `fuiddatosreal.validator.ts` → `ordenDeNumerosDeDocumento`; compara con `BigInt` | — |
| `folios` es un entero ≥ 0, vacío o `N/A` | `fuiddatosreal.validator.ts` → `enteroNoNegativoOna` | `onlyDigits()` bajo el campo Folios |
| `tomo` admite `1/2` y `22 N 255`, pero no negativos ni puntuación de tecleo | `fuiddatosreal.validator.ts` → `referenciaDeTomo` | — |
| `soporte`, `frecuencia` y `otro` solo admiten valores del catálogo | `fuiddatosreal.validator.ts` → `catalogoCerrado`, con las listas de `config/constants.ts` | `Select` poblado desde `lib/catalogos.ts` |
| Ningún texto supera el tamaño de su columna | `textoOpcional()` con `LONGITUD_MAXIMA_FUID`; `errorHandler` traduce además el `22001` de PostgreSQL | `maxLength` en los inputs, desde `lib/limites.ts` |
| Todo texto se guarda sin espacios sobrantes y en MAYÚSCULAS | Middleware `cuerpoEnMayusculas` (usa `cleanUpper`) | `text-transform: uppercase` en `index.css`; interceptor de `lib/api.ts` |
| Quién puede editar un registro | `updateFuid`: LIDER y ADMIN, cualquiera; TECNICA, solo los suyos: los de hoy (`fechaHoyLocal()`) y, si la caja está reabierta por un líder (`modulos_caja.reabierta_por` con la caja EN PROCESO), también los de días anteriores | La interfaz oculta el botón según el perfil |
| Dos personas no pueden pisarse al editar el mismo registro | Columna `version`; `UPDATE … WHERE id = ? AND version = ?`; 409 `VERSION_DESACTUALIZADA` | `DatosPage.tsx` envía `editing.version` y muestra el aviso sin cerrar el formulario |
| Quién puede borrar un registro | `deleteFuid`: ADMIN cualquiera, LIDER los de su sede, TECNICA solo los suyos del día o, con la caja reabierta por un líder, también los de días anteriores | La interfaz oculta el botón según el perfil |
| Marcar OK solo en cajas asignadas | `marcarOk` comprueba `asignacion_caja_tecnica` para la técnica | — |
| Al guardar, la caja se abre y la anterior de esa persona se cierra | `createFuid` llama a `registrarDigitacion()` de `cicloCaja.service.ts` dentro de la misma transacción | `estadoCaja.ts` muestra el estado y avisa si la caja viene de días anteriores |

---

## Cliente (`sub_modulos`)

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| Código y entidad remitente obligatorios | `submodulos.validator.ts` | `ClientesPage.tsx` |
| El código no se repite dentro de la misma sede | Ver la nota de abajo | — |
| Un líder solo administra clientes de su sede | `jerarquia.service.ts` → `fueraDeSuSede()`; la sede no cambia al editar | La lista solo muestra los de su sede |
| No se borra un cliente que tenga actas | `deleteSubModulo`; `23503` → 409 | Diálogo de confirmación |

**Sobre el código repetido.** `submodulos.controller.ts` responde 409
`CODIGO_CLIENTE_REPETIDO` cuando la base rechaza el duplicado, pero lo detecta
con el error `ER_DUP_ENTRY` de MySQL, que PostgreSQL nunca emite, y el esquema
de Supabase no tiene el índice único sobre `(codigo, sede_submodulos)` que
existía en MySQL (`database/submodulo_codigo_unico.sql`). Es decir: **hoy la
regla no se aplica**. Para recuperarla hacen falta las dos cosas: crear el índice
(comprobando antes que no haya duplicados en los datos) y hacer que el
controlador reconozca el `23505` con ese nombre de restricción.

---

## Acta (`moduloscliente`)

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| El número de acta es obligatorio | `moduloscliente.validator.ts` | `ClientesPage.tsx` |
| El código y la entidad remitente pueden quedar en blanco y se guardan como `N/A` | `moduloscliente.validator.ts` → `textoNoDiligenciado` | `ClientesPage.tsx` no los exige |
| `id_submodulo` es un entero positivo | `moduloscliente.validator.ts` | — |
| La fecha de transferencia cumple los límites documentales | `fechaDocumental()` | — |
| Un líder solo administra actas de su sede | `jerarquia.service.ts` | La lista solo muestra las de su sede |
| No se borra un acta que tenga cajas | `deleteModuloCliente` | Diálogo de confirmación |

---

## Caja (`modulos_caja`)

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| El número de caja tiene formato `000C000000` | `modulosCaja.validator.ts` | `validCaja()` en `lib/validation.ts` |
| El número de caja es único en toda la base | Restricción `uq_modulos_caja_caja_modulo` → `23505` → 409 | — |
| Entidad productora, unidad administrativa, oficina productora y objeto pueden quedar en blanco y se guardan como `N/A` | `modulosCaja.validator.ts` → `textoNoDiligenciado` | `ActasPage.tsx` no los exige |
| El objeto solo puede ser `TRANSFERENCIA PRIMARIA` o `VALORACION DOCUMENTAL` | `OBJETOS_CAJA_VALIDOS`; se exige al crear y no al editar, porque las cajas antiguas guardan textos libres | `Select` con las dos opciones |
| Estado solo `EN PROCESO` o `FINALIZADO` | `modulosCaja.validator.ts` → `z.enum` | `Select` con las dos opciones |
| Guardar un registro abre la caja; nada la cierra sola | `cicloCaja.service.ts`: `registrarDigitacion` solo pone la caja EN PROCESO. Ningún cierre se deduce, ni al pasar a otra caja ni al cambiar de día | `estadoCaja.ts` lo traduce a etiqueta y color |
| La caja la cierra quien la trabaja, y cada cierre queda anotado | `POST /modulos_caja/:id/jornada` con `resultado: TERMINADA` (`declararJornadaDeCaja`) o `PATCH …/cambiarEstado` a FINALIZADO: cierran la caja atribuida a la fecha de su último registro y anotan el cierre en `jornada_caja` (día, persona y registros; `SQL_ANOTAR_CIERRE`). `CONTINUA` se retiró y responde 400 | `CierreDeJornada.tsx`: "Terminé esta caja" mientras la caja está EN PROCESO; `CajasPage.tsx`: "Dar por terminada" |
| La técnica reabre sus propias cajas | `PATCH /modulos_caja/:id/cambiarEstado` a EN PROCESO: TECNICA en sus cajas, LIDER en las de su sede, ADMIN en todas. Solo la reapertura del líder o el administrador escribe `reabierta_por` y `reabierta_el`, y todo cierre los borra | `CajaTerminada.tsx` en la digitación; "Reabrir caja" en `CajasPage.tsx` y `ActasPage.tsx` |
| Al reabrir, la técnica vuelve a indicar el UPD con el que continúa | `cambiarEstadoCaja` a EN PROCESO borra `upd_inicio` y `ultimo_upd` de las técnicas asignadas (`SQL_REINICIAR_ARRANQUE_UPD`); `GET /modulos_caja/next-upd/:caja` responde `requiere_inicio` mientras no lo fije | `UpdInicioDialog` en `DatosPage.tsx`, solo con la caja abierta |
| El seguimiento cuenta la caja en cada jornada en que se dio por terminada | `consultaSeguimiento` en `reportes.controller.ts`: cuenta los cierres anotados en `jornada_caja`; sin ninguno anotado, la caja pertenece a la jornada de su último registro | — |
| Cada técnico descarga su propio inventario general | `GET /inventario/mio/excel?desde=&hasta=`: sus registros, cruzados por la cédula de `elaborado_por`, en el formato F-PSD-001 | `TecnicaDashboardPage.tsx`: "Descargar mi inventario" |
| Una serie no crea más de 500 cajas de una vez | `createCajasSerie` en `modulosCaja.controller.ts` | — |
| El rango de una serie no puede estar invertido | `createCajasSerie` | — |
| Ningún número del rango puede existir ya | `createCajasSerie`, dentro de la transacción | — |
| La fecha de transferencia cumple los límites documentales | `fechaDocumental()` | — |
| Borrar una caja arrastra sus registros y asignaciones | `deleteModuloCaja`, en una transacción | Diálogo de confirmación |

---

## Usuarios y acceso

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| La cédula son solo dígitos (1 a 20) | `users.validator.ts` → `ccField`; `auth.validator.ts` en el login | `Login.tsx` y `AdminPage.tsx` |
| El nombre tiene al menos 3 caracteres | `users.validator.ts` | `AdminPage.tsx` |
| La contraseña tiene al menos 4 caracteres y conserva mayúsculas y minúsculas | `users.validator.ts`; `CLAVES_SIN_MAYUSCULAS` en `mayusculas.ts` | Excluida del interceptor y del CSS (`autocomplete` de contraseña) |
| El perfil principal es uno de los tres definidos | `users.validator.ts` → `z.enum(ROLES)` | `Select` de perfil principal |
| El segundo perfil es opcional y distinto del principal | `users.validator.ts` → `perfilesDistintos`; restricción `users_rol_secundario_distinto` en la base | `Select` de segundo perfil, que no ofrece el principal |
| Siempre queda al menos un administrador | `users.controller.ts`: cuenta las cuentas con `ADMIN` en cualquiera de los dos perfiles | La interfaz oculta el botón |
| La sede es obligatoria | `users.validator.ts` → `sedeField`, que solo exige que venga; el backend no comprueba que sea una de las cuatro | `Select` poblado desde `lib/sedes.ts`: Barranquilla, Bucaramanga, Bogotá y Santa Marta |
| Una cuenta con la contraseña sin cifrar no entra | `auth.controller.ts` con `PERMITIR_PASSWORD_PLANO` (apagada por defecto) | — |
| Un usuario suspendido no entra | `auth.controller.ts` compara `suspendido_hasta` con `fechaHoyLocal()` | — |
| No se elimina la propia cuenta | `users.controller.ts` | La interfaz oculta el botón |
| Límite de intentos de login | `loginLimiter` en `app.ts`: 30 por minuto | — |
| Límite general de peticiones | `generalLimiter` en `app.ts`: 1000 por IP cada 15 minutos | — |

---

## Cuentas con dos perfiles

Una cuenta lleva un perfil principal y, opcionalmente, un segundo. La regla es
una sola: **el segundo perfil solo suma permisos, nunca quita ninguno.**

El caso que lo motivó es la persona que administra el sistema y además lleva
clientes. Antes hacían falta dos cuentas, con dos contraseñas, y había que salir
de una para entrar en la otra. Ahora la misma cuenta ve la administración y las
pantallas de líder.

| Qué decide el perfil principal | Qué decide el segundo |
| --- | --- |
| En qué pantalla aterriza la persona al entrar | Nada de navegación |
| Qué devuelven las consultas que buscan gente por su oficio, como la lista de técnicas para asignar a una caja | Nada: una técnica de segundo perfil no aparece en esa lista |
| Los permisos, sumados con los del segundo | Los permisos, sumados con los del principal |

Dónde vive:

| Capa | Qué hace |
| --- | --- |
| `database/supabase/05-rol-secundario.sql` y `config/esquema.ts` | La columna `users.rol_secundario` y la restricción de que sea distinta del principal |
| `backend/src/utils/roles.ts` | `tieneRol()`, `tieneAlgunRol()` y `rolesDe()`: el único sitio donde se decide qué perfiles tiene una cuenta |
| `backend/src/middlewares/auth.ts` | Los cinco guardias miran los dos perfiles |
| `frontend/src/types.ts` | Los mismos tres ayudantes, para el enrutado, el menú y las pantallas |

Una cuenta de un solo perfil se comporta exactamente igual que antes de que
esto existiera: el segundo perfil es NULL y ninguna comprobación lo encuentra.

---

## Asignaciones

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| `modulo_id` y cada usuario son enteros positivos | `asignaciones.validator.ts` | — |
| Hay que asignar al menos un usuario | `asignaciones.validator.ts` | El formulario exige una selección |
| La asignación se hace solo por caja | `asignacionesCaja.controller.ts` (`asignacion_caja_tecnica`) | Formulario de caja en la vista de actas |
| Solo se asignan personas del perfil TECNICA de la misma sede | `GET /usuarios/:rol` filtra por perfil principal y sede | El selector solo ofrece esas |
| Borrar un usuario borra sus asignaciones | `ON DELETE CASCADE` en `asignacion_caja_tecnica` | — |

---

## Campos sin diligenciar: se guardan como `N/A`

Regla de todos los formularios del software, en todos los perfiles: **quien
digita llena lo que el documento, la caja o el inventario tienen y deja en
blanco lo que no conoce. Enviar no se bloquea por eso, y lo que quedó vacío se
registra como `N/A`.** El marcador no se escribe ni se muestra en el formulario;
es la forma en que se guarda.

`N/A` no es un valor inválido: es el marcador que ya traen los registros
históricos de `fuiddatosreal`. Antes esa misma ausencia se guardaba como NULL o
como cadena vacía según el formulario, así que la base decía lo mismo de tres
maneras y cada consulta tenía que contemplarlas todas.

La regla vive en `utils/noDiligenciado.ts` (`valorParaGuardar`), y cada sitio
declara qué columnas pueden recibir el marcador:

| Formulario | Dónde se aplica | Qué columnas |
| --- | --- | --- |
| Registro FUID | `services/fuid.service.ts` → `fuidValues()`, por donde pasan el INSERT y el UPDATE | `CAMPOS_NO_DILIGENCIADOS` en `config/constants.ts` |
| Caja | `modulosCaja.validator.ts` → `textoNoDiligenciado()` | Entidad productora, unidad administrativa, oficina productora y objeto |
| Acta | `moduloscliente.validator.ts` → `textoNoDiligenciado()` | Código y entidad remitente |
| Inventario | `inventario.controller.ts` → `pickValues()` | `TEXTO_NO_DILIGENCIADO`, declarado en el propio controlador |

El marcador solo cabe en columnas de texto. Lo que **nunca** lo recibe:

| Qué | Por qué |
| --- | --- |
| Toda columna `date`, `int` o `time` | No admiten el literal. Siguen guardando NULL: una fecha o una cantidad sin dato es NULL, no `N/A` |
| Lo que identifica un registro | Número de caja, código del cliente, número de acta, UPD y cédula: sin ellos no hay forma de distinguir un registro de otro |
| Lo que relaciona registros | El cliente de un acta, el acta de una caja, la caja de un FUID |
| Los selectores de catálogo | Rol, sede y estado de la caja. Los tres del FUID (soporte, frecuencia y otro) sí lo reciben, porque `N/A` es parte de su catálogo |
| Asunto automático y asunto manual | Obligatorios por decisión de negocio: son lo que permite saber qué contiene el documento sin abrir la caja |
| Credenciales y datos de la cuenta | Cédula, nombre, contraseña, rol y sede: sin ellos no hay cuenta ni acceso |
| `elaborado_por` y `sede` del FUID | Los pone el sistema. `elaborado_por` guarda "NOMBRE (CC)" y los reportes lo cruzan con `users` por la cédula |
| `historial_y_cambios`, `cambio_calidad`, `sede_calidad` | Los escribe la revisión (marcar OK), no el formulario de digitación |
| `CODIGO_DEL_CLIENTE` del inventario | El controlador decide con él si el inventario ya existe; dos inventarios en `N/A` se tomarían por el mismo |

Los validadores de formato tratan `N/A` como ausencia de valor y no lo rechazan:
`esValorVacio()` (frontend) y `sinDato()` (backend).

---

## Reglas transversales

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| Los ids de ruta son enteros positivos | Middleware `idNumerico` (`paramId.ts`) → 400 | — |
| El cuerpo de toda petición se normaliza | Middleware `cuerpoEnMayusculas` | Interceptor de `lib/api.ts` |
| Las contraseñas nunca se transforman | `CLAVES_SIN_MAYUSCULAS` en `mayusculas.ts` | Excluidas en el interceptor y en el CSS |
| Los errores de la base se traducen a mensajes en español | `errorHandler.ts`: `23505` (duplicado) → 409, `22001` (texto más largo que la columna) → 400, `23503` (llave foránea) → 409, distinguiendo por el detalle si se borra un padre con hijos o se apunta a algo que no existe | `toastApiError()` en `lib/feedback.ts` |
| Un error después de haber respondido no se responde dos veces | `errorHandler.ts` delega en Express si `res.headersSent` | — |

---

## Lo que garantiza la base

Restricciones que viven en PostgreSQL y que ninguna petición puede saltarse,
tal como están en `database/supabase/01-esquema.sql` y en los ajustes de
`config/esquema.ts`:

| Restricción | Tabla | Qué impide |
| --- | --- | --- |
| `unique_upd` | `fuiddatosreal` | Dos registros con el mismo UPD |
| `uq_modulos_caja_caja_modulo` | `modulos_caja` | Dos cajas con el mismo número |
| `users_rol_secundario_distinto` | `users` | Que el segundo perfil sea igual al principal |
| `version` con `DEFAULT 1 NOT NULL` | `fuiddatosreal` | Editar sobre una versión que otra persona ya cambió (bloqueo optimista) |
| Llaves foráneas | `moduloscliente` → `sub_modulos`, `modulos_caja` → `moduloscliente`, `asignacion_caja_tecnica` → `modulos_caja` y `users` (con `ON DELETE CASCADE`) | Actas sin cliente, cajas sin acta, asignaciones huérfanas |
| Triggers `fuid_asunto_automatico`, `fuid_historial_actualizacion`, `fuid_historial_eliminacion` | `fuiddatosreal` | Que el asunto se escriba a mano o que un cambio se pierda sin copia en `historial` |

Lo que **no** garantiza la base y hoy depende solo del controlador: el código de
cliente único por sede (ver la nota en la sección de Cliente).

---

## Pruebas

`npm --prefix backend test` y `npm --prefix frontend test` (Vitest). Corren en
cada PR sin necesitar base de datos; las que necesitan SQL usan PGlite, un
PostgreSQL en memoria.

Backend:

| Archivo | Qué comprueba |
| --- | --- |
| `validators/__tests__/fuiddatosreal.validator.test.ts` | Fechas, orden de fechas, números de documento, folios, tomo, catálogos, longitudes y versión |
| `validators/__tests__/modulosCaja.validator.test.ts` | Que la caja se pueda crear sin sus cuatro campos descriptivos, con el objeto del catálogo, y siga exigiendo lo que la identifica |
| `validators/__tests__/moduloscliente.validator.test.ts` | Lo mismo para el acta |
| `validators/__tests__/usuariosYAsignaciones.validator.test.ts` | Cédula, nombre, contraseña, perfiles, sede, asignaciones y rangos de caja |
| `validators/__tests__/espejos-frontend.test.ts` | Que los catálogos, los límites y la fecha mínima del frontend sigan coincidiendo con los del backend |
| `middlewares/__tests__/auth.test.ts` | Los cinco guardias con cada perfil, incluido el segundo perfil |
| `middlewares/__tests__/mayusculas.test.ts` | Recorte, colapso de espacios y exclusión de contraseñas |
| `middlewares/__tests__/errorHandler.test.ts` | Traducción de los códigos SQLSTATE |
| `middlewares/__tests__/paramId.test.ts` | Ids de ruta que no son enteros |
| `utils/__tests__/noDiligenciado.test.ts` | Qué cuenta como campo sin diligenciar y con qué valor se guarda |
| `utils/__tests__/roles.test.ts`, `updFormat.test.ts` | Perfiles de una cuenta; formato y relleno del UPD |
| `services/__tests__/fuid.service.test.ts` | Que lo vacío se guarde como `N/A` en las columnas de texto y como NULL en las demás |
| `services/__tests__/cicloCaja.service.test.ts` | El ciclo completo de la caja sobre PostgreSQL en memoria: apertura, cierre, fecha del último registro, cajas compartidas |
| `services/__tests__/seguimientoInventario.service.test.ts`, `controllers/__tests__/reportes.seguimiento.test.ts` | El XML del formato de seguimiento y las consultas del informe en dos jornadas reales |
| `services/__tests__/inventarioExcel.service.test.ts`, `plantillaFuid.service.test.ts` | El inventario en el formato F-PSD-001 |
| `services/__tests__/actualizacionDiaria.service.test.ts` | La cita de las 4:15 p. m. en hora de Colombia |
| `config/__tests__/traducirSql.test.ts`, `esquema.test.ts` | La traducción de `?` a `$n` y los ajustes de esquema al arrancar |

Frontend:

| Archivo | Qué comprueba |
| --- | --- |
| `components/ui/__tests__/*.test.tsx` | Button, Input, Textarea, Select, UpdInput, Table, ConfirmDialog y MenuDeAcciones: lo que ve y pulsa la persona, no las clases de CSS |
| `lib/__tests__/camposVacios.test.ts` | Qué campos cuentan como vacíos antes de enviar |
| `lib/__tests__/estadoCaja.test.ts` | Cómo se enseña el estado de una caja y el aviso de que viene de días anteriores |
| `lib/__tests__/fechas.test.ts`, `hace.test.ts` | Fechas en hora de Colombia y formato de 12 horas; "hace 5 minutos" |
| `lib/__tests__/navegacion.test.ts` | El botón de volver sube un nivel real |
| `lib/__tests__/queryInvalidation.test.ts` | Qué se queda viejo cuando cambia cada cosa |
| `lib/__tests__/useDescargaSeguimiento.test.ts` | Las etapas de la descarga del seguimiento y sus errores |

---

## Duplicación deliberada entre backend y frontend

Tres cosas están definidas dos veces a propósito:

| Qué | Backend (manda) | Frontend (copia) |
| --- | --- | --- |
| Catálogos cerrados | `config/constants.ts` | `lib/catalogos.ts` |
| Longitudes máximas | `config/constants.ts` | `lib/limites.ts` |
| Fecha mínima documental | `config/constants.ts` | `lib/validation.ts` |

No se comparten por `import` porque el backend compila con `rootDir: "src"`:
sacar esos archivos a una carpeta común cambiaría la ruta de `dist/server.js` y
con ella el arranque en producción. Para que la copia no se desincronice en
silencio, `espejos-frontend.test.ts` compara ambos lados y el CI falla si alguien
edita uno solo.
