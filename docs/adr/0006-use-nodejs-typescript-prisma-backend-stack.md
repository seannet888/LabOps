# ADR-0006: Use Node.js/TypeScript with Prisma as the Backend Stack

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

`persistence-migration-policy.md` was written in detail around Prisma as the sole DDL owner, including schema-first migration workflow, transaction boundaries, and Prisma-specific anti-traps. Separately, an earlier draft note in `prd.md` §12.4 ("当前可做的事情") mentioned a FastAPI/Python + Alembic backend as a possible starting point. `backend-blueprint.md` deliberately stayed framework-agnostic, describing layering rules for either a Next.js/Node backend or a FastAPI/Python backend. This left the backend language/framework undecided in writing, while one document (persistence policy) already assumed Node + Prisma. The project is a small internal tool (≤10 concurrent users, no ML/data-science workload), with no technical requirement pulling toward Python.

## Decision

We use Node.js with TypeScript for the backend, and Prisma as the sole ORM/DDL owner, per `persistence-migration-policy.md`. `backend-blueprint.md`'s layering rules (route adapter / application service / domain policy / repository) apply using the Node/TypeScript directory structure it already describes. The FastAPI/Alembic mention in `prd.md` §12.4 is corrected to match this decision.

## Alternatives Considered

### Alternative 1: FastAPI/Python + SQLAlchemy + Alembic
- **Pros**: Familiar to teams with Python background; mature ORM/migration tooling.
- **Cons**: Diverges from the already-detailed Prisma migration policy, which would need a full rewrite; adds a second language if the frontend is TypeScript-based, increasing context-switching cost for a small team.
- **Why not**: No technical requirement (ML, data science, existing Python codebase) favors Python here, and switching now discards already-completed, detailed persistence design work.

### Alternative 2: Stay framework-agnostic indefinitely
- **Pros**: Defers the decision until scaffolding.
- **Cons**: `persistence-migration-policy.md` already hard-codes Prisma commands and anti-traps, so staying "agnostic" in writing while one document assumes Node is an inconsistency, not real flexibility. It also blocks writing a concrete scaffold plan.
- **Why not**: The decision is already implicit in existing documentation; making it explicit removes ambiguity before scaffolding starts.

## Consequences

### Positive
- Single language (TypeScript) across schema, backend, and DTO mapping; matches the "no raw Prisma entity in API responses" rule in `persistence-migration-policy.md` and `api-contract.md` naturally via generated Prisma types.
- No rewrite needed for `persistence-migration-policy.md`.
- `backend-blueprint.md`'s Next.js/Node directory layout becomes the only path, simplifying onboarding.

### Negative
- Locks out Python-specific libraries if a future need arises (not anticipated for this domain).

### Risks
- None significant for MVP scope. Mitigation if requirements change: a new ADR can supersede this one before any backend code is written, since no implementation exists yet.
