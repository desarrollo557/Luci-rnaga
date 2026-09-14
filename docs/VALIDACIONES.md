# Validaciones de Luciérnaga

Documento de referencia único del equipo: qué se valida, dónde y por qué.

**El backend es siempre la barrera real.** El frontend valida para avisar antes
de enviar, nunca como única defensa: quien llame directamente a la API se salta
todo lo que viva solo en React.

El orden en que se aplican las cosas a una petición es este:

```
express.json()
  → cuerpoEnMayusculas      recorta espacios y pasa a MAYÚSCULAS
  → idNumerico              rechaza ids de ruta que no sean enteros
  → validate(schema)        schema zod; responde 400 con { error, details[] }
  → controlador             reglas que necesitan consultar la base
  → MySQL                   UNIQUE y tipos de columna, último backstop
  → errorHandler            traduce los errores de MySQL a respuestas con sentido
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
| El UPD es obligatorio y tiene formato `UPD` + 7 dígitos | `fuiddatosreal.validator.ts` → `updField`, que además normaliza el valor | `UpdInput.tsx`; `validUpd()` en `lib/validation.ts` |
| El UPD no se puede repetir | Índice `unique_upd` en MySQL; `createFuid`/`updateFuid` traducen `ER_DUP_ENTRY` a 409 `UPD_YA_USADO` | `DatosPage.tsx` consulta `checkDuplicateUpd` mientras se escribe y avisa bajo el campo |
| Un técnico solo digita en las cajas que tiene asignadas | `createFuid` comprueba `asignacion_caja_tecnica` | La interfaz solo muestra sus cajas asignadas |
| Ninguna fecha puede ser anterior a 1920-01-01 ni posterior a hoy | `common.validator.ts` → `fechaDocumental()`, con `FECHA_MINIMA_DOCUMENTAL` y `fechaHoyLocal()` | `dateInRange()` en `lib/validation.ts`; `min`/`max` en los inputs de fecha |
| Una fecha debe existir en el calendario (no `2025-02-30`) | `common.validator.ts` → `esFechaReal()` | `esFechaReal()` en `lib/validation.ts` |
| `fecha_final` no puede ser anterior a `fecha_inicial` | `fuiddatosreal.validator.ts` → `ordenDeFechas` (superRefine) | `dateOrderValid()`; además `min` de Fecha Final toma el valor de Fecha Inicial |
| Lo anterior también en una edición que solo cambia una de las dos fechas | `updateFuid` llama a `validarOrdenDeFechasParcial()` con el registro guardado | — (el formulario siempre envía ambas) |
| `numero_doc_hasta` no puede ser menor que `numero_doc` | `fuiddatosreal.validator.ts` → `ordenDeNumerosDeDocumento`; compara con `BigInt` | — |
| `folios` es un entero ≥ 0, vacío o `N/A` | `fuiddatosreal.validator.ts` → `enteroNoNegativoOna` | `onlyDigits()` bajo el campo Folios |
| `tomo` admite `1/2` y `22 N 255`, pero no negativos ni puntuación de tecleo | `fuiddatosreal.validator.ts` → `referenciaDeTomo` | — |
| `soporte`, `frecuencia` y `otro` solo admiten valores del catálogo | `fuiddatosreal.validator.ts` → `catalogoCerrado`, con las listas de `config/constants.ts` | `Select` poblado desde `lib/catalogos.ts` |
| Ningún texto supera el tamaño de su columna | `textoOpcional()` con `LONGITUD_MAXIMA_FUID`; `errorHandler` traduce además el error 1406 de MySQL | `maxLength` en los inputs, desde `lib/limites.ts` |
| Todo texto se guarda sin espacios sobrantes y en MAYÚSCULAS | Middleware `cuerpoEnMayusculas` (usa `cleanUpper`) | `text-transform: uppercase` en `index.css`; interceptor de `lib/api.ts` |
| Un registro de un día anterior no se puede modificar | `updateFuid` compara `fecha_del_dato` con `fechaHoyLocal()` | — |
| Dos personas no pueden pisarse al editar el mismo registro | Columna `version`; `UPDATE … WHERE id = ? AND version = ?`; 409 `VERSION_DESACTUALIZADA` | `DatosPage.tsx` envía `editing.version` y muestra el aviso sin cerrar el formulario |
| Quién puede borrar un FUID | `deleteFuid`: ADMIN cualquiera, LIDER los de su sede, TECNICA solo los suyos del día, CALIDAD ninguno | La interfaz oculta el botón según el rol |
| Marcar OK solo en cajas asignadas | `marcarOk` comprueba la tabla de asignación del rol | — |

### Campos que aceptan `N/A`

`N/A` es el marcador de "campo no diligenciado", no un valor inválido: así están
los registros históricos y así los deja el diálogo de campos vacíos. Lo aceptan
`folios`, `tomo`, `soporte`, `frecuencia`, `otro`, `numero_doc` y
`numero_doc_hasta`. La lógica está en `esValorVacio()` (frontend) y `sinDato()`
(backend).

---

## Cliente (`sub_modulos`)

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| Código y entidad remitente obligatorios | `submodulos.validator.ts` | `ClientesPage.tsx` |
| El código no se repite dentro de la misma sede | Índice `uq_sub_modulos_codigo_sede`; `submodulos.controller.ts` responde 409 `CODIGO_CLIENTE_REPETIDO` | — |
| Un líder solo administra clientes de su sede | `jerarquia.service.ts` → `fueraDeSuSede()` | La lista solo muestra los de su sede |
| No se borra un cliente que tenga actas | `deleteSubModulo`; `ER_ROW_IS_REFERENCED_2` → 409 | Diálogo de confirmación |

---

## Acta (`moduloscliente`)

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| Código, entidad remitente y número de acta obligatorios | `moduloscliente.validator.ts` | `ActasPage.tsx` |
| `id_submodulo` es un entero positivo | `moduloscliente.validator.ts` | — |
| La fecha de transferencia cumple los límites documentales | `fechaDocumental()` | — |
| Un líder solo administra actas de su sede | `jerarquia.service.ts` | La lista solo muestra las de su sede |
| No se borra un acta que tenga cajas | `deleteModuloCliente` | Diálogo de confirmación |

---

## Caja (`modulos_caja`)

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| El número de caja tiene formato `000C000000` | `modulosCaja.validator.ts` | `validCaja()` en `lib/validation.ts` |
| El número de caja es único en toda la base | Índice `uq_modulos_caja_caja_modulo` (`database/caja_modulo_unica.sql`) → 409 | — |
| Estado solo `EN PROCESO` o `FINALIZADO` | `modulosCaja.validator.ts` → `z.enum` | `Select` con las dos opciones |
| Una serie no puede crear más de 500 cajas de una vez | `createCajasSerie` en `modulosCaja.controller.ts` | — |
| El rango de una serie no puede estar invertido | `createCajasSerie` | — |
| Ningún número del rango puede existir ya | `createCajasSerie`, dentro de la transacción | — |
| La fecha de transferencia cumple los límites documentales | `fechaDocumental()` | — |
| Borrar una caja arrastra sus FUID y asignaciones | `deleteModuloCaja`, en una transacción | Diálogo de confirmación |

---

## Usuarios y acceso

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| La cédula son solo dígitos (1 a 20) | `users.validator.ts` → `ccField`; `auth.validator.ts` en el login | `Login.tsx` y `AdminPage.tsx` |
| El nombre tiene al menos 3 caracteres | `users.validator.ts` | `AdminPage.tsx` |
| La contraseña tiene al menos 4 caracteres | `users.validator.ts` | `AdminPage.tsx` |
| El rol es uno de los cuatro definidos | `users.validator.ts` → `z.enum(ROLES)` | `Select` de roles |
| La sede es obligatoria | `users.validator.ts` | `lib/sedes.ts` |
| Una cuenta con la contraseña sin cifrar no entra | `auth.controller.ts` con `PERMITIR_PASSWORD_PLANO` (apagada por defecto) | — |
| Un usuario suspendido no entra | `auth.controller.ts` compara `suspendido_hasta` con `fechaHoyLocal()` | — |
| No se elimina el propio usuario ni el único administrador | `users.controller.ts` | La interfaz oculta el botón |
| Límite de intentos de login | `loginLimiter` en `app.ts` | — |
| Límite general de peticiones | `generalLimiter` en `app.ts` | — |

---

## Asignaciones

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| `modulo_id` y cada usuario son enteros positivos | `asignaciones.validator.ts` | — |
| Hay que asignar al menos un usuario | `asignaciones.validator.ts` | El formulario exige una selección |
| Los rangos de caja tienen formato `000C000000` | `asignaciones.validator.ts` → `cajaCodigo` | `validCaja()` |
| La asignación se hace solo por caja | `asignacionesCaja.controller.ts` (`asignacion_caja_tecnica` / `asignacion_caja_calidad`) | Formulario de caja en la vista de actas |
| El `n_orden` no se duplica al asignar | Transacción en `modulosCaja.controller.ts` | — |

---

## Reglas transversales

| Regla de negocio | Dónde se valida en backend | Dónde se valida en frontend |
| --- | --- | --- |
| Los ids de ruta son enteros positivos | Middleware `idNumerico` (`paramId.ts`) → 400 | — |
| El cuerpo de toda petición se normaliza | Middleware `cuerpoEnMayusculas` | Interceptor de `lib/api.ts` |
| Las contraseñas nunca se transforman | `CLAVES_SIN_MAYUSCULAS` en `mayusculas.ts` | Excluidas en el interceptor y en el CSS |
| Los errores de MySQL se traducen a mensajes en español | `errorHandler.ts`: 1062 → 409, 1406 → 400, 1452 → 409, 1451 → 409 | `toastApiError()` en `lib/feedback.ts` |

---

## Pruebas

`npm --prefix backend test` (Vitest). Cubren los validadores zod, el middleware
de normalización y el manejador de errores.

| Archivo | Qué comprueba |
| --- | --- |
| `validators/__tests__/fuiddatosreal.validator.test.ts` | Fechas, orden de fechas, números de documento, folios, tomo, catálogos, longitudes y versión |
| `validators/__tests__/espejos-frontend.test.ts` | Que los catálogos y las longitudes del frontend sigan coincidiendo con los del backend |
| `middlewares/__tests__/mayusculas.test.ts` | Recorte, colapso de espacios y exclusión de contraseñas |
| `middlewares/__tests__/errorHandler.test.ts` | Traducción de los errores de MySQL |

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

---

## Scripts de base de datos pendientes de aplicar

Ninguno se ejecuta solo. Requieren respaldo previo.

| Script | Qué hace | Antes de aplicarlo |
| --- | --- | --- |
| `database/caja_modulo_unica.sql` | Número de caja único | Falla si hay números repetidos; la consulta para encontrarlos está en el propio archivo |
| `database/submodulo_codigo_unico.sql` | Código de cliente único por sede | Falla si hay duplicados; incluye la consulta para revisarlos |
| `database/bloqueo_optimista.sql` | Añade la columna `version` a `fuiddatosreal` | Sin ella, el PUT de FUID no funciona: el `WHERE version = ?` no encuentra la columna |
| `scripts/normalizar-espacios-fuid.sql` | Limpia los espacios de los datos ya guardados | Trae verificación previa y posterior; se ejecuta dentro de una transacción |
