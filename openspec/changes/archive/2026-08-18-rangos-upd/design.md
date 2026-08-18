# Design: UPD Range Assignment for Technicians (rangos-upd)

## Technical Approach

Persist leader-assigned UPD rolls as rows in a new `rangos_upd` table. A record's sub-module is derived from its caja via the verified chain `fuiddatosreal.caja → modulos_caja.caja_modulo → modulos_caja.id_modulo_caja → moduloscliente.id → moduloscliente.id_submodulo → sub_modulos.id`. Next UPD is resolved by anti-join against `fuiddatosreal`; consumption is validated at save time for TECNICA inside the existing transaction, backed by the already-present `unique_upd` UNIQUE constraint (the current `ON DUPLICATE KEY UPDATE` in `createFuid` silently swallows duplicates and MUST be removed for the backstop to work). Frontend: DatosPage UPD becomes read-only fed by a next-UPD endpoint; a new leader page handles assignment; ProduccionPage gets a progress card.

## Architecture Decisions

| # | Problem | Decision | Alternatives rejected | Rationale |
|---|---|---|---|---|
| 1 | UPD format | `^UPD\d{7}$`, normalized trim+uppercase via zod `.transform()`; range bounds `VARCHAR(10)`; numeric order = lexicographic (fixed prefix + zero-padded) | Numeric-only storage; 6-digit prefix | Verified live: 81,265/81,268 rows conform (10 chars); 3 garbage rows are test data |
| 2 | Caja→sub-módulo | Chain above via `resolveSubModuloByCaja(caja)`; broken chain (1,944/4,766 distinct cajas have orphan `id_modulo_caja`) → 409 `CAJA_SIN_SUBMODULO` | Treat as "no range" | Distinct UX; leaders must fix mapping (ops note) |
| 3 | `rangos_upd` schema | DDL below; `estado ENUM('activo','agotado','revocado')`; **agotado marked lazily by next-upd** when a range has no unused value (idempotent UPDATE) | Purely lazy; eager on 409 | Keeps estado/report truthful without a consume hook |
| 4 | Next-UPD | Iterate active ranges `ORDER BY fecha_asignacion, id`; per range, load used numbers and walk from `inicio`; first gap wins (oldest preferred); exhausted → mark `agotado`, fall through; all exhausted → 409 `AGOTADO` | Single SQL gap query | Handles multi-range + legacy gaps; simple, testable |
| 5 | Concurrency | Save = tx: membership SELECT + plain INSERT; `unique_upd` is the backstop; catch `ER_DUP_ENTRY` → 409. Assignment = tx with `SELECT … FOR UPDATE` on the user's active rows to serialize overlap checks | `SELECT … FOR UPDATE` on range row at save | No allocation row to lock at save; UNIQUE resolves double-claim per spec |
| 6 | Endpoints | New `rangosUpd.routes.ts` mounted in `routes/index.ts`; controller + validator + service (shared derivation/resolution) | Inside `submodulos.routes.ts` | Keeps assignment-heavy router untouched; service reused by `fuiddatosreal.controller` |
| 7 | Save validation | **Membership** (UPD ∈ `[upd_inicio,upd_fin]` of an active range of user+sub-módulo), not "must equal next"; **TECNICA only**; LIDER/ADMIN keep legacy free UPD. `updateFuid`: validate only when `caja` or `upd` change (specs silent → explicit decision) | Strict "next value"; all roles; always validate on update | Specs say membership; leaders have no ranges (blocking them breaks legacy digitación); update-gating avoids deadlock editing legacy rows |
| 8 | Frontend | DatosPage: `updState` `cargando|listo|sin_rango|agotado|error`, readOnly UPD for TECNICA (editable for LIDER/ADMIN/CALIDAD). New `RangosUpdPage` `/rangos-upd` (LIDER/ADMIN, nav roles pattern) with TECNICA-by-sede, sub-módulos, pre-check, revoke, avance. ProduccionPage card only for LIDER | Embed in CajasPage | Assignment is per sub-módulo, not per caja — CajasPage is the wrong anchor |
| 9 | Reportes | `avanceRangosUpd` in `rangosUpd.controller` at `GET /rangos-upd/avance`; finalized via `COUNT(DISTINCT upd)` over non-revoked ranges; total = Σ numeric sizes; % = round(finalized/total), 0-safe | Extend `/estadisticas` | Range domain stays cohesive; scoping `asignado_por` per spec |

## Data Flow

```
Leader ──POST /rangos-upd──▶ rangosUpd.controller ──▶ rangosUpd.service
                                                          │ tx: used-check, overlap-check, INSERT
Tecnica ──GET /rangos-upd/next?caja──▶ service: deriveSubModulo → active ranges → gap-find → {upd}
Tecnica ──POST /fuiddatosreal──▶ createFuid ──▶ service.membershipCheck(upd, caja, user)
                                          └─ tx: check → plain INSERT → commit | ER_DUP_ENTRY → 409
```

## File Changes

| File | Action | Description |
|---|---|---|
| `database/rangos_upd.sql` | Create | DDL + indexes |
| `backend/src/utils/updFormat.ts` | Create | `normalizeUpd`, `isUpdValid`, numeric conversions |
| `backend/src/services/rangosUpd.service.ts` | Create | derivation, next-upd, membership, used/overlap checks, avance |
| `backend/src/controllers/rangosUpd.controller.ts` | Create | assign/check/revoke/next/avance |
| `backend/src/routes/rangosUpd.routes.ts` | Create | 5 routes (table below) |
| `backend/src/validators/rangosUpd.validator.ts` | Create | assign/check schemas with transform |
| `backend/src/types/db.ts`, `types/index.ts` | Modify | `RangoUpd`, DTOs |
| `backend/src/controllers/fuiddatosreal.controller.ts` | Modify | createFuid: TECNICA membership + plain INSERT + ER_DUP_ENTRY→409; updateFuid: gated validation |
| `backend/src/validators/fuiddatosreal.validator.ts` | Modify | `upd` regex + transform |
| `backend/src/routes/index.ts` | Modify | mount router |
| `frontend/src/lib/api.ts`, `types.ts` | Modify | `rangosUpdApi`, types |
| `frontend/src/pages/DatosPage.tsx` | Modify | fixed UPD + states |
| `frontend/src/pages/RangosUpdPage.tsx` | Create | assignment + avance |
| `frontend/src/pages/ProduccionPage.tsx`, `App.tsx`, `AppLayout.tsx` | Modify | avance card, route, nav |
| `backend/.env.example` | Modify | `RANGOS_UPD_ENFORCE` |

## Interfaces / Contracts

```sql
CREATE TABLE rangos_upd (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL, sub_modulo_id INT NOT NULL,
  upd_inicio VARCHAR(10) NOT NULL, upd_fin VARCHAR(10) NOT NULL,
  estado ENUM('activo','agotado','revocado') NOT NULL DEFAULT 'activo',
  asignado_por INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_agotado DATETIME NULL, fecha_revocacion DATETIME NULL,
  KEY idx_rangos_usuario_sub (usuario_id, sub_modulo_id, estado),
  KEY idx_rangos_asignado_por (asignado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- No FK constraints: matches schema convention (code-level referential checks).
-- No UNIQUE: multiple active ranges allowed; overlap rejected in code (tx + FOR UPDATE).
```

| Method | Route | Middleware | Request | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/rangos-upd` | `isAuthenticated,isLiderOrAdmin,validate(assignRangeSchema)` | `{usuario_id, sub_modulo_id, upd_inicio, upd_fin}` | 201 `{message, rango}` | 400 format/order/rol; 409 used/overlap |
| GET | `/api/rangos-upd/check` | `isAuthenticated,isLiderOrAdmin` | query: `usuario_id, sub_modulo_id, upd_inicio, upd_fin` | `{ok, used[], overlap, errors[]}` | 400 |
| POST | `/api/rangos-upd/:id/revocar` | `isAuthenticated,isLiderOrAdmin` | `{}` | 200 `{message}` | 404; 409 not active |
| GET | `/api/rangos-upd/next` | `isAuthenticated` | query: `caja` | 200 `{upd, sub_modulo_id}` | 409 `{error, code: SIN_RANGO\|AGOTADO\|CAJA_SIN_SUBMODULO}` |
| GET | `/api/rangos-upd/avance` | `isAuthenticated,isLiderOrAdmin` | query: `sub_modulo_id?` | `{por_tecnico:[{usuario_id, nombre, total_asignadas, finalizadas, pendientes, porcentaje}], filtro}` | 403 |

Key SQL (normalized bounds ⇒ string compare):

```sql
-- next-upd gap-find for one range
SELECT CAST(SUBSTRING(upd, 4) AS UNSIGNED) n FROM fuiddatosreal
WHERE upd BETWEEN ? AND ? AND LENGTH(upd) = 10 ORDER BY n;
-- walk from inicioNum skipping n; first gap → format 'UPD' + LPAD(n,7,'0'); none → mark agotado.

-- membership (save-time)
SELECT 1 FROM rangos_upd
WHERE usuario_id = ? AND sub_modulo_id = ? AND estado = 'activo'
  AND upd_inicio <= ? AND ? <= upd_fin LIMIT 1;

-- sub-module derivation
SELECT sm.id FROM modulos_caja mc
JOIN moduloscliente mcl ON mcl.id = mc.id_modulo_caja
JOIN sub_modulos sm ON sm.id = mcl.id_submodulo
WHERE mc.caja_modulo = ?;
```

`createFuid` (TECNICA): replace the `INSERT … ON DUPLICATE KEY UPDATE` with a plain INSERT inside the existing transaction; `catch` `ER_DUP_ENTRY` → rollback → 409 `{error:'El UPD ya fue usado'}`. `updateFuid`: when `body.caja !== registro.caja || body.upd !== registro.upd` and rol TECNICA, run the same membership flow against the new values.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Verify | typecheck + build (both apps) | `verify` commands from `openspec/config.yaml`; no test runner installed |
| Manual/DB | next-upd gap cases, 409s, avance math | SQL scripts + curl against dev DB |

## Threat Matrix

N/A — only Express HTTP routes are added; no shell command, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

1. Run `database/rangos_upd.sql` (new table only; no data migration). 2. Ship backend+frontend with `RANGOS_UPD_ENFORCE=false` (default); 3. Leaders assign initial ranges for all active TECNICA+sub-módulo pairs; 4. Flip `RANGOS_UPD_ENFORCE=true` — otherwise an empty `rangos_upd` blocks every TECNICA save on deploy (product decision 1). Rollback: drop table, revert feature commits via PR gates.

## Open Questions

- [ ] Ops action: 1,944 distinct cajas have broken caja→sub-módulo chains (orphan `id_modulo_caja`) — leaders should fix mapping; TECNICA saves there return `CAJA_SIN_SUBMODULO` until fixed.
- [ ] Confirm avance excludes `revocado` ranges (decided: exclude; `activo`+`agotado` count).