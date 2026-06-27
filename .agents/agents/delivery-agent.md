# Delivery Agent

## Module

`src/server/application/delivery/`

## Responsibility

Own delivery scheduling, shipment confirmation, delivery confirmation, sales-action flagging, document weak-check orchestration, stock deduction orchestration, and delivery repository interactions.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/architecture/api-contract.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: use `DeliveryApplicationService` behavior tests first.
- GREEN: implement orchestration via repository interfaces and domain policies.
- REFACTOR: shipment and delivery multi-write commands must use `TransactionRunner` when available.

## Handoff To Main Agent

Report cross-module changes touching orders, inventory, documents, or audit logs.

## Failure Cause Reporting

Every delivery failure must report: task status, command, cause, fix, prevention.