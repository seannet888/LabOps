# TDD Rule

All modules in this project use TDD by default.

## Required Loop

- One behavior at a time.
- Write the test first.
- Run the target test and confirm RED.
- Implement the minimum GREEN change.
- Refactor only after GREEN.
- Run the focused test, then broader checks when the slice touches shared behavior.

## Test Surface

Prefer public interfaces:

- Domain policy public functions.
- Application service methods.
- Fastify route injection for HTTP behavior.
- Repository interface contract tests for adapters.
- Prisma smoke tests only for local/dev database verification.

Avoid tests coupled to private implementation details.

## Required Failure Notes

For every failed command, add a failure-cause note to the main agent working summary:

- RED expected: name the expected failure.
- RED unexpected: diagnose before implementing.
- GREEN failure: explain the implementation gap.
- Regression: explain why previous behavior broke.