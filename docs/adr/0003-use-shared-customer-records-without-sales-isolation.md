# ADR-0003: Use Shared Customer Records Without Sales Isolation

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

Early notes conflicted on whether sales users should be isolated from each other’s customers. The customer clarified that the current organization is medium-sized and needs sales staff to cover for each other during leave, illness, or temporary absence. Customer records also need geographic area information for logistics planning.

## Decision

Customer base records are shared: sales, logistics, and managers can view customer records. Sales and managers can edit customer records; logistics can read them. Responsibility is tracked through orders and audited actions, not through customer visibility restrictions.

## Alternatives Considered

### Alternative 1: Strict sales isolation
- **Pros**: Strong privacy and ownership boundaries.
- **Cons**: Prevents practical cover for absent sales staff and increases duplicate customer records.
- **Why not**: It conflicts with the customer's operational need for replacement coverage.

### Alternative 2: Manager-only shared customer view
- **Pros**: Keeps sales scoped while managers arbitrate coverage.
- **Cons**: Adds unnecessary coordination overhead for a medium-sized team.
- **Why not**: The customer prefers direct sales continuity.

## Consequences

### Positive
- Sales can quickly take over customer communication.
- Customer duplicates are less likely.
- Logistics can use customer address and geographic area data without asking sales.

### Negative
- Customer visibility is broader than the original isolation rule.
- Responsibility must be enforced through audit and process rather than access control.

### Risks
- Users may edit shared customer data carelessly. Mitigation: high-risk changes such as delivery address updates are covered by light audit.