# UPD Consumption Validation Specification

## Purpose

Hard save-time validation: a record's UPD MUST belong to an active range of the saving user for the record's sub-module; a TECNICA without an active range is blocked (no manual fallback); consumption is atomic with the save and backed by a UNIQUE constraint.

## Requirements

### Requirement: Block save without an active range

The system MUST block a TECNICA user from saving a NEW record when no active range exists for that user and the record's sub-module, and MUST NOT offer a manual fallback.

#### Scenario: Technician without range blocked

- GIVEN a TECNICA user with no active range for the record's sub-module
- WHEN the user submits a new record
- THEN the system rejects the save with 4xx explaining the missing range and persists nothing

### Requirement: UPD must belong to the user's active range for the record's sub-module

The system MUST reject a save whose UPD is outside `[upd_inicio, upd_fin]` of an active range of the saving user for the record's sub-module. The record's sub-module MUST be derived from its caja; UPDs from ranges of a different sub-module MUST NOT pass. The validation MUST apply to both create and update flows.

#### Scenario: UPD outside the user's ranges rejected

- GIVEN the user's active range is `UPD2950001`–`UPD2950500` and the submitted UPD is `UPD2999999`
- WHEN the record is submitted
- THEN the system rejects with 4xx and persists nothing

#### Scenario: UPD from a different sub-module rejected

- GIVEN the submitted UPD is inside the user's active range for sub-module S1 but the record's caja maps to sub-module S2
- WHEN the record is submitted
- THEN the system rejects the save (sub-module mismatch)

#### Scenario: Validation applies to updates

- GIVEN a PUT request changes the record's UPD to a value outside the user's active ranges for the record's sub-module
- WHEN the update is submitted
- THEN the system rejects the update

### Requirement: Atomic consumption with uniqueness

The system MUST consume (mark finalized) the UPD atomically with the record save and MUST enforce a UNIQUE constraint on `fuiddatosreal.upd` as a concurrency backstop; when two saves claim the same UPD concurrently, exactly one succeeds.

#### Scenario: UPD consumed on save

- GIVEN the next-UPD endpoint returned `UPD2950002`
- WHEN the record with `UPD2950002` is saved successfully
- THEN `UPD2950002` is finalized and the next allocation skips it

#### Scenario: Concurrent duplicate claim

- GIVEN two technicians concurrently submit the same UPD value
- WHEN both saves are attempted in parallel
- THEN exactly one succeeds and the other fails with a duplicate/UNIQUE error
