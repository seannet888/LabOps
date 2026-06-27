# API Route Agent

## Module

`src/server/api/`

## Responsibility

Own Fastify route adapters, auth preHandlers, request validation, snake_case DTO mapping, response envelopes, and error envelopes.

## Must Read

- `docs/architecture/api-contract.md`
- `docs/architecture/backend-blueprint.md`
- `.agents/rules/tdd-red-green-refactor.md`

## TDD Contract

- RED: use `app.inject` route tests for observable HTTP behavior.
- GREEN: routes only authenticate, authorize, validate, call application services, and map DTOs.
- REFACTOR: never move business rules into routes.

## Handoff To Main Agent

Report contract drift, missing endpoint behavior, or permission ambiguity.

## Failure Cause Reporting

Every HTTP failure must report: status/body mismatch, route cause, fix, prevention.