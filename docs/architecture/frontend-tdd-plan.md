# Frontend TDD Plan

> Status: frontend implementation standard  
> Date: 2026-06-26  
> Applies to: `src/web/` implementation

---

## 1. TDD Principles

Frontend work follows the same red-green-refactor discipline as backend work.

Rules:

- Write one focused RED test before implementation.
- Confirm the RED failure is for the intended reason.
- Implement the smallest GREEN path.
- Refactor only after tests are green.
- Do not create many failing tests at once.
- When a test/tool/type issue occurs, record cause, fix, and prevention in the working notes.

Frontend tests should prefer user-observable behavior over implementation details.

Progress checkpoint (2026-06-26):

- Completed: Phase 0 scaffold baseline, Phase 1 API client contract, Phase 2 auth/route guard, Phase 3 lightweight design system, Phase 4 inventory vertical slice, Phase 5 orders vertical slice, Phase 6 delivery vertical slice, Phase 7 customer vertical slice, and Phase 8 audit vertical slice.
- Delivery hardening completed: delivery command schemas and delivery presenters are extracted, and command dialogs use shared Zod issue/error handling.
- Customer hardening completed: customer API boundary, permissions, list page, create/edit dialog, form schema, presenters, and form model helpers are extracted.
- Audit hardening completed: audit API boundary, manager-only page, filters, pagination, URL filter helpers, presenters, long-value truncation, and standard 403 error handling.
- E2E closeout completed: `npm run e2e:web:prepare` resets local dev DB and `npm run web:e2e` passes 8 Chromium Playwright tests.
- Latest verified frontend snapshot: `npm run web:test` passed with 24 files and 78 tests; `npm run web:e2e` passed with 8 tests; `npm run web:build`, `npm run typecheck`, and `npm run lint` passed.
- Latest backend regression snapshot: `npm test` passed with 73 files and 338 tests; `npm run test:coverage` passed with 89.45% statements; `npm run prisma:validate` passed.
- Next phase: strategy/export deferred surfaces, order document archive UI, or order create customer selector after product priority review.

---

## 2. Test Stack

Planned tools:

- Vitest for unit tests.
- Testing Library for React component/page tests.
- MSW or fetch mocks for API behavior.
- Playwright for E2E smoke once the app shell and backend dev server wiring exist.

Do not rely on visual snapshots as the primary correctness signal. Use semantic queries, roles, labels, text, and state.

---

## 3. Coding Order

### Phase 0: Frontend scaffold baseline

Goal:

- Add Vite React workspace under `src/web/`.
- Add test/build scripts.
- Add Tailwind/token baseline.

RED examples:

- App renders a named root landmark.
- CSS token file exposes required variables.

GREEN:

- Minimal app boot with no business pages.

Verification:

- `npm run web:test`
- `npm run web:build`
- `npm run typecheck`

### Phase 1: API client contract

Goal:

- Centralize envelope parsing, error parsing, auth header, query params, and command idempotency.

RED examples:

- Parses `{ data }` resource response.
- Parses `{ data, meta, links }` list response.
- Throws typed error for `{ error: { code, message, details, request_id } }`.
- Adds Bearer token when token exists.
- Adds `Idempotency-Key` for command requests.
- Does not add `Idempotency-Key` for GET queries.

GREEN:

- Minimal API client and command helper.

Verification:

- Focused API client tests.

### Phase 2: Auth and route guard

Goal:

- Login, session restore, logout, protected routes, and role-aware shell.

RED examples:

- Successful login stores token and calls `/me`.
- Failed login shows standard error.
- Existing token restores current user through `/me`.
- `401` from `/me` clears session and redirects to `/login`.
- Protected route redirects unauthenticated user.

GREEN:

- Minimal auth provider and route guard.

Verification:

- Auth tests and one shell render test.

### Phase 3: Lightweight design system

Goal:

- Build reusable core components before business pages.

RED examples:

- `Button` shows loading and disables duplicate submit.
- `IconButton` requires accessible label.
- `FormField` renders label, helper text, and field error.
- `DataTable` renders loading, empty, data rows, row actions, and pagination.
- `Dialog` traps initial focus and closes through explicit cancel/close.
- `StatusBadge` does not rely on color alone.

GREEN:

- Minimal components with LabOps Compact Console tokens.

Verification:

- Component tests.
- Accessibility checks where practical through Testing Library assertions.

### Phase 4: Inventory vertical slice

Goal:

- First business slice because it exercises list, filters, form validation, idempotency, decimal/quantity rules, and role visibility.

RED examples:

- Inventory list renders batch rows and pagination.
- Filters serialize to backend query shape.
- Create batch form validates `entry_date >= birth_date`.
- Submit create batch sends `Idempotency-Key`.
- Logistics user cannot see create batch action.
- Standard `422` shows field/form error and request id.

GREEN:

- Inventory list, availability panel, create batch dialog/drawer.

Verification:

- Inventory page integration tests.

### Phase 5: Orders vertical slice

Goal:

- Create order, list orders, command actions.

RED examples:

- Order list preserves filters in URL.
- Create order maps camelCase form values to snake_case DTO.
- Confirm order sends idempotency key and invalidates orders/delivery/inventory queries.
- Change price keeps money as decimal string.
- Logistics user cannot see order mutation actions.
- `409 conflict` shows refresh/review guidance.

GREEN:

- Order list, create order, command modals for confirm/change/cancel/settle.

Verification:

- Orders page integration tests.

### Phase 6: Delivery vertical slice

Goal:

- Delivery task list and shipment flow.

RED examples:

- Delivery task list renders status badges and row actions by role.
- Schedule delivery form validates required planned date.
- Stock deduction suggestions render as suggestions, not automatic facts.
- Confirm shipment requires user-confirmed `stock_deductions`.
- Sales user cannot confirm shipment or delivery.
- Flag sales action required sends reason and idempotency key.

GREEN:

- Delivery task list, detail drawer, schedule/ship/deliver/flag command modals.

Verification:

- Delivery page integration tests.

### Phase 7: Deferred surfaces

Goal:

- Add low-risk entries for audit, strategy, and export after core loop works.

RED examples:

- Manager can access audit nav, sales/logistics cannot.
- Sales/manager can see export entry, logistics cannot.
- Strategy route write actions only appear for manager.

GREEN:

- Minimal pages or reserved route entries, not full advanced UI.

---

## 4. E2E Smoke

E2E is active for the current frontend. It runs only against the local Docker dev PostgreSQL and may reset mock data.

Smoke path:

1. Login.
2. Create customer.
3. Create inventory batch.
4. Create order.
5. Confirm order.
6. Schedule delivery.
7. Open stock deduction suggestions.
8. Confirm shipment with explicit stock deductions.
9. Confirm delivery.
10. Settle order.
11. Query audit logs as manager.

Assertions:

- User lands in shell after login.
- Core status transitions are visible.
- Role-specific actions appear/disappear correctly.
- Errors show standard message and request id.
- Shipment flow submits actual `stock_deductions`, not raw suggestions.
- Settlement currently uses the backend archive-documents endpoint as an E2E prerequisite because the order document archive UI is deferred.

---

## 5. Accessibility And UX Gates

Each page/component must check:

- Visible labels for form fields.
- Keyboard reachable primary actions.
- Focus state visible.
- Loading state for async operations over 300ms.
- Disabled submit while mutation pending.
- Error message near field or form summary.
- Color is not the only status indicator.
- Table overflow handled on small screens.
- No horizontal page overflow at 375px.
- `prefers-reduced-motion` respected for transitions.

---

## 6. Verification Commands

Frontend implementation should add these scripts:

```bash
npm run web:test
npm run web:build
npm run web:e2e
npm run e2e:web:prepare
```

Existing project gates still apply:

```bash
npm test
npm run typecheck
npm run lint
```

After every frontend slice:

- Run focused frontend tests.
- Run `npm run typecheck`.
- Run `npm run web:build` once build tooling exists.

After every two slices:

- Run all frontend tests.
- Run root `npm test`, `npm run typecheck`, and `npm run lint`.

---

## 7. Done Criteria

A frontend slice is done only when:

- The first test was RED for the intended behavior.
- The implementation is GREEN.
- Query/mutation behavior respects [frontend-api-integration.md](./frontend-api-integration.md).
- UI respects [frontend-blueprint.md](./frontend-blueprint.md).
- Role visibility is centralized, not scattered.
- Money remains decimal string.
- Side-effect commands use `Idempotency-Key`.
- Standard backend errors are displayed correctly.
- No skipped tests were introduced.
