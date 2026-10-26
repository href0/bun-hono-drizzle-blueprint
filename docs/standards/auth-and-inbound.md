# Authentication, Authorization & Inbound Channels

Read this file when: adding a route (who may call it?), a role check, a public route, an endpoint of an inbound channel or a vendor webhook. Frontend-facing guide: [docs/auth-guide.md](../auth-guide.md).
<!-- partner:start -->

Partner-facing guide: [docs/partner-integration-guide.md](../partner-integration-guide.md). The partner gateway (§3, §4) is optional: `bun run setup --no-partner` removes it ([project-setup.md](project-setup.md)).
<!-- partner:end -->

---

## 1. Inbound channels

| Caller | Files | Mounted under | Authenticated by | Helpers allowed | Actor |
|---|---|---|---|---|---|
| Users (FE, mobile) | `<module>.<role>.ts` | `<API_BASE_PATH>/v1/<module>` | `authenticate()` — JWT Bearer | `requireRole`, `requireSelfOrRole`, `currentUser` | `user:<id>` |
| Partner systems | `<module>.partner.<role>.ts` | `<API_BASE_PATH>/v1/partner/...` | `partnerAuth()` — signing v1 | `currentPartner`, `requirePartner` | `partner:<code>` | <!-- partner -->
| Vendor webhooks | `<module>.webhook.<role>.ts` | `<API_BASE_PATH>/webhooks/<vendor>` (outside `/v1`) | `webhookAuth()` — the vendor's verifier | `currentWebhook` | `webhook:<vendor>` |

Outside a request (jobs, seeders) the actor is `system`. A webhook contract is the vendor's: each vendor gets its own verifier, never a shared one loosened for it.
<!-- partner:start -->
The partner contract is ours (signing v1); a webhook contract is the vendor's — loosening `partnerAuth()` for one vendor would weaken every partner (plan D23).
<!-- partner:end -->

Enforced: ESLint `local/inbound-channel` (the helpers per channel, read from the file name; `bodyKeys: 'verbatim'` only in `*.webhook.*` files) and `test/structure.test.ts` (each channel's routers only under its prefix and nothing else there: `*.webhook.routes.ts` only under `/webhooks`, `*.partner.routes.ts` only under `/v1/partner`). File naming: [naming.md](naming.md).

## 2. Users: default-deny JWT

Every route under `<API_BASE_PATH>/v1` needs `Authorization: Bearer <access token>`: `authenticate()` is mounted once in `createApp()`, so a new route is protected without doing anything. The only exceptions are the short `PUBLIC_ROUTES` list (`src/core/security/public-routes.ts`): login, refresh, logout, register. Health, docs and `/` are outside `/v1` and public by design.

| Need | How |
|---|---|
| Route for one role | `requireRole('admin')` after `describeEndpoint()`, before `validate()` → 403 `ERR_ROLE_FORBIDDEN` (documented in OpenAPI automatically). `ROLES` / `Role`: `src/core/security/roles.ts` |
| A user's own resource (`/users/:id`) | `requireSelfOrRole('id', 'admin')` — the owner or that role; otherwise the same 403 whether the resource exists or not |
| Who is calling (controller) | `currentUser()` → `{ id, role }`; services take the id as an argument or read `getActor()` (`user:<id>`, used for audit columns) |
| A new public route | Add it to `PUBLIC_ROUTES` (reviewed) — never a per-route "skip auth" |
| Contract tests | `authorize(createApp(), role, userId?)` from `test/helpers/authorized-app.ts` |
| First admin | `bun run seed:admin --email <email>` (password from a hidden prompt / stdin); last-resort recovery `--promote` |
| Change password | Own: `POST /auth/change-password`; admin: `PUT /users/:id/password`. Both set `users.password_changed_at` → refresh refuses token families started before it |
| Expired refresh tokens | `bun run auth:purge-tokens [--days 7]`, scheduled daily |

- Login returns a JWT HS256 access token (TTL `ACCESS_TOKEN_TTL_SECONDS`, default 15 min) in the body; the refresh token is **opaque**, only in the `refresh_token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=<base>/v1/auth`), stored as a SHA-256 hash in `auth_refresh_tokens` (plan D1–D3).
- Every refresh rotates the token; reusing an old one revokes its whole family (theft detection, 401 `ERR_AUTH_REFRESH_REUSED`).
- Cookie endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`) use `csrfProtection()` (`Origin` ∈ `CORS_ORIGINS`, `Sec-Fetch-Site`); why, and the effect of domains / subdomains: [auth-guide.md](../auth-guide.md) §7.
- Login attempts are limited per (email, IP) (`AUTH_LOGIN_MAX_ATTEMPTS`, Redis counter) → 429 `ERR_AUTH_LOGIN_LOCKED`.
- Access tokens are not re-checked against the database: role changes, deactivation and password changes take full effect when the token expires (≤ `ACCESS_TOKEN_TTL_SECONDS`); the next refresh already refuses / re-reads the role.
- Passwords are hashed and verified only with `hashPassword` / `verifyPassword` (`src/core/security/password.ts`, argon2id with Bun's defaults; a cheap cost only when `NODE_ENV=test`, so never run a server with `NODE_ENV=test`). The login dummy hash uses the same helper, so an unknown email costs as long as a wrong password (R75).
- Request emails use `emailField` (trimmed, lower-cased; stored and searched lower-case); new passwords `newPasswordField`. An admin cannot delete, deactivate or demote their own account (403 `ERR_SELF_LOCKOUT_FORBIDDEN`).
- Security logs never contain plaintext emails (hashed): `Login failed` (`reason`), `Login locked`, `Login succeeded`, `Logged out of every session`, `Password changed`, `Refresh token reused`, `Refresh refused`.

Enforced: `test/default-deny.e2e.test.ts` (every route of `createApp()` → 401 without a token unless public) and `test/openapi.e2e.test.ts` (protected operations carry `bearerAuth` + 401, public ones nothing).

<!-- partner:start -->
## 3. Partners: signed requests (spec v1)

`partnerAuth()` is mounted on `<API_BASE_PATH>/v1/partner/*` before `authenticate()`. Checks in order, each with its refusal:

1. All four headers (`x-partner-key`, `x-partner-timestamp`, `x-partner-nonce`, `x-partner-signature`) → 401 `ERR_PARTNER_HEADERS_MISSING`
2. Timestamp within `PARTNER_HMAC_TOLERANCE_MS` → 401 `ERR_PARTNER_REPLAY_REJECTED`
3. API key known and active (lookup by SHA-256 hash, cached — misses too) → 401 `ERR_PARTNER_INVALID_KEY`
4. IP whitelist (IPv4 / IPv6 / CIDR; empty = any) → 403 `ERR_PARTNER_IP_FORBIDDEN`
5. `allowed_routes` (relative to `/partner`; without `/*` exact, `/x/*` = x and below) → 403 `ERR_PARTNER_ROUTE_FORBIDDEN`
6. HMAC-SHA256 signature over `v1\n<timestamp>\n<nonce>\n<METHOD>\n<path>\n<canonical query>\n<sha256(raw body)>`, constant-time → 401 `ERR_PARTNER_SIGNATURE_INVALID`
7. Nonce not used yet (Redis `SET NX`) → 401 `ERR_PARTNER_REPLAY_REJECTED`
8. Per-partner `rate_limit_rpm` (Redis `increment`) → 429

- `authenticate()` lets a partner route through only after `partnerAuth()` verified the partner; otherwise it needs a bearer token (fail-closed). A partner route answers 401 `ERR_PARTNER_HEADERS_MISSING` without partner headers even with a bearer token (`test/default-deny.e2e.test.ts`).
- Nonce and rate limit are **fail-open**: with Redis down, a replay inside the timestamp window and excess rate are not stopped (logged `warn`) — the gateway stays available. Hence partner writes must be idempotent (§4).
- Handlers read `currentPartner()` (`{ code }`, actor `partner:<code>`) and can still read the body (`validate()`). One audit log line `audit: partner` per request (allowed / rejected + reason), never the key, nonce or signature.
- The credential lookup (`findForGateway`, cached by API key hash) is injected from the `partner-credentials` module in `src/app.ts`; every change to a credential drops its cache entry.
- Credentials (`/api/v1/partner-credentials`, admin only): the API key (`pk_…`) is stored as a SHA-256 hash + display prefix; the HMAC secret is encrypted with AES-256-GCM under the keyring `PARTNER_SECRET_KEYS` / `PARTNER_SECRET_ACTIVE_KEY_ID` (old keys still decrypt — rotation without downtime); both are shown once (create / rotate). `partner_code` is permanent (a `PERMANENT_UNIQUE_INDEXES` entry: the actor `partner:<code>` must never be reused).
- Partner and webhook prefixes are outside the global per-IP rate limit; per IP only their refused attempts (401 / 403) count (`rejectionLimit()`, plan D29).
- Signing spec, samples in TypeScript / Python / curl, test vectors, errors, rotation: [partner-integration-guide.md](../partner-integration-guide.md), guarded by `test/partner-guide.test.ts`. Manual test: `bun run partner:sign`.

## 4. Partner endpoints

- Generate them from the scaffold variant `.agents/skills/scaffold-module/references/partner.md` (`<module>.partner.routes.ts`), mount under `/api/v1/partner/...`, then add the route pattern to the credential's `allowed_routes`.
- An endpoint for one partner only adds `requirePartner('<code>')` after `describeEndpoint()` (403 `ERR_PARTNER_ROUTE_FORBIDDEN`, documented) — on top of `allowed_routes`, so an admin's mistake cannot open it to another partner (plan D27).
- **Idempotent writes**: the partner sends its own reference; `(partner_code, partner_reference)` is unique (`activeUniqueIndex`) and a retry is a 409. The partner code always comes from `currentPartner()`, never from the body; reads are scoped to the calling partner. `[review-only]` for hand-written modules (the template carries it).
<!-- partner:end -->

## 5. Vendor webhooks

A vendor that **calls us** (payment status, delivery receipts, incoming messages) owns the contract: payload, signature scheme, retries. Template: `.agents/skills/scaffold-module/references/webhook.md`; example: `src/integrations/demo-pay/` + `src/modules/payment-notifications/` (removed by `bun run setup` unless `--keep-examples`).

| Piece | Where |
|---|---|
| Verifier (`WebhookVendor`: `vendor`, `signatureHeader`, `verify()`) — exactly the vendor's documented scheme, constant-time comparison, bad input → `false` | `src/integrations/<vendor>/<vendor>.webhook.ts` |
| Payload schema (the vendor's casing, `.passthrough()` so `webhook_events.payload` keeps the whole event) | `src/integrations/<vendor>/<vendor>.webhook.dto.ts`, exported from `index.ts` |
| Secret (`<VENDOR>_WEBHOOK_SECRET`; empty = disabled, every call 401) | `src/config/<vendor>.config.ts` |
| Registration: `WEBHOOK_VENDORS` + `app.route(\`${webhooksPath}/<vendor>\`, …)` | `src/app.ts` only (dependency-cruiser `webhook-verifier-only-in-app`) |
| Receiver: `<module>.webhook.routes.ts` / `.webhook.controller.ts`, `validate({ body, bodyKeys: 'verbatim' })`, `currentWebhook()` | the **domain** module (plan D26) |
| Idempotency: `appendIfNew` into `webhook_events` (`ON CONFLICT (vendor, event_id) DO NOTHING`) + processing in one `@Transactional()` | the module's repository and service |

- `<API_BASE_PATH>/webhooks/*` is **fail-closed**: `webhookAuth(vendor)` per vendor, then `requireVerifiedWebhook()` for the whole prefix — a request no verifier accepted answers 401 `ERR_WEBHOOK_SIGNATURE_INVALID`, never 200. `test/default-deny.e2e.test.ts` checks every webhook route of a registered vendor.
- Answer 200 for every verified, valid event, also a retry (`duplicate: true`), so the vendor stops resending; a 4xx / 5xx makes it retry.
- Keep processing short; long work needs a job queue (backlog).
- Tests: the verifier with independent HMAC vectors, the receiver behind a stand-in for `webhookAuth()`, and signed requests through `createApp()`.
