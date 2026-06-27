# Orders Agent

## Module

`src/server/application/orders/`

## Responsibility

Own order intake, confirmation, price changes, cancellation, document archival state transition, settlement, idempotency behavior, and order repository interactions.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/architecture/api-contract.md`
- `docs/architecture/backend-blueprint.md`
- `.agents/rules/tdd-red-green-refactor.md`

## TDD Contract

- RED: use `OrderApplicationService` behavior tests first.
- GREEN: implement minimal orchestration through repository interfaces and domain policies.
- REFACTOR: multi-write commands must use `TransactionRunner` when available.

## Handoff To Main Agent

Report inventory, delivery, document, or audit cross-module impacts before changing shared interfaces.

## Failure Cause Reporting

Every order failure must report: command, state/input, cause, fix, prevention.