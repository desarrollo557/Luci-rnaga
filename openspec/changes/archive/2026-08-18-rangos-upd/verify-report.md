```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c03d6f6e7d5c66cf9f1616a539486aa7f4b406adf03b4587247f2623a5a99422
verdict: pass
blockers: 0
critical_findings: 0
requirements: 13/13
scenarios: 29/29
test_command: n/a (no test runner; strict_tdd=false, runner=none en openspec/config.yaml)
test_exit_code: 0
test_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
build_command: npm --prefix backend run build && npm --prefix frontend run build
build_exit_code: 0
build_output_hash: sha256:5f42bd9c6075ba58c09397bc4062ec9da546bb71e2b4b6f96a7e737f97b4d0b1
```

## Verification Report

**Change**: rangos-upd
**Version**: N/A (delta specs sin versión)
**Mode**: Standard (strict_tdd=false, runner=none — verificado en `openspec/config.yaml`)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total (fases 1–5, implementación) | 19 |
| Tasks complete | 19 |
| Tasks incomplete | 0 |
| Fase 6 — 6.1 Builds | ✅ ejecutado |
| Fase 6 — 6.2 Smoke SQL | ✅ ejecutado (sin levantar servicios) |
| Fase 6 — 6.3 Backstop UNIQUE | ✅ aplicado y verificado en BD viva (resuelto) |

### Build & Tests Execution

**Build**: ✅ Passed (ambos, ejecutados dos veces con salida capturada)

```text
backend: npm --prefix backend run build (tsc)        → exit 0
frontend: npm --prefix frontend run build (tsc -b && vite build) → exit 0
  ✓ 1727 modules transformed. ✓ built in 10.37s
  (!) Some chunks are larger than 500 kB — index-L73KYcRJ.js 509.01 kB (gzip 151.28 kB)
```

- `build_output_hash: sha256:5f42bd9c6075ba58c09397bc4062ec9da546bb71e2b4b6f96a7e737f97b4d0b1` (salida combinada backend+frontend).

**Tests**: N/A — no hay test runner instalado (config: `strict_tdd: false`, `runner: none`, `coverage: false`). La estrategia de testing del design (tabla "Testing Strategy") define verify = typecheck + build + scripts SQL manuales contra la BD dev.

**Runtime HTTP**: ⚠️ **NO VERIFICADO en runtime** — los servicios backend/frontend están APAGADOS por decisión explícita del usuario. No se ejecutó ningún curl HTTP (assign 201/409s, revoke, next, avance, bloqueo de save TECNICA, duplicado concurrente). Todas las afirmaciones sobre endpoints se basan en inspección de código + validación SQL directa contra la BD.

**Coverage**: N/A (coverage_threshold 0, sin runner).

### Spec Compliance Matrix

Evidencia por capa: **SQL** = query del service ejecutada contra `fuiddatosluciernaga` (BD dev, la misma que usa el backend según `backend/.env` DB_NAME); **Estática** = inspección de código; **Runtime** = no disponible (servicios apagados). Cada escenario marcado COMPLIANT está verificado por SQL/estática; el runtime HTTP queda pendiente de la fase manual.

| Spec | Requirement | Escenarios | Resultado |
|------|-------------|-----------|-----------|
| upd-range-assignment | Asignar rango (LIDER/ADMIN, TECNICA, formato, orden) | 4 | ✅ COMPLIANT (SQL+Estática): INSERT validado en BD; regex `^UPD\d{7}$` + transform en `rangosUpd.validator.ts`; rol TECNICA y existencia de sub-módulo chequeados en controller |
| upd-range-assignment | Rechazar rangos con UPDs usados | 2 | ✅ COMPLIANT (SQL+Estática): `hasUsedUpds`/`findUsedUpds` validados contra datos reales (126 usados en UPD2950001–2950500); pre-check duro en RangosUpdPage (bloquea asignar) |
| upd-range-assignment | Rechazar duplicados/solapados; permitir disjuntos | 3 | ✅ COMPLIANT (SQL+Estática): overlap SELECT validado (solape=1 fila, disjunto=0 filas); tx + `SELECT … FOR UPDATE` en `assignRango` |
| upd-range-assignment | Revocar rango activo | 1 | ✅ COMPLIANT (SQL+Estática): UPDATE revocado validado; exclusiones por `estado` en next/membership/avance |
| upd-next-allocation | Resolver next UPD consecutivo (rango más antiguo, saltar usados) | 4 | ✅ COMPLIANT (SQL+Estática): anti-join validado (7 consecutivos 2950163–169); gap-walk + `ORDER BY fecha_asignacion, id` en `resolveNextUpd` |
| upd-next-allocation | 409 sin rango / agotado | 2 | ✅ COMPLIANT (Estática): `SIN_RANGO`/`AGOTADO`/`CAJA_SIN_SUBMODULO` en controller; `marcarAgotado` UPDATE idempotente validado en BD |
| upd-next-allocation | Campo UPD fijo read-only | 2 | ✅ COMPLIANT (Estática): `updState` cargando/listo/sin_rango/agotado/error; `readOnly` para TECNICA; submit bloqueado; hints de error |
| upd-consumption-validation | Bloquear save sin rango activo | 1 | ✅ COMPLIANT (Estática): `createFuid` TECNICA+flag → 409; sin fallback manual (frontend bloquea submit) |
| upd-consumption-validation | UPD ∈ rango activo user+sub-módulo (create y update) | 3 | ✅ COMPLIANT (SQL+Estática): `membershipCheck` validado (dentro=1, fuera=0); derivación sub-módulo validada (cadena OK y rota); `updateFuid` gated por cambio de caja/upd |
| upd-consumption-validation | Consumo atómico + UNIQUE backstop | 2 | ✅ COMPLIANT (SQL+Estática): "UPD consumed on save" COMPLIANT (SQL: INSERT plano + anti-join skip validado); "Concurrent duplicate claim" COMPLIANT tras aplicar `ALTER TABLE fuiddatosreal ADD UNIQUE KEY unique_upd (upd)` en BD viva + limpiar 3 filas duplicadas `UPD0000000` (autorizado por usuario, 2026-08-18) |
| upd-progress-reporting | Agregación por técnico (total/finalizadas) | 1 | ✅ COMPLIANT (SQL+Estática): avance SQL validado (total=500, finalizadas=126 con datos reales) |
| upd-progress-reporting | Porcentaje + pendientes (0-safe) | 2 | ✅ COMPLIANT (Estática+SQL): `Math.round(finalizadas/total)`, `max(0,…)`, guard total>0; 40/500=8% y 0/0=0 verificables por fórmula |
| upd-progress-reporting | Scoped al líder asignante; ADMIN ve todo | 2 | ✅ COMPLIANT (Estática): `asignado_por` filtro en service; `user.rol === 'ADMIN' ? undefined : user.id` en controller |

**Compliance summary**: 29/29 escenarios compliant. 13/13 requirements complete (el requisito "Atomic consumption with uniqueness" quedó cumplido al aplicar el backstop UNIQUE en BD viva).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Asignar rango | ✅ Implemented | tx + FOR UPDATE; 201/400/404/409 coherentes con design |
| Rechazar usados/solapados | ✅ Implemented | rechazo duro, sin aceptación parcial; pre-check UI bloquea |
| Revocar | ✅ Implemented | 404/409; excluido de next/membership/avance |
| Next UPD | ✅ Implemented | rango más antiguo; saltar usados; agotado lazy |
| 409 SIN_RANGO/AGOTADO/CAJA_SIN_SUBMODULO | ✅ Implemented | envelope `{error, code}` |
| Campo UPD fijo read-only | ✅ Implemented | state machine completa + bloqueo submit |
| Bloqueo save TECNICA | ✅ Implemented | gated por `RANGOS_UPD_ENFORCE==='true'` |
| Membresía create+update | ✅ Implemented | gating por cambio caja/upd (decisión 7 del design) |
| Consumo atómico | ✅ Implemented | código correcto (plain INSERT + catch 1062/ER_DUP_ENTRY) y backstop `unique_upd` aplicado en BD viva (ALTER TABLE 2026-08-18) |
| Avance | ✅ Implemented | total/finalizadas/pendientes/%, 0-safe, scope líder/ADMIN |

### Coherence (Design)

| Decisión | Seguida? | Notas |
|----------|----------|-------|
| 1 UPD format `^UPD\d{7}$` + transform | ✅ Yes | updFormat.ts + validators; 81.265/81.268 filas conforman (verificado en BD) |
| 2 Caja→sub-módulo vía cadena; 409 CAJA_SIN_SUBMODULO | ✅ Yes | cadena validada en BD; **2.012 filas modulos_caja con cadena rota** (design estimó 1.944 cajas) |
| 3 Esquema rangos_upd (sin FK/UNIQUE) | ✅ Yes | SHOW CREATE TABLE == DDL exacto (rangos_upd.sql) |
| 4 Next-UPD por gap-walk, agotado lazy | ✅ Yes | resolveNextUpd + marcarAgotado (UPDATE idempotente validado) |
| 5 Concurrencia: tx + FOR UPDATE + UNIQUE backstop | ✅ Yes | código ✅; `unique_upd` aplicado en BD viva (ALTER TABLE 2026-08-18, tras limpiar 3 duplicados `UPD0000000`) |
| 6 Endpoints en router propio montado en index.ts | ✅ Yes | 5 rutas + GET / listado; middlewares correctos |
| 7 Validación de save: membresía, TECNICA-only, update gated | ✅ Yes | createFuid/updateFuid; LIDER/ADMIN conservan UPD libre |
| 8 Frontend: DatosPage estados + RangosUpdPage + ruta/guard | ✅ Yes | App.tsx guard ['LIDER','ADMIN']; nav; card solo LIDER |
| 9 Avance en GET /rangos-upd/avance | ✅ Yes | COUNT(DISTINCT upd) no-revocados; % round 0-safe |

### Issues Found

**CRITICAL** (resuelto)

1. ~~`unique_upd` (UNIQUE sobre `fuiddatosreal.upd`) NO existe en la BD viva~~ **RESUELTO 2026-08-18**: se eliminaron 2 filas duplicadas de prueba (`id` 82039, 82040 — 3 filas idénticas `UPD0000000` de BABY UNIVERSE SAS, caja `015C000108`; se conservó la fila 82038) y se ejecutó `ALTER TABLE fuiddatosreal ADD UNIQUE KEY unique_upd (upd)` con autorización explícita del usuario. Verificado: `information_schema.statistics` → 1 índice `unique_upd`; `COUNT(*)` 81.268 = `COUNT(DISTINCT upd)` 81.265 + 3 NULL (los NULL no colisionan en MySQL UNIQUE). El requisito "Atomic consumption with uniqueness" y el escenario "Concurrent duplicate claim" quedan cumplidos: el catch `ER_DUP_ENTRY`→409 de `createFuid` ahora dispara para claims concurrentes, y el path libre (LIDER/ADMIN, flag-off) también queda protegido.

**WARNING**

1. **Ventana de regresión por ODKU removido sin backstop** — **RESUELTA** por la aplicación del `unique_upd` en BD viva (2026-08-18): el path libre (LIDER/ADMIN, TECNICA con flag off) ya no puede insertar UPDs duplicados; el duplicado devuelve 409 `UPD_YA_USADO`.
2. **Cadenas caja→sub-módulo rotas confirmadas en vivo**: 2.012 filas de `modulos_caja` tienen `id_modulo_caja` huérfano (LEFT JOIN sin match). La caja real con datos `051C000456` (FONDEARGOS, 126+ UPDs usados en su rango) NO resuelve sub-módulo → tras el flip, saves TECNICA en esas cajas devuelven 409 `CAJA_SIN_SUBMODULO`. Acción operativa documentada en design (open question) ahora confirmada con evidencia; debe resolverse antes del flip `RANGOS_UPD_ENFORCE=true`.

**SUGGESTION**

1. `assignRango` ejecuta `hasUsedUpds`/`findUsedUpds` con los helpers del pool (conexión NO transaccional) mientras el lock `SELECT … FOR UPDATE` está en la conexión tx: el chequeo de usados no queda serializado con el lock y un UPD consumido entre chequeo e INSERT deja un rango con UPD usado. Aceptable por semántica point-in-time del design, pero se puede mover el chequeo a `conn` para consistencia.
2. Build frontend: chunk `index-L73KYcRJ.js` 509 kB supera el límite de 500 kB de Vite (warning pre-existente, no introducido por este cambio). Evaluar code-splitting si molesta.
3. Considerar documentar en `database/rangos_upd.sql` o un script de migración el `ALTER TABLE … ADD UNIQUE KEY unique_upd` (con limpieza previa de duplicados) para que el backstop quede reproducible fuera del dump gigante. — **NOTA**: el `ALTER` ya se ejecutó en BD viva (2026-08-18); la documentación del script de migración queda como mejora de repo (el dump `schema.sql` ya lo contiene).

### Verdict

**PASS** — backstop `unique_upd` aplicado y verificado en BD viva `fuiddatosluciernaga` (limpieza de 2 filas duplicadas de prueba + `ALTER TABLE` con autorización del usuario, 2026-08-18). El requisito de consumo atómico (escenario "Concurrent duplicate claim") queda cumplido. Builds ✅, smoke SQL ✅, código coherente con el design. Warnings remanentes: cadenas caja→sub-módulo rotas (acción operativa pre-flip) y sugerencias no bloqueantes.

### Notas de ejecución (evidencia)

- **6.1**: `npm --prefix backend run build` exit 0; `npm --prefix frontend run build` exit 0 (2ª ejecución con logs capturados para hash).
- **6.2** (sin levantar servicios, mysql.exe contra `fuiddatosluciernaga`):
  - `SHOW CREATE TABLE rangos_upd` == DDL de `database/rangos_upd.sql` (columnas, ENUM, índices, collation) ✅
  - Tabla vacía al inicio (0 filas) → insert de prueba seguro.
  - INSERT real (usuario 4 TECNICA SALLY PINEDA, sub_modulo 3, UPD2950001–2950500, asignado_por 2 LIDER) → fila persistida ✅
  - `membershipCheck` SQL: dentro (UPD2950163)=1, fuera (UPD2950501)=0 ✅
  - `checkOverlap` SQL: solape=1, disjunto=0 ✅
  - `findUsedUpds` anti-join: 126 usados en rango; 2950163–169 consecutivos ✅
  - avance SQL: total=500, finalizadas=126 → pendientes 374, % 25 ✅
  - `marcarAgotado` UPDATE idempotente ✅; revoke condicionado ✅; avance excluye revocados ✅
  - **Limpieza**: `DELETE FROM rangos_upd WHERE id=1` → 0 filas restantes (BD devuelta a estado inicial) ✅
  - Cadenas: `051C000456` NO resuelve (huérfana); `015C000098`→sub_modulo 3 ✅; 2.846 cajas con cadena válida.
- **6.3**: `unique_upd` presente en `database/schema.sql` L140011 (dump) ✅ **y aplicado en BD viva** ✅ (information_schema=1, SHOW CREATE TABLE lo muestra; previamente ausente). Sin referencias muertas (`fuidOnDuplicateUpdate`/`ON DUPLICATE KEY` no existen en backend). Flag `RANGOS_UPD_ENFORCE=false` en `.env` y `.env.example` ✅.
- **Post-verify (2026-08-18, autorizado por usuario)**: `DELETE FROM fuiddatosreal WHERE id IN (82039, 82040)` (2 filas duplicadas `UPD0000000`, conservada la 82038); `ALTER TABLE fuiddatosreal ADD UNIQUE KEY unique_upd (upd)`; verificado `idx=1` en `information_schema.statistics`, `COUNT(*)` 81.268 = `COUNT(DISTINCT upd)` 81.265 + 3 NULL.