# Outbound Integrations (Vendor Adapters)

Read this file when: calling an external system, adding a vendor, or handling a vendor failure.

How this project calls external systems. Template for a new vendor: `.agents/skills/scaffold-module/references/integration.md` (verified by `bun run verify:scaffold`). Working reference: `src/integrations/jsonplaceholder/` (keyless public API) and the module that consumes it, `src/modules/user-posts/` — an example removed by `bun run setup` unless --keep-examples.

## 1. Layout

| Piece | Where | Notes |
|---|---|---|
| Vendor identity | `src/integrations/registry.ts` → `INTEGRATION_REGISTRY` | Key = code (`error.origin`), `vendorName` = readable name (`error.vendor_name`) |
| Config | `src/config/<vendor>.config.ts` (one group per vendor) | `<VENDOR>_BASE_URL`, `<VENDOR>_TIMEOUT_MS`, credentials; exported from `src/config/index.ts`; listed in `.env.example` |
| Payload schemas | `src/integrations/<vendor>/<vendor>.dto.ts` | Zod, camelCase; only the fields the application uses |
| Adapter | `src/integrations/<vendor>/<vendor>.service.ts` | `HttpClientService` instance + adapter class + singleton |
| Entry point | `src/integrations/<vendor>/index.ts` | What domain services import |
| Consumer | `src/modules/<module>/<module>.service.ts` | Constructor default `= <vendor>Service`; route documents `errors: [502, 504]` |

Layer rules (ESLint `MODULE_SYNTAX_RULES` / `MODULE_IMPORT_PATTERNS`, dependency-cruiser `http-client-only-in-integrations`, `strict-integrations-isolation`, `no-cross-integration-deps`, `integrations-no-presentation`, `controller-no-integrations`): only `src/integrations/**` imports `src/core/http`; integrations never import `src/modules/**` or `src/database/**`, nor another vendor's folder; controllers never import integrations. `fetch(`, `axios`, `node:http(s)` and other HTTP clients are rejected everywhere in `src/` except `src/core/http/**` (ESLint `OUTBOUND_HTTP_SYNTAX_RULES` / `OUTBOUND_HTTP_IMPORT_PATTERN`; tests may call `fetch` against local test servers).

## 2. What `HttpClientService` guarantees

```typescript
new HttpClientService({ integration: INTEGRATION_REGISTRY.ACME_PAY, baseURL, timeoutMs });
```

- **Timeout is required** (`timeoutMs`, from config) — no call can hang a request forever. Keep-alive pool (`maxSockets` 100).
- **Failure mapping** (the vendor's status is never forwarded):

| Failure | Client sees | `error.code` |
|---|---|---|
| Timeout | 504 | `ERR_EXT_TIMEOUT` |
| No response (DNS, refused, reset) | 502 | `ERR_EXT_UNREACHABLE` |
| Vendor 4xx/5xx, or a body that fails `parse()` | 502 | `ERR_EXT_ERROR` |

  The envelope carries `error.origin` (code), `error.vendor_name` (name) and one generic, localized detail — never the vendor's body. `ExternalServiceError.vendorStatus` keeps the vendor's status for decisions inside the adapter (e.g. re-login on 401); it is never serialized.
- **Logs**: `Outbound HTTP request failed` with `integration`, `kind`, `method`, `url` (path only — query strings carry keys), `vendorStatus`, `vendorBody` (`summarizeVendorBody()`: secret-looking keys redacted at any depth, ≤ 2048 characters, binary reduced to its size), `err`. Request headers and bodies (credentials) are never logged.
- **Correlation**: the inbound request ID is sent as `X-Request-ID` unless the call sets its own; outside a request (jobs) no header. Quote it when reporting an incident to the vendor.
- **`parse(schema, body)`**: converts keys to camelCase and validates with the adapter's Zod schema. A mismatch is the vendor's failure (502 `ERR_EXT_ERROR`); the log lists only issue paths and codes, never values. Parse every body before it leaves the adapter.

## 3. Login-based vendors: `AccessTokenCache`

```typescript
private readonly tokens = new AccessTokenCache({
  login: (): Promise<IssuedAccessToken> => this.login(), // returns { accessToken, expiresInSeconds }
});

const body = await this.tokens.withToken((token) =>
  this.http.get<unknown>('/items/1', { headers: { authorization: `Bearer ${token}` } }),
);
```

- The token is reused until `expires_in − 60 s` (`refreshMarginSeconds`); a token living less than twice the margin is reused for half its lifetime. `expires_in` of 0, negative or not a number: used once.
- **Single-flight**: concurrent callers share one login — 10 parallel requests with an empty cache cause 1 login. A failed login is not cached: every waiter gets the error, the next call tries again.
- `withToken()` retries once after a vendor 401 (token revoked or expired early) with a fresh login; a second 401, or any other failure, is thrown as is. `invalidate(token)` never drops a newer token.
- **Per process**: N app instances log in N times and hold N tokens. That is fine for vendors that allow several live tokens per client. A vendor that allows only one (a new login revokes the old token) needs a token shared across instances — store it with `CacheService` under a `CACHE_KEYS` entry and serialize logins with a Redis lock; not provided yet (adoption plan backlog).

## 4. Testing

- Adapter tests run against a local fake vendor (`Bun.serve({ port: 0 })`): real HTTP, no network, no `mock.module()`. Inject the client and credentials through the constructor.
- Cover: the happy path, single-flight login, 401 → re-login, a body that fails the schema → 502, and the default singleton wired to config (in tests its base URL is a closed port → `ERR_EXT_UNREACHABLE`, so nothing ever reaches the real vendor).
- Domain services that use the adapter are tested with a fake adapter object; an e2e test may route a real call to a fake vendor (`test/outbound.e2e.test.ts`, part of the example).

## 5. Inbound webhooks from a vendor

A vendor that calls us (verifier, fail-closed prefix, vendor casing, idempotent `webhook_events`) is an inbound channel: [auth-and-inbound.md](auth-and-inbound.md) §5.
