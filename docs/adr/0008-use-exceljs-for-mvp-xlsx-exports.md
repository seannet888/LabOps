# ADR-0008: Use ExcelJS for MVP XLSX Exports

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

The MVP needs synchronous `GET /api/v1/exports/orders.xlsx` downloads for order lists. The backend is Node.js/TypeScript, and the export should stay inside application/service code rather than introducing a separate reporting service.

## Decision

Use `exceljs` to generate XLSX workbooks for MVP exports.

## Alternatives Considered

### Alternative 1: CSV export only
- **Pros**: Smaller dependency surface and simpler implementation.
- **Cons**: Does not satisfy the `.xlsx` API contract.
- **Why not**: The contract explicitly exposes `orders.xlsx`.

### Alternative 2: Custom XLSX generation
- **Pros**: Maximum control over generated files.
- **Cons**: Reimplements a complex file format and increases maintenance risk.
- **Why not**: A proven library is safer for scaffold-level export support.

## Consequences

### Positive
- Keeps export generation local and testable.
- Supports workbook parsing in tests.
- Leaves room for formatting and additional sheets later.

### Negative
- Adds a dependency tree with transitive packages that require audit monitoring.
- Large exports may require streaming or async jobs in a later phase.

### Risks
- Dependency vulnerabilities may appear in transitive packages. Mitigation: run `npm audit` before release and upgrade/replace the library if HIGH or CRITICAL issues appear.
### 2026-06-25 audit note
- `npm audit --audit-level=moderate` reports 2 moderate vulnerabilities via `exceljs -> uuid <11.1.1`.
- The available automated fix requires `npm audit fix --force` and would install `exceljs@3.4.0`, a breaking dependency change.
- No HIGH or CRITICAL vulnerability is currently reported, so the MVP keeps `exceljs@4.4.0` and tracks this as a dependency-monitoring item rather than forcing a breaking downgrade.