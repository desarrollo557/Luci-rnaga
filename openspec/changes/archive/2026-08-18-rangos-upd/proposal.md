# Proposal: UPD Range Assignment for Technicians (rangos-upd)

## Intent

Technicians type the UPD by hand in "Nuevo Registro FUID", risking typos, duplicates and out-of-sequence stickers. Leaders assign physical UPD rolls (`UPD2950001`–`UPD2950500`) but the system cannot track, restrict or report on consumption. This change makes UPD assignment explicit: persisted ranges per technician + sub-module, fixed autocompleted UPD, hard consumption validation and leader progress reporting.

## Scope

### In Scope
- New `rangos_upd` table (usuario, sub_modulo, upd_inicio/fin, estado, asignado_por, fechas).
- Assign-range endpoint that REJECTS the range when any UPD inside is already used (leader must pick another roll; hard refusal, no partial accept).
- Next-available-UPD endpoint (skips already-used consecutives; 409 on exhaustion). Multiple active ranges per user+sub-module allowed; resolution takes next free UPD from the oldest active range.
- Hard save-time validation: technician without an active range for the record's sub-module is BLOCKED from saving new records (no manual fallback); UPD must belong to an active range of the user for the record's sub-module.
- Fixed, read-only autocompleted UPD field in DatosPage.
- Leader progress view/report: finalized vs pending per technician, percentage = finalized / total assigned per technician ("por finalizar").

### Out of Scope
- Backfilling legacy manually-typed UPDs into ranges.
- Editing/deleting ranges beyond revoke.
- Changing caja-range logic (`assignCajaCalidadRango`).
- Rollo/inventario integration.

## Capabilities

### New Capabilities
- `upd-range-assignment`: assign/revoke UPD ranges per user+sub-module with used-UPD warnings.
- `upd-next-allocation`: resolve next available UPD for a user+sub-module.
- `upd-consumption-validation`: hard save-time validation of UPD against assigned ranges.
- `upd-progress-reporting`: leader report of finalized/pending/percentage per technician.

### Modified Capabilities
None (no existing specs).

## Approach

Persist ranges as rows (unlike `assignCajaCalidadRango`, which expands to individual rows). Next-UPD resolution queries `fuiddatosreal` for used values inside the range and returns the smallest unused consecutive; consumption is atomic on save (transaction + UNIQUE `unique_upd` backstop). Multiple active ranges per user+sub-module are allowed; resolution prefers the oldest range. Sub-module derived from record's caja via `modulos_caja` hierarchy. UI reuses `SeccionAsignacionCaja` patterns; DatosPage UPD becomes read-only fed by the next-UPD endpoint.

## Product Decisions (confirmed with user)

1. Technician without an active range for the sub-module: **blocked from saving** new records (no manual fallback).
2. Range containing already-used UPDs: **rejected outright** — leader must assign a different roll; no partial accept.
3. Multiple active ranges per technician + sub-module: **allowed**; next-UPD resolves from the oldest active range.
4. "Por finalizar" percentage: **finalized / total assigned per technician**.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/controllers/rangosUpd.controller.ts` | New | assign/next/progress endpoints |
| `backend/src/controllers/reportes.controller.ts` | Modified | leader progress + "por finalizar" |
| fuiddatosreal POST/PUT controller | Modified | consumption validation |
| `backend/src/routes/submodulos.routes.ts` | Modified | range routes (`isLiderOrAdmin`) |
| `backend/src/validators` | New/Mod | range + fixed-UPD schemas |
| `frontend/src/pages/DatosPage.tsx` | Modified | fixed autocompleted UPD |
| `frontend/src/pages/CajasPage.tsx` | Modified | leader assignment UI |
| `frontend/src/pages/ProduccionPage.tsx` | Modified | "por finalizar" KPI |
| `frontend/src/lib/api` | Modified | rangosUpd API client |
| DB `fuiddatosluciernaga` | New | `rangos_upd` table + indexes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Concurrent next-UPD races | Med | Transactional consume + UNIQUE backstop |
| Caja→sub-module mapping ambiguity | Med | Validate mapping during design phase |
| No-range technicians blocked on save | Med | Explicit product decision (question round) |
| Range exhaustion mid-session | Med | 409 + clear UI state |

## Rollback Plan

Revert feature-branch commits via PR gates (develop→production→main). DB: `DROP TABLE rangos_upd` (or keep inert). Backend: revert controllers/routes/validators. Frontend: revert DatosPage UPD to editable and remove new UI sections. No destructive migration on existing data.

## Dependencies

- MySQL 8 (new table only). No external packages.

## Success Criteria

- [ ] Leader assignment shows used-UPD warning before confirmation.
- [ ] Technician form: UPD prefilled, read-only, consecutive, stops at range end.
- [ ] Save with UPD outside the user's range/sub-module is blocked.
- [ ] Leader report shows per-technician finalized/pending/percentage.
- [ ] Backend + frontend typechecks pass.