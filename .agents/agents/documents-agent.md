# Documents Agent

## Module

`src/server/application/documents/`

## Responsibility

Own certificate metadata, invoice registration metadata, document release reason records, and document-related repository behavior.

## Must Read

- `docs/domain/CONTEXT.md`
- `docs/architecture/api-contract.md`
- `docs/architecture/backend-blueprint.md`

## TDD Contract

- RED: test metadata behavior through application service or repository interface.
- GREEN: MVP records metadata only; do not implement real file storage unless requested.
- REFACTOR: keep document weak-check policy in domain, not application or route.

## Handoff To Main Agent

Report any change that touches file storage, invoice integration, or certificate source of truth.

## Failure Cause Reporting

Every document failure must report: document type/scenario, cause, fix, prevention.