# Base de datos

La base de Luciérnaga es PostgreSQL en Supabase. Lo que está vigente es la
carpeta `supabase/`; el resto de archivos de este directorio son de la época de
MySQL y se conservan como referencia.

## Lo vigente: `supabase/`

Scripts numerados en el orden en que se aplicaron, todos idempotentes. Qué hace
cada uno y cuándo se aplica está en [`docs/ENTORNOS.md`](../docs/ENTORNOS.md),
en la sección "La base de datos en Supabase". En resumen: `01` y `02` crean el
esquema y los triggers; `03` y `04` fueron correcciones de una sola vez; del
`05` al `08` los aplica el propio servidor al arrancar y quedan aquí como
referencia.

Para aplicar uno a mano hay dos caminos: pegarlo en el editor SQL de Supabase,
o desde `backend/` con la conexión del `.env`:

```bash
node scripts/migracion/aplicar-esquema.cjs                              # 01-esquema.sql
node scripts/migracion/aplicar-esquema.cjs ../database/supabase/02-triggers.sql
```

Los scripts de la migración (`backend/scripts/migracion/`) se usaron una vez, en
septiembre de 2026: `generar-esquema-pg.cjs` leyó el diccionario de datos de
MySQL y produjo `01-esquema.sql`, y `copiar-datos.cjs` volcó las filas. Se
guardan porque explican de dónde salió el esquema, no porque vayan a volver a
correr.

## Lo heredado de MySQL

Ninguno de estos archivos se usa ya. El backend no sabe conectarse a MySQL.

| Archivo | Qué era |
| --- | --- |
| `schema.sql` | Volcado de phpMyAdmin de enero de 2026. Traía los triggers truncados y no reflejaba la base real; por eso el esquema de Supabase se generó del diccionario de datos y no de aquí. |
| `timestamps_auditoria.sql`, `asignacion_upd.sql`, `inventario_auditoria_zoho.sql`, `triggers_y_auditoria.sql`, `indices_velocidad.sql`, `indices_dashboard.sql`, `suspension_usuario.sql`, `rangos_upd.sql`, `bloqueo_optimista.sql`, `caja_modulo_unica.sql`, `submodulo_codigo_unico.sql` | Migraciones incrementales sobre MySQL. Todo lo que aportaban está ya en `supabase/01-esquema.sql`, con una excepción: el índice único de código de cliente por sede (`submodulo_codigo_unico.sql`) no se trasladó, y hoy esa regla no se aplica. Está anotado en `docs/VALIDACIONES.md`. |
| `limpiar_bd.sql`, `limpiar_bd.ps1`, `reinstalar_bd.ps1` | Vaciaban o reinstalaban la base local de MySQL, con respaldo previo en `respaldos/`. |
| `seed_dev_users.sql` | Las cuentas de desarrollo con las que entra el panel rápido del login. Las semillas de demostración que lo acompañaban se retiraron: eran datos inventados y además escribían en tres tablas del perfil CALIDAD que ya no existen. |
| `respaldos/` | Ignorada por Git. Contiene los volcados de MySQL que hicieron los scripts de arriba antes de la migración. |

## Sobre los datos de ejemplo

El proyecto trabaja solo con información real. No hay semillas, ni datos de
demostración, ni cifras inventadas en ninguna parte: las estadísticas se
calculan sobre las tablas tal como están.

Hubo dos excepciones y las dos se retiraron. `backend/scripts/datos-ejemplo.cjs`
insertaba clientes ficticios con códigos `9xx`, y como el `.env` local apunta a
la misma base que producción, ejecutarlo por descuido los metía ahí.
`seed_demo.sql` y su reverso cargaban inventarios de demostración. Siguen en el
historial de Git por si alguna vez hicieran falta contra una base aparte, pero
no en el árbol: una herramienta que ensucia la base de trabajo con un comando
mal escrito no debe estar a mano.

Para probar el software con datos que se parezcan a los reales están las
pruebas, que levantan un PostgreSQL propio y crean lo suyo sin tocar nada:
`backend/src/__tests__/seguimiento.e2e.test.ts` recorre el flujo completo.
