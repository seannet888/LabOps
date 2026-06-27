# ADR-0004: Use Aggregate Inventory Reservation and Confirmed Batch Deduction

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

Orders are created by sales using strain, age weeks, gender, and quantity. Binding order lines to specific inventory batches at confirmation would make sales entry heavier and create friction when actual warehouse picking differs from the initial plan. At the same time, shipment must update real stock accurately.

## Decision

Order confirmation reserves inventory by strain, age weeks, gender, and quantity, while keeping the sales-facing order line free of concrete batch details. The implementation records internal reservation allocations so cancellation and shipment finalization can release the exact reserved quantities safely.

Specific inventory batches are still selected at shipment time: the system recommends batches using aging/FIFO logic, and logistics confirms or adjusts the actual batch deductions before stock is actually reduced.

Inventory quantity semantics:

- `inventory_batches.initial_qty` is the original inbound quantity and is not decremented on shipment.
- `inventory_batches.reserved_qty` is the current active reservation quantity.
- `stock_deductions` is the source of truth for actual shipment deductions.
- `reservation_allocations` is an internal reservation ledger and is deleted when the reservation is cancelled or finalized.
- Available quantity is calculated as `initial_qty - reserved_qty - stock_deduction_sum`.

## Alternatives Considered

### Alternative 1: Bind batches during order confirmation
- **Pros**: High precision early in the workflow.
- **Cons**: Sales must know batch details and changes require rework.
- **Why not**: It overloads the sales workflow with warehouse detail.

### Alternative 2: Fully automatic batch deduction at shipment
- **Pros**: Fastest logistics operation.
- **Cons**: Inventory can drift if physical picking differs from the automatic choice.
- **Why not**: Logistics should confirm the actual batches leaving the facility.

## Consequences

### Positive
- Sales order entry stays lightweight.
- Logistics can align system deductions with physical picking.
- Aging/FIFO recommendation helps reduce old stock without forcing blind automation.
- Reservation release is deterministic because the system tracks the batches used for the internal reservation.

### Negative
- Shipment requires one extra confirmation step.
- The data model needs both a `stock_deductions` record linking delivery task, order item, and inventory batch, and a `reservation_allocations` ledger for active reservations.

### Risks
- Logistics may find batch confirmation burdensome. Mitigation: keep this marked as an MVP validation point and simplify if field use proves too heavy.
