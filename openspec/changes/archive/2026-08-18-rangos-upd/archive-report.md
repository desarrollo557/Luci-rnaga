# Archive Report — rangos-upd

**Change**: rangos-upd — UPD Range Assignment for Technicians
**Archived on**: 2026-08-18
**Archive path**: `openspec/changes/archive/2026-08-18-rangos-upd/`
**Artifact store mode**: hybrid (filesystem archive + Engram topic `sdd/rangos-upd/archive-report`)
**Verdict at close**: PASS — 13/13 requirements, 29/29 scenarios, 0 CRITICAL findings

## Final State (at close)

Facts below reflect the state of the change AT CLOSE (2026-08-18), per the Final-State Authority hierarchy (native review authority → persisted tasks artifact → orchestrator launch prompt → verify-report/apply-progress snapshots).

### Implementation — COMPLETE

- **19/19 implementation tasks marked `[x]`** in the persisted tasks artifact (`tasks.md`, Phases 1–5).
- **Task 5b added and completed** (endpoint `GET /api/rangos-upd` listing, closing the design gap for the 5.1 "Lista de rangos + Revocar" UI). Traceability note: the 5b row is not present in `tasks.md`; its completion is corroborated by `sdd/rangos-upd/apply-progress` (Engram #74, written post-apply) and by the verify-report coherence matrix (decision 6: "5 rutas + GET / listado"). This is a completed item absent from the task list, not a stale unchecked box — no reconciliation was required and the Task Completion Gate passes.
- **Phase 6 verification tasks (6.1–6.3) remain unchecked in `tasks.md`** but are the verify phase's own tasks, not implementation tasks; `verify-report.md` confirms they were executed (6.1 builds exit 0; 6.2 SQL smoke executed against the dev DB; 6.3 backstop applied and verified on the live DB).

### Verification — PASS (resolved CRITICAL)

- `verify-report.md` (2026-08-18): verdict **pass**, blockers 0, critical_findings 0, requirements 13/13, scenarios 29/29. Backend + frontend builds exit 0.
- The CRITICAL issue found at verification time (UNIQUE backstop `unique_upd` missing from the live DB, present only in `database/schema.sql`) was **resolved on 2026-08-18 with explicit user authorization**: 2 duplicate test rows (`id` 82039, 82040 — duplicate `UPD0000000`; row 82038 kept) were deleted and `ALTER TABLE fuiddatosreal ADD UNIQUE KEY unique_upd (upd)` was executed. Verified via `information_schema.statistics` (1 index) and `COUNT(*)` 81,268 = `COUNT(DISTINCT upd)` 81,265 + 3 NULL.
- Runtime HTTP was NOT exercised (backend/frontend services off by explicit user decision); compliance evidence is SQL + static code inspection.

### Operational warnings carried forward (NON-blocking, operational actions)

1. **2,012 `modulos_caja` rows have a broken caja→sub-module chain** (orphan `id_modulo_caja`; e.g. real-data caja `051C000456`). After `RANGOS_UPD_ENFORCE=true`, TECNICA saves in those cajas return 409 `CAJA_SIN_SUBMODULO` until leaders fix the mapping. (verify-report WARNING 2; design open question now confirmed with evidence.)
2. **`RANGOS_UPD_ENFORCE` stays `false`** in `backend/.env` / `.env.example` until leaders assign initial ranges for all active TECNICA + sub-module pairs — otherwise an empty `rangos_upd` blocks every TECNICA save (product decision 1). Flip is an operational step, not part of this change.
3. **Frontend chunk warning** `index-L73KYcRJ.js` 509 kB (>500 kB Vite limit) — pre-existing, not introduced by this change (verify-report SUGGESTION 2).

## Spec Sync (delta → main specs)

`openspec/specs/` was empty before this change (no prior main specs); all four delta specs are full specs and were copied mechanically (shell `Copy-Item`, never model Read→Write):

| Domain | Action | Requirements |
|--------|--------|--------------|
| `upd-range-assignment` | Created `openspec/specs/upd-range-assignment/spec.md` | 4 (assign, reject-used, reject-overlap, revoke) |
| `upd-next-allocation` | Created `openspec/specs/upd-next-allocation/spec.md` | 3 (next consecutivo, 409 exhausted/no-range, read-only field) |
| `upd-consumption-validation` | Created `openspec/specs/upd-consumption-validation/spec.md` | 3 (block no-range, membership, atomic+UNIQUE) |
| `upd-progress-reporting` | Created `openspec/specs/upd-progress-reporting/spec.md` | 3 (aggregation, percentage, scope) |

Total: 13 requirements — matches the 13/13 verified. No destructive merge occurred (config `rules.archive: warn before merging destructive deltas` — not triggered: all actions were creates of new specs).

## Mechanical Copy Evidence (verbatim `diff -r` output)

### Step 2 — Spec sync readback (each domain, source vs. `openspec/specs/{domain}`)

```
--- diff -r openspec/changes/rangos-upd/specs/upd-range-assignment openspec/specs/upd-range-assignment ---
(empty diff - OK)
--- diff -r openspec/changes/rangos-upd/specs/upd-next-allocation openspec/specs/upd-next-allocation ---
(empty diff - OK)
--- diff -r openspec/changes/rangos-upd/specs/upd-consumption-validation openspec/specs/upd-consumption-validation ---
(empty diff - OK)
--- diff -r openspec/changes/rangos-upd/specs/upd-progress-reporting openspec/specs/upd-progress-reporting ---
(empty diff - OK)
=== SYNC RESULT: PASS ===
```

### Step 3 — Archive move readback (pre-move recursive snapshot vs. archived folder)

```
=== ARCHIVE READBACK (diff -r snapshot vs archived) ===
(empty diff - OK)
=== ARCHIVE MOVE: PASS ===
```

Both readbacks are empty (no differences) — the only passing evidence. This `archive-report.md` is additive-only and was not present in the source snapshot, therefore excluded from the comparison.

## Archive Contents

```
openspec/changes/archive/2026-08-18-rangos-upd/
├── proposal.md
├── specs/
│   ├── upd-range-assignment/spec.md
│   ├── upd-next-allocation/spec.md
│   ├── upd-consumption-validation/spec.md
│   └── upd-progress-reporting/spec.md
├── design.md
├── tasks.md          (19/19 implementation tasks complete)
├── verify-report.md
└── archive-report.md (this file — additive)
```

- Active changes directory no longer contains `rangos-upd` (only `archive/` remains).
- No artifacts were deleted or modified; the archive is a consultable audit trail.

## Traceability

### Filesystem artifacts read (hybrid mode authoritative copies)
- `openspec/changes/rangos-upd/proposal.md`, `specs/{4 domains}/spec.md`, `design.md`, `tasks.md`, `verify-report.md`
- `openspec/config.yaml`

### Engram observations discovered (project `luci-rnaga`, topic `sdd/rangos-upd/*`)
| ID | Topic | Note |
|----|-------|------|
| #70 | `sdd/rangos-upd/proposal` | discovered via search |
| #71 | `sdd/rangos-upd/spec` | discovered via search |
| #72 | `sdd/rangos-upd/design` | discovered via search |
| #73 | `sdd/rangos-upd/tasks` | **read in full** — pre-apply snapshot (all boxes `[ ]`); superseded by filesystem `tasks.md` (19/19 `[x]`) |
| #74 | `sdd/rangos-upd/apply-progress` | **read in full** — corroborates task 5b (listado + revocación) and slice evidence |
| #81 | verify observation | **read in full** — confirms verify PASS after live-DB backstop application |
| #76–#79 | slice observations 2–5/5b | discovered via search |

### Review gate
`reviewGate` is structurally absent for this candidate (no review was ever started; no transaction/ledger/receipt/gate-context topics exist). Per the Native Review Receipt Gate, archive proceeds under ordinary repository policy.

## Repository Policy Notes

- **No commits, pushes, or PRs** were made by this phase (implementation working tree is intentionally uncommitted; the orchestrator assembles the 5 chained PRs after archive).
- `openspec/` is untracked in git; the archive move used plain `mv` (not `git mv`).
- Configuration: `openspec/config.yaml` — `rules.archive` contains only "Warn before merging destructive deltas" (not triggered); artifact store mode hybrid per orchestrator instructions.
