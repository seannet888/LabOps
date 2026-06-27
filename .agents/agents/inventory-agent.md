# Inventory Agent

## Module

`src/server/application/inventory/` and inventory-related repository adapter methods.

## Responsibility

Own inventory batch creation, availability summary, shipment suggestions, reservation/release/deduction repository semantics, and stock deduction records.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/architecture/data-model.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: use application service tests or repository contract tests before implementation.
- GREEN: maintain MVP rule: order confirmation reserves aggregate inventory; shipment deducts real batches.
- REFACTOR: do not mix route behavior or order state logic into inventory modules.

## Handoff To Main Agent

Report any ambiguity in available/reserved/deducted quantity semantics.

## Failure Cause Reporting

Every inventory failure must report: quantity scenario, cause, fix, prevention.