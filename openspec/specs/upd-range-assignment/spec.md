# UPD Range Assignment Specification

## Purpose

Leaders (LIDER/ADMIN) assign physical UPD rolls to TECNICA technicians for a specific sub-module. Assignment validates UPD format, numeric ordering, used-UPD rejection, role, and duplication so every persisted range is clean, conflict-free, and traceable to the assigning leader.

## Requirements

### Requirement: Assign a UPD range

The system MUST allow a LIDER or ADMIN to assign a UPD range (`upd_inicio`, `upd_fin`) to a user with role `TECNICA` for a valid sub-module, recording `asignado_por` and assignment dates. Each boundary MUST match the format `UPD` followed by exactly 7 digits; `upd_inicio` MUST be less than or equal to `upd_fin`; the sub-module MUST exist; the assignee MUST have role `TECNICA`; the caller MUST have role `LIDER` or `ADMIN`.

#### Scenario: Happy path assignment

- GIVEN a LIDER, a valid sub-module, and a TECNICA user
- WHEN the LIDER assigns `UPD2950001`–`UPD2950500` for that sub-module
- THEN the system persists an active range row with `asignado_por` = LIDER

#### Scenario: Malformed UPD rejected

- GIVEN the LIDER submits `UP2950001` (wrong prefix) or `UPD295000` (6 digits)
- WHEN the assignment is submitted
- THEN the system rejects with 400 naming the format requirement and persists nothing

#### Scenario: Reversed boundaries rejected

- GIVEN `upd_inicio` = `UPD2950500` and `upd_fin` = `UPD2950001`
- WHEN the assignment is submitted
- THEN the system rejects with 400 (inicio > fin) and persists nothing

#### Scenario: Non-technician assignee rejected

- GIVEN the LIDER assigns a range to a CALIDAD user
- WHEN the assignment is submitted
- THEN the system rejects with 4xx and persists nothing

### Requirement: Reject ranges containing used UPDs

The system MUST reject an assignment outright — no partial acceptance — when ANY UPD inside `[upd_inicio, upd_fin]` already exists in `fuiddatosreal`; the leader MUST pick another roll.

#### Scenario: Range with used UPDs rejected

- GIVEN `UPD2950010` already exists in `fuiddatosreal`
- WHEN the LIDER assigns `UPD2950001`–`UPD2950500`
- THEN the system rejects with 4xx naming the conflicting UPD and persists nothing

#### Scenario: Used-UPD warning before confirmation

- GIVEN the assignment UI pre-checks the range against `fuiddatosreal`
- WHEN the check finds used UPDs inside the range
- THEN the UI warns the leader and blocks confirmation

### Requirement: Reject duplicate or overlapping active ranges

The system MUST reject a new active range that duplicates or overlaps an active range of the same technician and sub-module. Disjoint active ranges for the same technician and sub-module MUST be allowed.

#### Scenario: Exact duplicate rejected

- GIVEN an active range `UPD2950001`–`UPD2950500` for user X, sub-module S
- WHEN the LIDER submits the identical range again for X and S
- THEN the system rejects with 4xx and persists nothing

#### Scenario: Overlap rejected

- GIVEN an active range `UPD2950001`–`UPD2950500` for user X, sub-module S
- WHEN the LIDER submits `UPD2950400`–`UPD2950600` for X and S
- THEN the system rejects it as overlapping

#### Scenario: Disjoint second range allowed

- GIVEN an active range `UPD2950001`–`UPD2950500` for user X, sub-module S
- WHEN the LIDER submits `UPD2950501`–`UPD2951000` for X and S
- THEN the system persists both ranges as active

### Requirement: Revoke an active range

The system MUST allow a LIDER or ADMIN to revoke an active range; revoked ranges MUST NOT be used for next-UPD resolution or consumption validation.

#### Scenario: Revoked range excluded

- GIVEN an active range for user X is revoked by the LIDER
- WHEN the technician requests the next UPD
- THEN the revoked range is not considered (409 if no other range remains)
