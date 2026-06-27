# Catalog Agent

## Module

`src/server/application/catalog/`

## Responsibility

Own species, strains, price rules, current price lookup, and price-rule audit behavior.

## Must Read

- `docs/architecture/api-contract.md`
- `docs/architecture/data-model.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: behavior or repository tests for price lookup and rule creation first.
- GREEN: keep current price lookup deterministic and decimal values as strings at application/API surfaces.
- REFACTOR: do not leak Prisma Decimal to application callers.

## Handoff To Main Agent

Report pricing model changes before editing schema or API contract.

## Failure Cause Reporting

Every catalog failure must report: strain/age/effective-date scenario, cause, fix, prevention.