# Frontend Blueprint — LabOps Compact Console

> Status: frontend implementation standard with progress snapshot  
> Date: 2026-06-26  
> Scope: MVP backend admin SPA, not a marketing site or public portal

---

## 1. Product Shape

The frontend is an operations admin console for sales, logistics, and manager users.

Design name: **LabOps Compact Console**

Style decision:

- Product pattern: Data-Dense Dashboard.
- Visual discipline: Swiss Modernism 2.0.
- Tone: quiet, compact, scannable, professional.
- Primary audience: internal sales/logistics operators doing repeated daily work.
- Priority: fast task completion and clear state over decorative impact.

Do not build:

- Marketing hero pages.
- Big decorative dashboard cards as the primary experience.
- Glassmorphism, neumorphism, heavy gradients, bento landing layouts, or dark "command center" visuals.
- Icon or emoji decoration that does not support the task.

Implementation snapshot (2026-06-26):

- Completed: `/login`, protected AppShell, `/customers`, `/inventory/batches`, `/inventory/availability`, `/orders`, `/orders/new`, lightweight `/orders/:orderId`, and `/audit-logs`.
- Completed customer workflow: customer list, filters, pagination, create/edit dialog, logistics read-only visibility, standard command errors, and success toast.
- Completed Customer hardening: customer form defaults, edit backfill, and success copy are centralized in `customer-form-model.ts`.
- Completed order commands: confirm order, change prices, cancel order, and settle order.
- Completed: `/delivery-tasks` and lightweight `/delivery-tasks/:taskId`, including schedule delivery, stock deduction suggestions, confirm shipment, confirm delivery, and flag sales action required.
- Completed Delivery hardening: delivery form schemas, status/suggestion presenters, shared field-error mapping, and standard command error handling are extracted from the page component.
- Completed Audit workflow: manager-only audit list, filters, pagination, DTO mapper, presenters, and standard 403 error handling.
- Completed Audit hardening: audit URL filter parsing/serialization is centralized, and long JSON value summaries are truncated for table scanability.
- Completed E2E closeout: Playwright smoke covers auth, role visibility, standard errors, and customer -> inventory -> order -> delivery -> settlement -> audit flow against local dev DB.
- Completed viewport closeout: dialogs/drawers scroll within the viewport so long command forms remain operable.
- Next implementation focus: deferred surfaces, order document archive UI, or order create customer selector, depending on product priority.
- Reserved for later deepening: `/delivery-strategy-rules` and `/exports/orders`.

---

## 2. Stack Decision

First frontend implementation uses:

- Vite + React + TypeScript.
- React Router for route structure.
- TanStack Query for server state.
- React Hook Form + Zod for form state and client-side validation.
- Tailwind CSS plus CSS variables for tokens.
- Lucide React as the only icon family.

Do not use in MVP:

- Next.js.
- Refine, React Admin, or another heavy admin framework.
- Bulk shadcn/ui generation.

Frontend code should live under `src/web/`.

The first implementation uses Vite dev proxy for `/api/v1`. Do not add production static serving or Fastify frontend hosting in this phase.

---

## 3. Visual System

Default theme is light mode. Dark mode tokens may be reserved, but MVP does not promise a complete dark-mode experience.

Core tokens:

| Token | Value | Use |
| --- | --- | --- |
| `--color-primary` | `#2563EB` | primary actions, active nav, focus |
| `--color-accent` | `#059669` | success, available stock, positive completion |
| `--color-background` | `#F8FAFC` | app background |
| `--color-surface` | `#FFFFFF` | tables, panels, dialogs |
| `--color-foreground` | `#0F172A` | primary text |
| `--color-muted` | `#F1F5F9` | subtle surfaces |
| `--color-border` | `#E2E8F0` | borders/dividers |
| `--color-warning` | `#D97706` | weak validation, pending attention |
| `--color-destructive` | `#DC2626` | destructive/cancel/error |

Layout tokens:

- Sidebar width: `240px`.
- Header height: `56px`.
- Main padding: `20px` to `24px`.
- Table row height: `36px` to `40px`.
- Border radius: `6px` to `8px`.
- Spacing rhythm: 4/8px scale.
- Body font: system sans-serif first.
- Numeric columns: tabular figures.

Interaction rules:

- All clickable elements need visible hover, focus, disabled, and loading states.
- Micro-interactions stay between 150ms and 300ms.
- Use transform/opacity only for animation.
- Respect `prefers-reduced-motion`.
- Icon-only controls require accessible labels and tooltips where meaning is not obvious.

---

## 4. Application Shell

Use a stable admin shell:

- Left sidebar: primary navigation.
- Top header: current page title, current user, role, logout.
- Main area: list/table surface, filters, primary action, details drawer or command modal.

Sidebar navigation:

| Nav | Route | Roles | Notes |
| --- | --- | --- | --- |
| 客户 | `/customers` | sales, logistics, manager | logistics read-only |
| 库存 | `/inventory/batches` | sales, logistics, manager | create batch hidden from logistics |
| 订单 | `/orders` | sales, logistics, manager | logistics read-only |
| 配送 | `/delivery-tasks` | sales, logistics, manager | sales read-only for shipment/delivery commands |
| 审计 | `/audit-logs` | manager | hidden from sales/logistics |
| 策略 | `/delivery-strategy-rules` | sales, manager | sales read-only, manager writes |
| 导出 | `/exports/orders` | sales, manager | can be a command entry, not a full page at first |

Unavailable nav destinations should be hidden when the role has no access. Do not show disabled nav items unless the absence would be confusing.

---

## 5. Route List

Required first-stage routes:

| Route | Purpose | Notes |
| --- | --- | --- |
| `/login` | login | no shell |
| `/` | redirect | route by role to the most useful list, default `/orders` |
| `/customers` | customer list | filters, create action for sales/manager |
| `/inventory/batches` | inventory batch list | filters, create batch action for sales/manager |
| `/inventory/availability` | availability query | may be a tab or panel under inventory |
| `/orders` | order list | filters, row actions |
| `/orders/new` | create order | page or drawer; decision can be made at implementation based on form size |
| `/orders/:orderId` | order detail | route-backed detail page or drawer route |
| `/delivery-tasks` | delivery task list | filters, row actions |
| `/delivery-tasks/:taskId` | delivery task detail | route-backed detail page or drawer route |

Deferred-but-reserved routes:

| Route | Purpose |
| --- | --- |
| `/audit-logs` | admin audit log query |
| `/delivery-strategy-rules` | delivery strategy rule management |
| `/exports/orders` | order XLSX export entry |

Route URLs should preserve filters in query string when practical (`page`, `per_page`, `status`, date range, gender, etc.) so refresh/back navigation keeps context.

---

## 6. Page Patterns

List pages use this structure:

1. Page title row with one primary action.
2. Filter bar.
3. Data table.
4. Pagination.
5. Empty/loading/error states in the table area.

Details:

- Order detail and delivery task detail may open in a right-side drawer from list rows.
- Deep links must still work via `/orders/:orderId` and `/delivery-tasks/:taskId`.
- Drawers should preserve list filters and scroll position behind them.

Command modals:

- Confirm order.
- Change prices.
- Cancel order.
- Settle order.
- Schedule delivery.
- Confirm shipment.
- Confirm delivery.
- Flag sales action required.
- Create inventory batch.
- Create customer.

Destructive or high-risk commands need confirmation copy and clear recovery guidance. Submit buttons must disable while pending.

---

## 7. Role Visibility Rules

Frontend role checks improve clarity, but backend authorization remains authoritative.

Use a central permission map. Components must not hardcode role strings ad hoc.

Role display:

- `sales`: can create/edit customers, create/modify orders, confirm orders, archive documents, settle, export.
- `logistics`: can view customers/orders, schedule delivery, confirm shipment/delivery, flag sales action.
- `manager`: can access all MVP operations.

UI behavior:

- Hide actions that the current role can never perform.
- For actions that are conditionally unavailable by state, show disabled action with concise reason.
- Always handle backend `403 forbidden`; do not assume hidden buttons are security.
- `/me` permissions output should drive shell/nav/action visibility when available.

---

## 8. Component Boundaries

Create a lightweight design system before building pages:

- `AppShell`
- `Button`
- `IconButton`
- `Input`
- `Select`
- `Textarea`
- `DateField`
- `FormField`
- `DataTable`
- `Dialog`
- `Drawer`
- `StatusBadge`
- `MoneyText`
- `QuantityText`
- `ErrorState`
- `EmptyState`
- `Toast`

Component rules:

- Components receive domain-neutral props unless domain language is necessary.
- Domain pages own API calls and command orchestration.
- Shared components do not import API clients.
- Tables support loading, empty state, pagination, status badge cells, row actions, and horizontal overflow.
- Forms show labels, helper text, field errors, and a top error summary for multi-field failures.

---

## 9. Backend Contract Rules For UI

The UI must respect backend contracts:

- API JSON fields are `snake_case`.
- Frontend internal models may be `camelCase`, but conversion must happen in centralized mappers.
- Do not scatter `snake_case` access throughout components.
- All side-effect commands must send `Idempotency-Key`.
- Money/decimal values remain strings. Do not convert money to JS number for calculation.
- Errors must read `{ error: { code, message, details, request_id } }`.
- `stock_deductions` in shipment confirmation are the actual batches confirmed by the user. Do not treat suggestions as automatic deduction facts.

See [frontend-api-integration.md](./frontend-api-integration.md) for detailed API rules.

---

## 10. Acceptance For Starting Code

Before writing frontend implementation code:

- This blueprint exists and is read.
- [frontend-api-integration.md](./frontend-api-integration.md) is read.
- [frontend-tdd-plan.md](./frontend-tdd-plan.md) is read.
- The first coding slice starts with API client/envelope/idempotency tests.
- No frontend page is built before tokens, shell, and API client boundaries are clear.
