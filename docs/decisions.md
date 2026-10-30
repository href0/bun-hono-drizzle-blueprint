# Decisions

Why this boilerplate is built the way it is. An ID such as `D13` in a comment, a test or a document points to a row below; the rule each decision produced is in `ARCHITECTURE.md` §12 and its standard in `docs/standards/`. The boilerplate was adopted from a NestJS + Drizzle blueprint, which is not part of this repository.

A changed decision keeps its ID: the row says what replaced what. **Numbering**: `D…` belongs to the boilerplate (§1). A project created from it records its own decisions as `PD1`, `PD2`, … in §4, so a later boilerplate decision taken over from `upstream` never collides with one of the project's. How a work plan feeds this file: [docs/plans/README.md](plans/README.md).

## 1. Decisions

| ID | Decision | Why |
|---|---|---|
| D0 | The boilerplate repository works on `main` with one branch per change; `development → staging → prod` is for projects created from it ([git-workflow.md](standards/git-workflow.md)) | A template has no environments of its own |
| D1 | Refresh tokens are opaque, stored as a SHA-256 hash in `auth_refresh_tokens`, rotated on every refresh; reuse of a rotated token revokes its whole family | A stateless JWT refresh cannot be revoked; Redis fails open, so session state cannot live there |
| D2 | Access tokens: JWT HS256 (`hono/jwt`), 15 minutes, claims `sub`, `role`, `jti`, `iss`, `aud` | No extra dependency; JWKS / asymmetric keys stay in the backlog |
| D3 | The refresh token travels only in the `refresh_token` cookie: `HttpOnly; Secure; SameSite=Strict; Path=<base>/v1/auth`, `Max-Age` = its TTL; never in a body | Unreachable from scripts; `Secure` still works on `http://localhost` |
| D4 | Cookie endpoints are protected by `SameSite` plus an `Origin` / `Sec-Fetch-Site` check against `CORS_ORIGINS` | The frontend manages no CSRF token |
| D5 | Login is email + password (argon2id via `Bun.password`); public registration is off (`AUTH_REGISTRATION_ENABLED=false`) | Admins create users |
| D6 | Authorization is simple RBAC: `users.role` ∈ `ROLES` + `requireRole()` | Fine-grained permissions stay in the backlog |
| D7 | Routes are default-deny: `authenticate()` on every `/v1` route except `PUBLIC_ROUTES`, proven by enumerating `app.routes` | A forgotten guard must not open a route |
| D8 | Request context (request ID, actor, locale, client IP) lives in `AsyncLocalStorage` | Services never receive the Hono `Context` |
| D9 | `X-Request-ID` is accepted only when it matches `^[A-Za-z0-9._:-]{1,128}$`, otherwise a UUID v7 is generated | Prevents log injection |
| D10 | The wire is snake_case in both directions and strict: another key casing in a request is a 400; opt-out `preserveKeys` | A symmetric contract; error `field`s match what the client sent |
| D11 | Messages in `id` and `en`, chosen by `Accept-Language`, default `DEFAULT_LOCALE=id` | Localized messages are one of the platform pillars kept from the blueprint, instead of shrinking to English only |
| D12 | A unique-value collision is `ConflictError` (409, `CONFLICT`) | The standard status for a general-purpose API |
| D13 | Time uses `temporal-polyfill`; runtime and database sessions run in UTC; three kinds of time: instants, calendar dates, local schedules with a zone ([datetime.md](standards/datetime.md)) | Prevents time-zone bugs |
| D14 | Tables live in `public` through `appTable`; reference data owned by another system is a `.view().existing()` (replaced: one `pgSchema` named after the project) | Each project owns its database |
| D15 | Primary keys are UUID v7 made by the application; a sequential `bigint` identity only for high-volume record tables listed in `APPEND_ONLY_TABLES`, never as a public id | B-tree indexes stay compact; ids cannot be enumerated |
| D16 | `record_changes`: one generic, partition-ready audit table written by the base repositories in the same transaction | No update or delete can skip its trail |
| D17 | OpenAPI through `hono-openapi` + Scalar, generated from the route code | One source; documents cannot drift |
| D18 | Rate limits in Redis (atomic `increment`, fixed window, fail-open, keyed by the trusted client IP) | Holds across instances |
| D19 | Quality gates: knip instead of depcheck; coverage without test files — global lines and functions ≥ 95 %, per file ≥ 90 %; pre-push runs the whole gate; CI on GitHub Actions | Bun reports no branch coverage |
| D20 | Dependency injection by singleton + default constructor parameter | Simple, easy to replace in tests |
| D21 | Partner API under its own prefix `/api/v1/partner/*` with `partnerAuth()` and the `partner-credentials` module | Never mixed with the JWT routes |
| D22 | Redis reconnects forever (backoff ≤ 30 s), no offline queue, a command timeout, the key prefix `<APP_NAME>:<NODE_ENV>:`, `FLUSHALL` / `FLUSHDB` / `KEYS` refused | Resilient and safe on a shared server |
| D23 | Two inbound channels: the partner API `<base>/v1/partner/*` (our contract, `partnerAuth()`) and vendor webhooks `<base>/webhooks/<vendor>` (the vendor's contract, outside `/v1`, one verifier per vendor, fail-closed) | Vendors never follow our signing; loosening `partnerAuth()` would weaken every partner |
| D24 | Module file names: `<module>[.<channel>].<role>[.test].ts`, channel `partner` / `webhook`, the role last | Lint and dependency rules read the suffix; `x.partner-routes.ts` would escape them all |
| D25 | Vendor adapters: `src/integrations/<vendor>/<vendor>.<role>.ts` (`service`, `dto`, `webhook`, `webhook.dto`, `index.ts`) | Everything about one vendor in one place |
| D26 | Modules are named after their domain, never after a vendor | Changing vendors adds an adapter; the module stays |
| D27 | An endpoint for one partner also checks `requirePartner(...codes)` in code, besides `allowed_routes` | A misconfigured `allowed_routes` cannot open it to another partner |
| D28 | Inbound idempotency is mandatory: `webhook_events` unique (vendor, event id); partner writes unique (`partner_code`, `partner_reference`) | Nonces and a fail-open Redis do not guarantee "processed once" |
| D29 | The partner and webhook prefixes are outside the global per-IP limit; per IP only refused attempts (401 / 403) are counted (`rejectionLimit()`) | The global limit would silently cap a partner's quota and refuse vendor retries |
| D30 | `bun run setup` removes the example webhook (`demo-pay` + `payment-notifications`) like the other examples; the partner ping / echo stays | New projects start without a fictitious vendor; ping / echo serves partner onboarding |
| D31 | A CLI scaffolder `bun run scaffold <kind> <name>` generates from the `scaffold-module` templates (the Markdown stays the single source), verified by `verify:scaffold` | Conventions hold without an AI agent |
| D32 | Every standard lives once, in `docs/standards/<topic>.md`; `ARCHITECTURE.md` is the why and the rule index; `CONTRIBUTING.md`, `AGENTS.md` and the skills only route | Standards written four times in two languages always drifted |
| D33 | Dependent modules: a child with its own pages under a parent (`--parent`, `--one` for 1:1), in the parent's subfolder, shallow routes, `DependentRepository` (a deleted parent hides its children, no cascade; `parentScope()` / `assertParentWritable()` hooks) | Parent rules are enforced once, in the base repository |
| D34 | API contract snapshot `docs/api/openapi.json`: `openapi:check` (pre-push, CI) fails on any change with `BREAKING` / safe / docs labels; only a developer runs `openapi:update` | Contract changes become visible and reviewed |
| D35 | `docs/api/*.md` is generated from the same document: one file per module, every status with its codes, examples; `describeEndpoint()` declares error codes and the success message, checked at run time under `NODE_ENV=test` | Hand-written docs drift; integrators need the codes |
| D36 | `bun run scaffold` asks what is missing in a terminal (a wizard over the same flags, `@clack/prompts`) and prints the equivalent command; without a terminal it never asks | Flags are easy to forget; the printed command teaches them |
| D37 | `bun run acceptance` runs the whole path of a new developer without any input: per setup combination a fresh clone, setup, every generator (the wizards answered by the runner), gates, database, server, HTTP, Docker | One command, repeated before every release |
| D38 | `bun run setup` takes arguments or a wizard, no configuration file; `--title`; the outbound example is removed like the others; `--no-partner` prunes the partner gateway | A project's identity is only its name, title and description |
| D39 | The partner gateway is pruned by marked regions (`// partner:start` … `// partner:end`) plus `PARTNER_ONLY`; re-enabling it is manual for now | Markers are visible in the files and safe for documents |
| D40 | One `Prompter` for every CLI question; `bun run help` only prints the command registry; every script answers `--help` without side effects | Three prompt styles, and `--help` that ran the command |
| D41 | Every paginated list takes `sort` (allowlisted fields, ≤ 3, ended by `id`), `q` (`ILIKE` over declared columns) and typed filters; any other parameter is a 400 ([http-contract.md](standards/http-contract.md) §8) | Without one convention every project builds its own; the allowlist keeps sorting and filtering on known columns |

## 2. Approved exceptions

- **Refresh-token repository** (`src/modules/auth/auth.repository.ts`, table `auth_refresh_tokens`): it does not extend a repository base and may `UPDATE` that one table directly (revoke, rotate) — high-volume security state without audit columns or soft delete; `revoked_at` + `replaced_by_id` are its trail. `DELETE` is not part of the exception: expired tokens are purged by `bun run auth:purge-tokens`. Enforced by the ESLint group `AUTH_TOKEN_REPOSITORY_RULES` ([database.md](standards/database.md) §7).

## 3. Backlog

Deliberately left out, to add when a project needs it:

- JWT with RS256 / EdDSA and a JWKS endpoint (verification across services); MFA, password reset and email verification by mail; fine-grained permissions.
- Outbound retries with backoff and a circuit breaker; a vendor token cache shared across instances (Redis + lock) for vendors that allow one live token.
- A per-user rate limit after login; a list of sessions per device with revocation.
- Monthly partitions of `record_changes` with a retention runbook; OpenTelemetry tracing and `/metrics`; a job queue / scheduler with the actor `system`; outgoing webhooks (signing, retries, dead letters) and asynchronous processing of incoming ones.
- Re-encrypting partner secrets with a new active key without rotating them; requiring an `ip_whitelist` for partners in production; the partner gateway in an external API gateway.
- Zod 4; a header-detail with several details; dependent chains deeper than two levels; automatic document numbering.
- Large lists: cursor / keyset pagination, full-text search or `pg_trgm` indexes for `q`, lists across parents for dependents.
- `bun run partner:enable` (re-enable a pruned partner gateway from `upstream`); a template sync command for projects created from the boilerplate; multi-tenancy (schema per tenant or `tenant_id` + row-level security).

## 4. Project decisions

A project created from this boilerplate adds its own decisions here (`PD1`, `PD2`, …), one row each, in the same form as §1. The boilerplate itself leaves this section empty.

| ID | Decision | Why |
|---|---|---|
