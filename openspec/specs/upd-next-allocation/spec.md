# Next UPD Allocation Specification

## Purpose

Resolve the next available (unused) UPD for a technician + sub-module from the oldest active range, feeding a fixed, read-only UPD field in the record form. Missing range or exhaustion returns HTTP 409.

## Requirements

### Requirement: Resolve the next UPD consecutively

The system MUST resolve the next UPD for a user and sub-module as the smallest unused UPD inside the OLDEST active range of that user for that sub-module, skipping UPD values already present in `fuiddatosreal`.

#### Scenario: Consecutive happy path

- GIVEN user X has one active range `UPD2950001`–`UPD2950500` for sub-module S and `UPD2950001` is used
- WHEN the next-UPD endpoint is called for X and S
- THEN the system returns `UPD2950002`

#### Scenario: Used values skipped

- GIVEN an active range `UPD2950001`–`UPD2950005` with `UPD2950002` and `UPD2950003` used
- WHEN the next-UPD endpoint is called
- THEN the system returns `UPD2950004`

#### Scenario: Oldest active range preferred

- GIVEN user X has two disjoint active ranges for sub-module S: `UPD2950001`–`UPD2950500` (older) and `UPD2950501`–`UPD2951000` (newer), with the older used through `UPD2950499`
- WHEN the next-UPD endpoint is called
- THEN the system returns `UPD2950500` from the older range, never from the newer

#### Scenario: Sub-module scoping

- GIVEN user X has an active range only for sub-module S1 and requests the next UPD for a record of sub-module S2
- WHEN the endpoint is called for S2
- THEN the system returns 409 and never returns UPDs from the S1 range

### Requirement: Missing or exhausted ranges return 409

The system MUST return HTTP 409 with a clear error when the user has no active range for the sub-module or when every UPD in all active ranges is used.

#### Scenario: Range exhausted

- GIVEN the only active range `UPD2950001`–`UPD2950500` is fully consumed
- WHEN the next-UPD endpoint is called
- THEN the system returns 409 (exhaustion) and the form stops the technician

#### Scenario: No active range

- GIVEN user X has no active range for sub-module S
- WHEN the next-UPD endpoint is called
- THEN the system returns 409 (no active range)

### Requirement: Read-only autocompleted UPD field

The record form MUST display the resolved UPD as a fixed, prefilled, read-only field; the technician MUST NOT edit or override it.

#### Scenario: Prefilled and read-only

- GIVEN the form loads for a technician with an active range and the endpoint returns `UPD2950002`
- WHEN the form renders
- THEN the UPD field shows `UPD2950002` and is not editable

#### Scenario: Exhaustion surfaces in the form

- GIVEN the range is exhausted while the technician is working
- WHEN the form refreshes the UPD
- THEN the UI shows the exhaustion state and blocks record saving
