# ADR-0001: Use REST v1 with Command Endpoints for Core Workflows

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

The system needs simple CRUD operations for customer records, prices, inventory batches, and documents, but it also has workflow actions with cross-module side effects: confirming an order reserves inventory and creates a delivery task; confirming shipment deducts inventory and syncs order status. A pure CRUD API would hide these business transitions behind generic updates and make boundary ownership unclear.

## Decision

We use `/api/v1` REST APIs. Basic records use resource CRUD endpoints, while core workflow transitions use command endpoints such as `POST /orders/{id}/confirm` and `POST /delivery-tasks/{id}/confirm-shipment`.

## Alternatives Considered

### Alternative 1: Pure CRUD REST
- **Pros**: Simple endpoint shape, familiar to implement.
- **Cons**: Cross-domain side effects become implicit `PATCH` behavior; state transitions are easier to misuse.
- **Why not**: Order confirmation and shipment are business commands, not ordinary field updates.

### Alternative 2: GraphQL
- **Pros**: Flexible client queries, fewer over-fetching concerns.
- **Cons**: More schema and resolver complexity than MVP needs; workflow command semantics still need explicit mutations.
- **Why not**: The project is an internal operations tool with clear resources and modest data volume.

## Consequences

### Positive
- Core workflow side effects are explicit and testable.
- REST resources remain easy for CRUD screens.
- API versioning is straightforward through `/api/v1`.

### Negative
- The API contains some verb-like action endpoints.
- Documentation must distinguish resource endpoints from command endpoints.

### Risks
- Command endpoints may grow too broad. Mitigation: each command must document reads, writes, events, failure handling, and audit behavior in `api-contract.md`.