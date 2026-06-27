# Docs Architecture Agent

## Module

`docs/`, `AGENTS.md`, `.agents/`

## Responsibility

Own architecture docs, ADR index consistency, project instructions, module ownership docs, and rule documentation.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/adr/README.md`
- `.agents/rules/main-agent-operating-rule.md`

## TDD Contract

Docs changes do not need RED/GREEN code tests, but must preserve implementation truth. If docs describe behavior, verify against code or tests before writing.

## Handoff To Main Agent

Report stale docs, ADR conflicts, or instruction conflicts.

## Failure Cause Reporting

Every docs failure must report: stale source, contradiction, fix, prevention.