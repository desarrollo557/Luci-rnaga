# Tasks: UPD Range Assignment for Technicians (rangos-upd)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400–1,600 (10 new files, 11 modified) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 (stacked to main) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DDL + updFormat + types + env flag | PR 1 | `npm --prefix backend run typecheck` | `mysql.exe` SOURCE script; `SHOW TABLES LIKE 'rangos_upd'` | Drop table; revert 4 files |
| 2 | rangosUpd service/validator/controller/routes | PR 2 | backend typecheck + curl suite (assign/check/revoke/next/avance) | dev server :3000 + dev DB | Unmount router; delete 4 files |
| 3 | Consumption enforcement (createFuid/updateFuid) | PR 3 | backend typecheck + curl (409 SIN_RANGO, ER_DUP_ENTRY) | dev server + dev DB | Revert controller/validator; flag stays false |
| 4 | Frontend API + DatosPage fixed UPD | PR 4 | `npm --prefix frontend run typecheck` | Browser manual (states cargando/listo/sin_rango/agotado/error) | Revert api.ts/types.ts/DatosPage |
| 5 | RangosUpdPage + ProduccionPage + App/AppLayout | PR 5 | frontend typecheck | Browser manual (LIDER nav/guard) | Revert 4 frontend files |

## Phase 1: DB + Backend Foundation

- [x] 1.1 Create `database/rangos_upd.sql` — DDL + indexes per design (usuario_id, sub_modulo_id, upd_inicio/fin VARCHAR(10), estado ENUM, asignado_por, fechas; KEY idx_rangos_usuario_sub, idx_rangos_asignado_por; no FKs). Covers: range-assignment persist, next-allocation, progress-reporting. Verify: backend typecheck; DDL review.
- [x] 1.2 Apply DDL to local DB: `Get-Content database\rangos_upd.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root "-pSIAR/#2009//" fuiddatosluciernaga`. Verify: `SHOW TABLES LIKE 'rangos_upd'` returns a row.
- [x] 1.3 Create `backend/src/utils/updFormat.ts` — `normalizeUpd` (trim+upper), `isUpdValid` (`^UPD\d{7}$`), `toNumeric`, `formatUpd` (`'UPD'+LPAD(n,7,'0')`). Covers: assignment format, next-allocation ordering, consumption membership. Verify: backend typecheck; edge values via curl.
- [x] 1.4 Add `RangoUpd` + DTOs (`AssignRangeDto`, `NextUpdResult`, `AvanceRow`) to `backend/src/types/db.ts` + `backend/src/types/index.ts`. Verify: backend typecheck.
- [x] 1.5 Add `RANGOS_UPD_ENFORCE=false` to `backend/.env`; create `backend/.env.example` if missing (mirror `.env` keys). Verify: flag defaults false when unset.

## Phase 2: Backend rangos-upd Module

- [x] 2.1 Create `backend/src/services/rangosUpd.service.ts` — `resolveSubModuloByCaja` (broken chain → `CAJA_SIN_SUBMODULO`), `nextUpd` (oldest active range by fecha_asignacion,id; anti-join used; gap-walk; lazy `agotado` UPDATE; 409 `SIN_RANGO`/`AGOTADO`), `membershipCheck` (BETWEEN active range, user+sub-modulo), `findUsedInRange`, `hasOverlap`, `avanceRangosUpd` (COUNT(DISTINCT upd) finalized; % round 0-safe; exclude `revocado`; scope `asignado_por`; ADMIN=all). Covers: all 4 specs. Verify: backend typecheck; curl scenarios.
- [x] 2.2 Create `backend/src/validators/rangosUpd.validator.ts` — `assignRangeSchema`/`checkRangeSchema`: UPD regex + transform, `inicio <= fin` superRefine. Covers: assignment 400s. Verify: curl `UP2950001`/reversed → 400.
- [x] 2.3 Create `backend/src/controllers/rangosUpd.controller.ts` — assign (tx + `SELECT … FOR UPDATE`, used/overlap → 409 naming conflict, 201), check (used[]/overlap/errors), revoke (`:id`, 404 / 409 not active), next (409 code envelope), avance (403 non-LIDER/ADMIN). Verify: typecheck; curl happy/error paths.
- [x] 2.4 Create `backend/src/routes/rangosUpd.routes.ts` — 5 routes (`isAuthenticated`; assign/check/revoke/avance + `isLiderOrAdmin`; `validate`; `asyncHandler`); mount in `backend/src/routes/index.ts`. Verify: typecheck; each endpoint reachable.

## Phase 3: Consumption Enforcement

- [x] 3.1 `backend/src/validators/fuiddatosreal.validator.ts` — `upd` → `z.string().regex(/^UPD\d{7}$/).transform(trim+upper)` in `createFuidSchema` + `updateFuidSchema`. Verify: typecheck; curl lowercase/whitespace UPD normalized.
- [x] 3.2 `backend/src/controllers/fuiddatosreal.controller.ts` `createFuid` — TECNICA && `RANGOS_UPD_ENFORCE` → `membershipCheck(upd, caja, user)` → 409 `SIN_RANGO`/`CAJA_SIN_SUBMODULO`/`RANGO_INVALIDO`; replace pre-check + `INSERT … ON DUPLICATE KEY UPDATE` (line ~148) with plain INSERT in tx; catch `ER_DUP_ENTRY` → rollback → 409 `El UPD ya fue usado`. Covers: consumption-validation (block, membership, atomicity). Verify: curl no-range 409; duplicate claim exactly one 200.
- [x] 3.3 Remove `fuidOnDuplicateUpdate` import + helper from `backend/src/services/fuid.service.ts` if unused after 3.2. Verify: backend typecheck clean.
- [x] 3.4 `updateFuid` — gated: `caja` or `upd` changed && TECNICA && flag → membership against new values → 409. Covers: consumption-validation update scenario. Verify: curl PUT outside range → 409.

## Phase 4: Frontend API + DatosPage

- [x] 4.1 `frontend/src/lib/api.ts` + `frontend/src/types.ts` — `rangosUpdApi` (assign/check/revoke/next/avance) + types (`RangoUpd`, `NextUpdResponse`, `AvanceResponse`, error codes). Verify: frontend typecheck.
- [x] 4.2 `frontend/src/pages/DatosPage.tsx` — TECNICA: UPD readOnly prefilled from `next?caja=`, state machine `cargando|listo|sin_rango|agotado|error`, submit blocked on sin_rango/agotado; other roles keep editable. Covers: next-allocation read-only + exhaustion, consumption-validation UI. Verify: frontend typecheck; browser manual.

## Phase 5: Leader UI + Navigation

- [x] 5.1 Create `frontend/src/pages/RangosUpdPage.tsx` — TECNICA-by-sede, sub-módulos, pre-check via `/check` (warning + block confirm), assign, avance table (total/finalizadas/pendientes/%, 0-safe), lista de rangos (GET `/api/rangos-upd` con JOIN técnico/sub-módulo, filtro por estado, badge activo/agotado/revocado) con botón Revocar (ConfirmDialog → `POST /:id/revocar`, invalida list + avance). Covers: assignment pre-check, progress-reporting. Verify: frontend typecheck; LIDER manual flow.
- [x] 5.2 `frontend/src/App.tsx` — route `/rangos-upd` with LIDER/ADMIN guard (redirect others). Verify: typecheck; non-LIDER redirected.
- [x] 5.3 `frontend/src/components/layout/AppLayout.tsx` — nav item visible only for LIDER/ADMIN. Verify: typecheck; visual check.
- [x] 5.4 `frontend/src/pages/ProduccionPage.tsx` — avance card (LIDER only) from `/rangos-upd/avance`. Covers: progress-reporting. Verify: typecheck; manual.

## Phase 6: Verification

- [ ] 6.1 `npm --prefix backend run typecheck && npm --prefix frontend run typecheck` + builds per config (`npm --prefix backend run build && npm --prefix frontend run build`).
- [ ] 6.2 curl smoke: assign happy 201; used-UPD range 409; overlap 409; disjoint 2nd range 201; revoke 200 + excluded from next; next skips used; 409 AGOTADO/SIN_RANGO; avance math (8% / 460 / 0% no-div); TECNICA save blocked; concurrent duplicate → one success.
- [ ] 6.3 Confirm `unique_upd` UNIQUE backstop intact (schema.sql L140011); no dead imports; flag `false` until leaders assign ranges.
