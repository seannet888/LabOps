# ADR-0002: Separate Sales Orders from Delivery Tasks in MVP

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

The PRD started with a single order lifecycle, but later clarification established that logistics needs its own working surface to arrange vehicles, drivers, delivery batches, and route notes. Sales and logistics should be operationally separate in MVP, while still coordinating through status synchronization.

## Decision

An order confirmed by sales automatically creates an independent delivery task. Sales owns the order and commercial fields; logistics owns the delivery task and fulfillment fields. Delivery task shipment and delivery events synchronize order status.

## Alternatives Considered

### Alternative 1: Put logistics fields directly on orders
- **Pros**: Fewer tables and endpoints.
- **Cons**: Blurs ownership; logistics updates would touch the sales order object directly.
- **Why not**: The MVP explicitly separates sales and logistics responsibilities.

### Alternative 2: Full logistics subsystem with accepting/assigning tasks
- **Pros**: Clear responsibility assignment and scalable dispatch workflow.
- **Cons**: More workflow states and operational burden.
- **Why not**: MVP should not include logistics accepting/owner assignment; that is deferred to phase two.

## Consequences

### Positive
- Sales and logistics can evolve independently.
- Logistics has a dedicated task list and status model.
- Order status remains synchronized with fulfillment facts.

### Negative
- There is an additional object to create and keep consistent.
- Some UI screens must join order, customer, and delivery task data.

### Risks
- Status drift between order and delivery task. Mitigation: only delivery task commands may move order to `shipped` and `delivered`.