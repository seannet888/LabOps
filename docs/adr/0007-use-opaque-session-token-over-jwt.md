# ADR-0007: Use an Opaque, Server-Side Session Token Instead of JWT

**Date**: 2026-06-25
**Status**: accepted
**Deciders**: Project owner, Codex

## Context

`api-contract.md` §6.1/6.2 already froze the auth *transport*: `POST /auth/login` returns `{ access_token, token_type: "Bearer", expires_in, user }`, and every other endpoint reads `Authorization: Bearer <token>`. The contract deliberately left the token's internal nature open by naming the field `"jwt_or_session_token"`. What remains undecided is whether that token is a self-contained JWT or an opaque token resolved against a server-side session store, and `AGENTS.md` §13 step 2 was blocked on this choice.

The project is a single internal backend (no third-party API consumers, no multi-service token verification need) serving ≤10 concurrent sales/logistics/manager users. A recurring business requirement already in `framework.md`/`AGENTS.md` is light-audit traceability and the ability for a manager to immediately cut a departing or suspended employee's access.

## Decision

Use an opaque session token: a random high-entropy string returned as `access_token`. The server stores only its hash in a new `sessions` table (`id`, `user_id`, `token_hash`, `created_at`, `expires_at`). Every authenticated request resolves the token by hashing it and looking up the session row; expired or missing sessions return `401 unauthorized` per `api-contract.md` §3.3. `GET /me`'s `permissions` array is derived from a static role→permission map keyed by the session's user role (see `framework.md` §8 权限矩阵), not stored per-session.

No JWT is used. No refresh-token flow exists in MVP; `expires_in` (2 hours) is enforced by the `sessions.expires_at` check, and a user simply logs in again after expiry — no separate logout endpoint exists in `api-contract.md` §18, so none is added.

## Alternatives Considered

### Alternative 1: Stateless JWT
- **Pros**: No DB lookup per request; standard library support.
- **Cons**: Revocation requires a denylist (defeats the statelessness benefit anyway); for ≤10 users the DB-lookup cost this avoids is not a real bottleneck.
- **Why not**: The project needs a manager to be able to immediately revoke a user's access (e.g. departing staff), which a stateless JWT cannot do without bolting on the same server-side state a session table already provides directly.

### Alternative 2: Cookie-based session (httpOnly + SameSite)
- **Pros**: Browser handles token storage/transport automatically; well-trodden CSRF mitigations exist.
- **Cons**: Contradicts the already-frozen `Authorization: Bearer <token>` transport in `api-contract.md` §6.2; would require reopening and editing a frozen contract section for no functional gain, plus adds CSRF-mitigation surface area (SameSite/CSRF token) that a bearer-header scheme doesn't need at all (browsers never auto-attach `Authorization` headers cross-origin).
- **Why not**: No reason to override the contract; bearer-header avoids CSRF by construction.

## Consequences

### Positive
- Matches `api-contract.md` exactly; no contract edit needed.
- Instant revocation (delete the `sessions` row) — fits the light-audit/manager-control theme already established.
- No CSRF mitigation needed (not cookie-based).
- Session row gives a natural place to add `last_seen_at` or device info later without a new ADR.

### Negative
- One DB round-trip per authenticated request (acceptable at ≤10 concurrent users; revisit if this becomes a real bottleneck, which is unlikely at this scale).
- Token must be generated with a CSPRNG and only its hash stored — implementation must not log or persist the raw token anywhere outside the login response.

### Risks
- None significant for MVP scope. Mitigation if requirements change (e.g. multi-service verification need emerges): a new ADR can introduce JWT alongside or instead of the session table before that need becomes real.
