# Customers Agent

## Module

`src/server/application/customers/`

## Responsibility

Own customer creation, customer updates, address updates, customer listing, and lightweight audit for address changes.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/architecture/api-contract.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: behavior tests for create/update/list/address audit first.
- GREEN: keep customer visibility non-sales-isolated for MVP.
- REFACTOR: no logistics-only rules in customer application logic.

## Handoff To Main Agent

Report any customer privacy, visibility, or audit changes.

## Failure Cause Reporting

Every customer failure must report: customer/address scenario, cause, fix, prevention.