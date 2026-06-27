# ADR-0005: Keep Delivery Strategy Suggestion-Only in MVP

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

The customer suggested setting strategies such as reaching a threshold to waive carton delivery fees, mainly to help sales discuss increasing order volume with customers. Automatically applying such rules would affect order totals, invoices, and reconciliation, and would compete with manual price changes and customer-specific agreements.

## Decision

In MVP, delivery strategy rules produce sales suggestions only. They do not automatically change order totals, create discounts, alter invoice amounts, or affect reconciliation.

## Alternatives Considered

### Alternative 1: Automatic pricing adjustment
- **Pros**: More automated and consistent fee handling.
- **Cons**: Requires precise fee rules, invoice alignment, and reconciliation behavior.
- **Why not**: The current requirement is sales communication support, not automatic accounting.

### Alternative 2: Logistics-only fee note
- **Pros**: Keeps commercial logic out of sales order creation.
- **Cons**: Does not help sales guide customers toward larger orders.
- **Why not**: The stated value is helping sales communicate add-on quantity or amount.

## Consequences

### Positive
- Sales receives useful nudges without accounting complexity.
- Order totals remain controlled by explicit prices and manual changes.
- Future automatic pricing can be added as a breaking behavioral decision if needed.

### Negative
- Staff must still decide manually whether a fee is waived.
- Suggestions may not always match final commercial treatment.

### Risks
- Users may assume suggestions affect price. Mitigation: API returns `impact: suggestion_only`, and UI copy should make this explicit.