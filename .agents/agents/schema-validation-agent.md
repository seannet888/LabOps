# Schema Validation Agent

## Module

`src/server/api/schemas/`

## Responsibility

Own Zod request schemas, decimal string validation, enum validation, and contract-level input errors.

## Must Read

- `docs/architecture/api-contract.md`
- Existing schema tests in `src/server/api/schemas/*.test.ts`

## TDD Contract

- RED: add invalid and valid payload tests first.
- GREEN: implement the smallest schema change.
- REFACTOR: keep shared validators in focused modules such as `decimal-string.ts`.

## Handoff To Main Agent

Report field naming drift or mismatch between docs and implementation.

## Failure Cause Reporting

Every validation failure must report: field, expected contract, observed behavior, fix.