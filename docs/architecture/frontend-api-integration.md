# Frontend API Integration Standard

> Status: frontend implementation standard  
> Date: 2026-06-26  
> Source of truth: [api-contract.md](./api-contract.md)

---

## 1. Integration Principles

Frontend code must treat the backend API contract as authoritative.

Rules:

- All HTTP requests go through one API client layer.
- Components must not call `fetch` directly.
- Components must not parse `{ data }`, `{ error }`, `meta`, or `links` manually.
- Components must not scatter `snake_case` DTO access.
- Side-effect commands must use the shared command helper so `Idempotency-Key` is always present.
- Backend `403`, `409`, and `422` responses are normal product states and need user-facing recovery messages.

Implemented shared boundary (2026-06-26):

- `src/web/lib/api-client.ts` owns resource/list envelope parsing, normalized list meta `{ page, perPage, total, totalPages }`, `buildQueryString()`, `ApiClientError`, and `commandRequest()`.
- `src/web/lib/form-errors.ts` owns `formatApiError()` and `zodIssuesToFieldErrors()`.
- Inventory, Orders, Delivery, Customers, and Audit feature modules already use explicit DTO mappers and shared request helpers.
- Orders, Delivery, Customers, and Audit have extracted feature-level form schemas or presenters so page components do not own contract validation or status/suggestion/value formatting.
- Customer form defaults/edit hydration/success copy are centralized in the customer feature boundary, not embedded in `CustomersPage`.
- Audit filter URL parsing/serialization and long JSON value summaries are centralized in the audit feature boundary, preserving scannable table cells.
- Playwright E2E now verifies auth, role visibility, standard errors, and the customer -> inventory -> order -> delivery -> settlement -> audit smoke against the real local API.
- Future feature modules must follow the same boundary and must not let React components read backend `snake_case` DTOs directly.

---

## 2. API Client Responsibilities

The API client owns:

- Base path `/api/v1`.
- `Authorization: Bearer <token>`.
- JSON request/response headers.
- Standard success envelope parsing.
- Standard error envelope parsing.
- Query string construction.
- Binary response handling for future XLSX export.
- Idempotency header injection for commands.

Success shapes:

```ts
type ResourceEnvelope<T> = {
  data: T;
};

type ListEnvelope<T> = {
  data: T[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  links: {
    self: string;
    next?: string;
    prev?: string;
  };
};
```

Error shape:

```ts
type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id: string;
  };
};
```

The API client should throw a typed `ApiClientError` containing `status`, `code`, `message`, `details`, and `requestId`.

---

## 3. DTO Mapping

Backend JSON uses `snake_case`. Frontend view models may use `camelCase`.

Required boundary:

```text
API DTO (snake_case)
  -> mapper
Frontend model/form value (camelCase)
  -> mapper
API command/query DTO (snake_case)
```

Rules:

- Mappers live in feature API modules, not React components.
- Components receive frontend models.
- Form submit handlers map form values to API DTOs before calling mutations.
- Tests must cover each non-trivial mapper.
- Do not use generic deep camelCase conversion for command payloads; use explicit mappers so contract drift is visible.

Example naming:

```text
src/web/features/orders/api/order.dto.ts
src/web/features/orders/api/order.mappers.ts
src/web/features/orders/api/order.api.ts
```

---

## 4. Idempotency-Key

All side-effect commands must send `Idempotency-Key`.

Frontend request categories that must be treated as side-effect commands include:

- Create customer.
- Update customer/address.
- Create inventory batch.
- Create order.
- Confirm/cancel/change/settle/archive order.
- Schedule delivery.
- Flag sales action required.
- Confirm shipment.
- Confirm delivery.
- Register invoice.
- Create/update delivery strategy rules.

Generation rule:

- Use `crypto.randomUUID()` in a shared command helper.
- Generate one key per submit attempt.
- Keep the same key for retrying the exact same payload after network uncertainty.
- Generate a new key if the user changes the payload.
- Disable submit buttons while the command is pending.

Suggested API:

```ts
commandRequest("/orders/{id}/confirm", {
  method: "POST",
  body,
  idempotencyKey
});
```

Do not let individual pages hand-write the header name.

Conflict behavior:

- Same key + same payload: backend may return the first saved result.
- Same key + different payload: backend returns `409 conflict`.
- UI should show a clear message and ask the user to refresh or resubmit after reviewing current state.

---

## 5. Decimal And Quantity Handling

Money and decimal fields are strings.

Rules:

- Do not use JS `number` for money calculation.
- Do not parse money strings for display unless using a decimal-safe formatter.
- `MoneyText` displays decimal strings as-is with currency label when needed.
- Form inputs for money keep string state and validate using the same decimal-string rule as backend contract.
- Quantity fields are integers and may use numeric input, but still validate before submit.

Examples:

- Good: `"28.00"` rendered by `MoneyText`.
- Bad: `Number("28.00") * quantity` in UI code.

---

## 6. Form Validation Alignment

Backend Zod contracts remain authoritative.

Frontend validation exists to:

- Reduce avoidable failed submissions.
- Show field-level guidance.
- Keep user input ergonomic.

Rules:

- Create one frontend schema per form/use case.
- Schema names should mirror backend command names where possible.
- Frontend schemas must not be looser than backend for required fields, enum values, dates, decimal strings, and integer quantities.
- Frontend may be stricter only for UI-specific ergonomics, not for business rules that backend owns.
- Always handle backend `422 validation_error` even if frontend validation passed.

Field error mapping:

- Field-level backend details should attach to the matching form field when possible.
- Unknown/global validation errors appear in a form-level `ErrorState`.
- Always display `request_id` for support/debugging.

---

## 7. Auth And Session

Login:

- `POST /api/v1/auth/login`.
- Store access token in browser storage selected during implementation.
- After login, request `/api/v1/me` to populate user and permissions.

Session restore:

- On app boot, if token exists, call `/api/v1/me`.
- If `/me` returns `401`, clear token and redirect to `/login`.
- If `/me` returns another error, show retryable app error state.

Logout:

- Clear token and query cache.
- Redirect to `/login`.

Security note:

- Do not log tokens.
- Do not place token in query string.
- Do not expose raw auth errors beyond standard error messaging.

---

## 8. Role And Permission Handling

Backend authorization remains authoritative. Frontend role checks are UX only.

Rules:

- Use `/me` permissions when available.
- Keep a central permission map for route/nav/action visibility.
- Hide actions the role can never perform.
- Disable state-dependent actions with a reason when the role can perform them in other states.
- Always handle `403 forbidden` from backend.

Role summary:

| Capability | sales | logistics | manager |
| --- | --- | --- | --- |
| View customers | yes | yes | yes |
| Create/update customers | yes | no | yes |
| View inventory | yes | yes | yes |
| Create inventory batch | yes | no | yes |
| Create/modify orders | yes | no | yes |
| Confirm shipment/delivery | no | yes | yes |
| Audit logs | no | no | yes |
| Export orders | yes | no | yes |
| Delivery strategy rules write | no | no | yes |

---

## 9. Shipment And Inventory Contract

Inventory model:

- `initial_qty` is original inbound stock.
- `reserved_qty` is current active reservation.
- `stock_deductions` is actual shipment deduction.
- `available_qty` is `initial_qty - reserved_qty - stock_deduction_sum`.

Shipment UI rule:

- Stock deduction suggestions are recommendations only.
- The user must confirm actual `stock_deductions`.
- Do not automatically submit suggestions as facts without user review.
- If the user edits suggested batches, submit the edited actual deductions.
- Show weak document validation warnings before shipment confirmation when backend returns/needs release reason.
- Delivery pages must display suggestions as editable starting points only; the submitted confirm-shipment payload is always the user's confirmed `stock_deductions`.

---

## 10. Query And Cache Policy

TanStack Query defaults:

- List queries key by route filters.
- Mutations invalidate affected lists and detail queries.
- Do not over-cache command results.
- Keep mutation retry disabled unless the command helper can reuse the same idempotency key for the same payload.

Suggested invalidation:

| Command | Invalidate |
| --- | --- |
| Create customer | customers |
| Create inventory batch | inventory batches, availability |
| Create/confirm/cancel/change/settle order | orders, order detail, delivery tasks, inventory availability |
| Schedule/flag/ship/deliver delivery task | delivery tasks, delivery detail, orders, inventory batches/availability |

---

## 11. Error UX

Standard mapping:

| HTTP/code | UI behavior |
| --- | --- |
| `401 unauthorized` | clear session, redirect to login |
| `403 forbidden` | show permission error; keep user on page |
| `409 conflict` | show state/idempotency conflict; offer refresh |
| `422 validation_error` | attach field errors or show form-level error |
| `500 internal_error` | show retryable error with `request_id` |

Every unexpected API error message must include:

- Human-readable message.
- Recovery action when available.
- `request_id`.

Do not show stack traces, SQL details, or raw response dumps.

---

## 12. Contract Checklist Before Coding A Feature

For each feature/page:

- Identify endpoint and role from `api-contract.md`.
- Define DTO types and explicit mappers.
- Define query keys and mutation invalidation.
- Define whether the request needs `Idempotency-Key`.
- Define money fields as strings.
- Define frontend Zod schema aligned with backend.
- Define UI behavior for 401/403/409/422.
- Confirm no component directly imports raw backend DTO unless it is a boundary component by design.
