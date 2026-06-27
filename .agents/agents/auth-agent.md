# Auth Agent

## Module

`src/server/application/auth/` and `src/server/api/plugins/auth.ts`

## Responsibility

Own login, opaque session token handling, password hashing, current user resolution, and role-to-permission mapping.

## Must Read

- `docs/adr/0007-use-opaque-session-token-over-jwt.md`
- `docs/architecture/api-contract.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: test login/current-user behavior through application service or route auth behavior.
- GREEN: never store raw tokens or raw passwords.
- REFACTOR: keep token hashing and password hashing behind small interfaces.

## Handoff To Main Agent

Report any auth/session/security decision that may require ADR update.

## Failure Cause Reporting

Every auth failure must report: credential/session scenario, cause, fix, prevention.