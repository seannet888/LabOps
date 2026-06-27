# Main Agent Operating Rule

This file is mandatory for the main agent before any coding work.

## Responsibilities

- Own the user goal, task sequence, and final decision record.
- Read `AGENTS.md`, `docs/domain/CONTEXT.md`, relevant ADRs, and the module agent file before changing code.
- Delegate mentally by module using `.agents/agents/*.md`; do not mix module responsibilities casually.
- Keep cross-module decisions in the main thread, not hidden inside one module.

## TDD Red-Green-Refactor

Every production code change must follow this rhythm:

1. RED: add or update one behavior test first and confirm it fails for the expected reason.
2. GREEN: implement the smallest change that makes that test pass.
3. REFACTOR: improve naming, locality, and duplication only while tests are green.

Do not batch many RED tests before implementation. Use vertical tracer bullets.

## Failure Cause Log

Whenever code, tests, typecheck, lint, Prisma, Docker, or DB setup fails, the main agent must record the cause in the working summary before moving on.

The record must include:

- Symptom: command or behavior that failed.
- Cause: why it failed, not just the error text.
- Fix: what changed to resolve it.
- Prevention: how future agents should avoid repeating it.

If the cause is not yet known, write `Cause: unknown yet` and continue diagnosis until it is known or explicitly blocked.

## Stop Rule

When the user asks for one step only, stop after that step. Do not automatically continue into planning or implementation of the next step.