# UPD Progress Reporting Specification

## Purpose

Leaders view per-technician progress for the ranges they assigned: finalized, pending ("por finalizar"), and percentage = finalized / total assigned.

## Requirements

### Requirement: Per-technician aggregation

The system MUST report, per technician, total assigned UPDs (sum of the sizes of that technician's ranges) and finalized UPDs (assigned UPDs present in `fuiddatosreal`). The report MAY be filtered by sub-module.

#### Scenario: Totals per technician

- GIVEN technician X has one active range of 500 UPDs and 40 of them exist in `fuiddatosreal`
- WHEN the leader requests the report
- THEN the report shows total = 500 and finalized = 40 for X

### Requirement: Percentage and pending count

The system MUST compute percentage = finalized / total assigned per technician and MUST expose pending ("por finalizar") = total assigned − finalized.

#### Scenario: Percentage and "por finalizar"

- GIVEN technician X has 500 assigned and 40 finalized
- WHEN the report is rendered
- THEN percentage = 8% and "por finalizar" = 460

#### Scenario: Technician with no assignments

- GIVEN a technician with no ranges assigned
- WHEN the report is rendered
- THEN the row shows total = 0, finalized = 0, percentage = 0 (no division error)

### Requirement: Scoped to the assigning leader

The system MUST include only ranges where `asignado_por` is the requesting LIDER; an ADMIN MAY view ranges from all leaders.

#### Scenario: Leader sees own assignments only

- GIVEN leader A assigned ranges to X and leader B also assigned ranges to X
- WHEN leader A requests the report
- THEN only A's ranges are counted for X

#### Scenario: Admin sees all leaders

- GIVEN an ADMIN requests the report
- THEN ranges from all leaders are included
