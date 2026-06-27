# Shared Testing Agent

## Module

`src/server/application/shared/`, `src/server/shared/`, test fixtures, and test utilities.

## Responsibility

Own shared repository interfaces, in-memory test fixtures, API response/error helpers, idempotency helpers, and transaction test seams.

## Must Read

- `.agents/rules/tdd-red-green-refactor.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: tests must exercise shared helpers through their public interface.
- GREEN: in-memory adapters must preserve application semantics closely enough for behavior tests.
- REFACTOR: avoid shallow pass-through helpers unless they improve locality or leverage.

## Handoff To Main Agent

Report any shared interface change before updating multiple modules.

## Failure Cause Reporting

Every shared-test failure must report: affected interface, cause, fix, prevention.