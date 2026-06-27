# Issue Cause Memory Rule

This project requires learning from failures during development.

## When To Record

Record causes after:

- Test failures.
- TypeScript failures.
- ESLint failures.
- Prisma migration/client failures.
- Docker/PostgreSQL failures.
- Runtime route/application errors.
- Encoding or shell quoting mistakes.

## Format

Use this concise format in the main agent notes or final step summary:

```text
Failure:
Cause:
Fix:
Prevention:
```

## Examples From Current Scaffold

```text
Failure: Prisma migrate deploy returned an empty Schema engine error on Windows.
Cause: Prisma schema engine failed before creating _prisma_migrations, while the generated SQL itself was valid.
Fix: Applied the Prisma-generated migration SQL to the local dev PostgreSQL via psql and recorded the migration row for the dev database.
Prevention: For local dev only, verify migrate status afterward; do not use manual SQL for production/shared DBs.
```

```text
Failure: Seed script could not import password.js.
Cause: The script imported TypeScript source as compiled .js without a build step.
Fix: Made the dev seed script self-contained with its own scrypt hash helper.
Prevention: Local scripts should not import TS source via .js paths unless a build step exists.
```