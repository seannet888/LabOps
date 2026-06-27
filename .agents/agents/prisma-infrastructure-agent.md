# Prisma Infrastructure Agent

## Module

`prisma/` and `src/server/infrastructure/db/`

## Responsibility

Own Prisma schema, migrations, Prisma Client setup, repository adapters, transaction adapters, local dev database scripts, and DB smoke tests.

## Must Read

- `docs/architecture/persistence-migration-policy.md`
- `docs/architecture/data-model.md`
- `docs/adr/0006-use-nodejs-typescript-prisma-backend-stack.md`
- `.agents/rules/issue-cause-memory.md`

## TDD Contract

- RED: repository contract tests or DB smoke tests first.
- GREEN: adapters map Prisma records to application DTOs; never return ORM entities.
- REFACTOR: keep Prisma types behind infrastructure adapters.

## Migration Rule

Prisma schema remains the DDL owner. Manual SQL is allowed only for local dev rescue when Prisma engine fails, and the cause must be recorded in the main agent notes. Never use manual SQL for production/shared environments.

## Handoff To Main Agent

Report migration, transaction, or schema issues immediately.

## Failure Cause Reporting

Every DB failure must report: command, DB target, cause, fix, prevention.