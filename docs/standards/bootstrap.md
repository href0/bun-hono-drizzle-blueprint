# Bootstrap & Application Lifecycle

Read this file when: modifying `src/app.ts` or `src/index.ts`, changing the middleware order, or handling startup and graceful shutdown.

---

## 1. Application factory (`src/app.ts`)

Source of truth: `src/app.ts` — read it rather than a copy. `createApp()` builds a fresh Hono app so tests instantiate it (`createApp().request(...)`) without ports or lifecycle leaks; the same factory serves production, so tests exercise the real pipeline.

- Paths derive from `API_BASE_PATH`: `<base>/health`, `<base>/webhooks`, `<base>/v1`, `<base>/v1/partner`.
- `WEBHOOK_VENDORS` (exported) lists the vendor verifiers — the only place they are imported ([auth-and-inbound.md](auth-and-inbound.md) §5).
- The `partnerAuth()` credential lookup is injected here from the `partner-credentials` service (modules never import each other).
- Modules register on the versioned router: `v1.route('/<module>', router)`; `GET /` returns the service identity.
- `mountApiDocs()` runs after every route so the document sees them all; its `requiresAuthentication` uses the same `PUBLIC_ROUTES` rule as `authenticate()`.

## 2. Server entry (`src/index.ts`)

Source of truth: `src/index.ts`. `bootstrap()`:

1. **PostgreSQL is fail-fast**: `SELECT 1`; on failure a `fatal` log and `process.exit(1)`.
2. **Redis is fail-open**: connect + `PING`; on failure a `warn` and the server starts degraded while the client keeps reconnecting ([cache.md](cache.md) §4).
3. `Bun.serve({ port: PORT, fetch: createApp().fetch })`; the startup log carries the health and docs URLs.
4. **Graceful shutdown** on `SIGINT` / `SIGTERM`: `server.stop(true)`, then `sqlClient.end({ timeout: 5 })` and `closeRedisClient()` (falls back to `disconnect()` when `QUIT` is refused), then exit.

`src/index.ts` is the one coverage exclusion (process bootstrap). It is proven by running it instead: the CI job `docker` starts the production image until it is healthy (R79), and `bun run acceptance` starts the server of a generated project, calls it and stops it (R81).

---

## 3. Mandatory Middleware Pipeline Order

| Order | Middleware | Purpose |
|---|---|---|
| 1 | `requestContextMiddleware()` | Request ID (safe inbound `X-Request-ID` or UUID v7), locale (`Accept-Language`), trusted client IP (`TRUST_PROXY_HOPS`); runs the rest of the request — including error and not-found handlers — inside the `RequestContext` |
| 2 | `loggerMiddleware()` | Logs method/path/client IP in and status/duration out (`requestId`/`actor` come from the logger mixin) |
| 3 | `secureHeaders()` | `X-Content-Type-Options`, `X-Frame-Options`, HSTS, … |
| 4 | `corsMiddleware(CORS_ORIGINS)` | Mounted only when `CORS_ORIGINS` is non-empty; allowlist with credentials; unlisted origins get no `Access-Control-Allow-Origin` |
| 5 | `bodySizeLimit(HTTP_BODY_LIMIT_BYTES)` | 413 `ERR_PAYLOAD_TOO_LARGE` by `Content-Length` or while streaming |
| 6 | `rateLimit({ keyPrefix: 'global' })` · `rejectionLimit({ keyPrefix: 'inbound-rejected' })` | Fixed window per trusted client IP via Redis `increment`; `RateLimit-*` headers; 429 + `Retry-After`; fails open; health probes skipped. The partner and webhook prefixes skip the global limit (a partner has its own `rate_limit_rpm`, vendors send bursts of retries from few IPs): there `rejectionLimit()` counts only refused attempts (401 / 403) per IP, so key or signature guessing still gets 429 before the credential lookup |
| 7 | Routes | `<API_BASE_PATH>/health` (unversioned, public) |
| 7b | `webhookAuth(vendor)` per `WEBHOOK_VENDORS` entry, then `requireVerifiedWebhook()` | `<API_BASE_PATH>/webhooks/*`, outside `/v1`: each vendor's verifier on `/webhooks/<vendor>/*`, then a fail-closed guard (401 `ERR_WEBHOOK_SIGNATURE_INVALID` for anything no verifier accepted); actor `webhook:<vendor>` |
| 8 | `partnerAuth({ basePath: '<API_BASE_PATH>/v1/partner', lookup })` | Partner gateway: request signed per spec v1 (headers, timestamp window, API key → active credential, IP whitelist, `allowed_routes`, signature over the raw body read once, nonce, per-partner rate limit); actor `partner:<code>`; one audit log line per request. Lookup injected from the `partner-credentials` module |
| 9 | `authenticate({ basePath: '<API_BASE_PATH>/v1' })` | **Default-deny**: every versioned route needs `Authorization: Bearer <access token>` except `PUBLIC_ROUTES` (`src/core/security/public-routes.ts`); sets actor `user:<id>` + role. Unversioned routes (health, docs, `/`) are public by design (asserted by `test/default-deny.e2e.test.ts`). Partner routes (`/v1/partner/*`) pass only once `partnerAuth()` verified the partner (fail-closed) |
| 10 | Routes | The versioned router `<API_BASE_PATH>/v1` holding the domain modules (`v1.route('/users', …)`; `validate()` and `requireRole()` per route, controllers return `ApiResponse`). The version is code, not env: a new version is a new router |
| — | `mountApiDocs()` | `<API_BASE_PATH>/docs` (Scalar UI) + `/docs/openapi.json`, mounted after every route so the document sees them all; not mounted when `API_DOCS_ENABLED` is false (production default) |
| 11 | `app.onError(globalErrorHandler)` · `app.notFound(notFoundHandler)` | Standard error envelope; `ApiError` status, `HTTPException` mapping, internal 500 details never exposed |

CORS runs before the body limit and rate limit so that 413/429 responses still carry CORS headers (browser code can read them). Preflight `OPTIONS` is answered by CORS and never counts against the rate limit.

Client IP: `X-Forwarded-For` is only honoured with `TRUST_PROXY_HOPS = n > 0` (n-th entry from the right — the last one written by our own proxies). With `0` the socket address is used, so a forged header cannot dodge the rate limit.

### Stricter limits per route

Sensitive endpoints (login, refresh, OTP, password reset) add their own `rateLimit()` in the module's routes file. It counts separately from the global limit (own `keyPrefix`) and both apply:

```typescript
import { rateLimit, validate } from '../../core/middlewares';

authRoutes.post(
  '/login',
  rateLimit({ windowSeconds: 15 * 60, max: 10, keyPrefix: 'auth-login' }),
  validate({ body: loginSchema }),
  authController.login,
);
```

Use a distinct, kebab-case `keyPrefix` per limit. Exempt paths with `skip: isUnderPath(prefix)` (segment-boundary match — never `startsWith`). The limit fails open when Redis is down, so it is a throttle, not the only defence (combine with account lockout / audit logs where it matters).