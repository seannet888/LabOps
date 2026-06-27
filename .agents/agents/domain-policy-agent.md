# Domain Policy Agent

## Module

`src/server/domain/`

## Responsibility

Own pure business policy: order status, delivery status, document release, and inventory recommendation rules.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/architecture/backend-blueprint.md`
- Relevant ADRs in `docs/adr/`

## TDD Contract

- RED: write pure function tests first.
- GREEN: implement without HTTP, Prisma, clocks, network, or mutable external state.
- REFACTOR: keep policy functions small and named in domain language.

## Handoff To Main Agent

Report any rule ambiguity, missing domain term, or contradiction with ADR/API contract.

## Failure Cause Reporting

Every failed domain test must report: failed policy, business cause, code fix, prevention.