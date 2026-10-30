# Architecture — Bun + Hono + Drizzle Backend

> **Document type**: Technical Architecture Document
> **Readers**: architects, tech leads, backend engineers, AI coding agents
> **Scope**: this boilerplate and every project created from it (`bun run setup <name>`). Generic — no project, organization or real vendor names.

This document explains **what and why** for every architectural decision. **How** — rules in detail, code patterns, commands — lives in one place per topic, [`docs/standards/`](docs/standards/), and is never restated here ([documentation.md](docs/standards/documentation.md)):

| Topic | Source |
|---|---|
| Directory tree, layer boundaries | [structure.md](docs/standards/structure.md) |
| Gates and commands | [quality-gates.md](docs/standards/quality-gates.md) |
| Controllers, validation, envelopes, errors, messages | [http-contract.md](docs/standards/http-contract.md) |
| Authentication and inbound channels | [auth-and-inbound.md](docs/standards/auth-and-inbound.md) |
| Data layer, transactions, raw SQL, time | [database.md](docs/standards/database.md), [transactions.md](docs/standards/transactions.md), [raw-queries.md](docs/standards/raw-queries.md), [datetime.md](docs/standards/datetime.md) |
| Cache, logging, configuration, bootstrap | [cache.md](docs/standards/cache.md), [logging.md](docs/standards/logging.md), [configuration.md](docs/standards/configuration.md), [bootstrap.md](docs/standards/bootstrap.md) |
| Outbound integrations, OpenAPI, testing | [integrations.md](docs/standards/integrations.md), [openapi.md](docs/standards/openapi.md), [testing.md](docs/standards/testing.md) |
| Naming, new modules, git | [naming.md](docs/standards/naming.md), [new-module.md](docs/standards/new-module.md), [git-workflow.md](docs/standards/git-workflow.md) |
| Frontend and deployment guides | [docs/auth-guide.md](docs/auth-guide.md), [docs/deployment.md](docs/deployment.md) |
| Partner guide | [docs/partner-integration-guide.md](docs/partner-integration-guide.md) | <!-- partner -->
| Decisions and their reasons — `D13` in comments and documents refers to them — exceptions and backlog | [docs/decisions.md](docs/decisions.md) |
| Active work plans | [docs/plans/](docs/plans/) |

Every rule is referenced by its ID in [§12 Rule Index & Enforcers](#12-rule-index--enforcers) (`R01`, `R02`, …), which names **the machine that rejects a violation**.

---

## 1. Summary

### 1.1 Pillars

```
├── [1] Pure Controllers & Uniform Contract → return ApiResponse; envelope, two-way snake_case, i18n built in
├── [2] Strict Layer Isolation              → Routes → Controller → Service → Repository (dependency-cruiser)
├── [3] Declarative ACID Transactions       → @Transactional() in services + TransactionHost (AsyncLocalStorage)
├── [4] Audited Data Layer                  → 4 repository bases; every UPDATE/DELETE recorded in record_changes
├── [5] Default-Deny Access                 → JWT + refresh cookie (users), signed inbound channels (per-vendor verifier, HMAC v1)
├── [6] Zero-Trust Configuration            → process.env read in one file; every group validated with Zod at start
├── [7] Resilient & Observable Platform     → Redis fail-open, Pino + request ID, health UP/DEGRADED/DOWN
└── [8] Machine-Enforced Quality Gates      → tsc, ESLint AST, ls-lint, depcruise, knip, guard tests, coverage, CI
```

The principle behind all of them: **a rule that is only written down will be broken** — by a hurried human as much as by an AI agent. So almost every rule is enforced by a machine (§12); the rest are marked `[review-only]` with the reason.

### 1.2 Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Bun ≥ 1.3 | `TZ=UTC` forced at start; `Bun.password` (argon2id, only via `src/core/security/password.ts`), `Bun.randomUUIDv7()` |
| HTTP | Hono 4 | `createApp()` serves production **and** tests (`app.request()`) |
| Language | TypeScript 5 strict | `noImplicitAny`, `strictNullChecks`, `noUnused*`, `noImplicitReturns` |
| ORM | Drizzle ORM + `postgres` driver | Code-first, `drizzle-kit` migrations, DB session `timezone=UTC` |
| Database | PostgreSQL ≥ 16 | Tables in `public`; optional read-only reference views |
| Time | `temporal-polyfill` | Instant / calendar date / local schedule, never mixed |
| Cache & locks | Redis ≥ 2.6 (`ioredis`) | Fail-open, automatic prefix, dangerous commands blocked |
| Validation | Zod 3 | One schema validates and documents (OpenAPI) |
| API docs | OpenAPI 3.1 (`hono-openapi`) + Scalar | Generated from the code, tested |
| Logs | Pino | JSON, redaction, `requestId` + `actor` on every line |
| Outbound HTTP | `HttpClientService` (Axios) | Only in `src/integrations/`, required timeout, vendor errors masked |
| Gates | ESLint 9, ls-lint, dependency-cruiser, knip, Prettier, `bun test`, Husky, GitHub Actions | §10 |

---

## 2. Structure & Layers

Tree and full matrices: [structure.md](docs/standards/structure.md).

```
modules ──► integrations ──► core ──► config
   │             │             └────► utils (pure leaf)
   ├──► core     └──► config, utils
   └──► database (TransactionHost, base repositories, schema — never connection.ts)
database ──► core (request context, errors), utils, config
database/schema ──► utils only
config ──► libraries only (root of the graph)
```

Why: the domain (`modules`) may depend on infrastructure, never the reverse — `core` and `database` are reused by every module, so they may not know any module (R02). Modules do not import each other (R03): a cross-module need is injected through a parameter (e.g. a guard receives the lookup it needs as an option in `app.ts`). Inside a module the flow is one-way, Routes → Controller → Service → Repository, with pure transformers (R01).

File names are **markers read by machines**: ESLint and dependency-cruiser choose rules by suffix (`*.controller.ts`, `*.webhook.routes.ts`), so a near miss (`x.webhook-routes.ts`) would escape every rule — hence the patterns are tested (R05, R06). Modules are named after their domain, never a vendor (D26). TypeScript is camelCase; snake_case is only for SQL and the wire (R07). Details: [naming.md](docs/standards/naming.md).

---

## 3. HTTP Layer & API Contract

### 3.1 The `createApp()` pipeline

One factory serves `src/index.ts` and every e2e test, so tests run the production pipeline. Order (detail: [bootstrap.md](docs/standards/bootstrap.md) §3):

```
 1. requestContext()      request ID, locale, trusted client IP, actor = anonymous (AsyncLocalStorage)
 2. loggerMiddleware()    request in/out log
 3. secureHeaders()       security headers
 4. cors()                only when CORS_ORIGINS is set (empty = no CORS headers)
 5. bodySizeLimit()       413 in the standard envelope
 6. rateLimit()           global per IP (Redis, fail-open) — except health and the self-authenticated prefixes;
    rejectionLimit()      on the self-authenticated prefixes: per IP only 401/403 answers count
 7. health                public, outside /v1
 8. webhookAuth(vendor)   per WEBHOOK_VENDORS, then requireVerifiedWebhook() → fail-closed
 9. partnerAuth()         <base>/v1/partner/* (signing v1) <!-- partner -->
10. authenticate()        <base>/v1/* default-deny, except PUBLIC_ROUTES and routes a guard above verified
11. v1 router             modules (requireRole per route); mountApiDocs() (off in production)
12. onError / notFound    globalErrorHandler, notFoundHandler (error envelope)
```

### 3.2 Return-based controllers

A controller reads validated input, calls its service, shapes the result through a transformer and **returns** an `ApiResponse` (R10, R11). Why: when a controller writes its own response (`c.json()`), the envelope, snake_case conversion, message translation and time format can each be skipped; returning one object makes them happen in one place (`ApiResponse.toJSON()`), and controllers are testable without HTTP. Data leaves only through transformers typed by the response schema (R13).

### 3.3 Two-way snake_case

Responses are snake_case; request body and query must be snake_case — any other key is a 400 — and reach DTOs in camelCase (R12). Why two-way and strict: a symmetric contract (the frontend sends the names it receives), and `details[].field` on validation errors is always the name the frontend sent, so it maps straight onto a form (D10). Vendor webhooks keep the vendor's casing — it is their contract (R46).

### 3.4 Envelopes & errors

One success envelope and one error envelope (`type`, `code`, `origin`, `vendor_name?`, `details?`, `request_id`, `timestamp`) for every endpoint. Domain failures are typed `ApiError`s (R14); `error.code` comes only from `APP_ERROR_CODES` because codes are a contract with the frontend — one list, no scattered literals (R15). A 500 never leaks internals (R18); a vendor failure never forwards the vendor's status or body (R52). 409 is `CONFLICT` (D12). Detail: [http-contract.md](docs/standards/http-contract.md).

### 3.5 Bilingual messages

Client-facing messages are `{ id, en }` (the type requires both), chosen from `Accept-Language` (default `id`, D11); `Error.message` stays English for uniform logs (R16).

### 3.6 Routes, versions & documentation

The version is code, not configuration: `<API_BASE_PATH>/v1`; a breaking change is a new router (R19). Every route carries `describeEndpoint()`; body, parameters and 400/413 are documented by `validate()` from the same schemas, so documentation cannot drift from validation (R17). Detail: [openapi.md](docs/standards/openapi.md).

### 3.7 Date & time

Three kinds, never mixed — instant (`*_at`), calendar date (`*_date`), local schedule (instant + `*_timezone`); parsing and conversion only in `datetime.util.ts`; process and DB session in UTC; DST-skipped or repeated wall times are rejected, never guessed (R20–R22, D13). Why: time-zone bugs appear silently when server, database and client sit in different zones — one conversion path makes them impossible. Detail: [datetime.md](docs/standards/datetime.md).

---

## 4. Authentication & Inbound Channels

| Caller | Channel | Authenticated by | Actor |
|---|---|---|---|
| Users (FE, mobile) | `<base>/v1/<module>` | JWT Bearer (`authenticate()`) | `user:<id>` |
| Partner systems | `<base>/v1/partner/...` | HMAC signing v1 (`partnerAuth()`) | `partner:<code>` | <!-- partner -->
| Vendor webhooks | `<base>/webhooks/<vendor>` (outside `/v1`) | the vendor's verifier (`webhookAuth()`) | `webhook:<vendor>` |
| No request (jobs, seeds) | — | — | `system` |

- **Separate channels** (D23): a webhook contract is the vendor's; each vendor gets its own verifier. Each channel's helpers are allowed only in its files (R43), and channel routers only under their prefix (R44).
- **Users** (D1–D7): short-lived JWT access token (15 min) in the body; an opaque refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie, stored hashed, rotated on every refresh, with reuse revoking the whole family (theft detection) (R40, R41). Opaque + database instead of a stateless JWT refresh because it must be revocable; database instead of Redis because Redis is fail-open and auth state must not vanish. **Default-deny** (D7): authentication is mounted once for all of `/v1`, with a short `PUBLIC_ROUTES` list — forgetting to add auth is no longer a hole, because there is nothing to add (R38). RBAC per route (R39).
- **Partners** (D21, D27–D29): signed requests (timestamp, single-use nonce, signature over method + path + query + body), IP whitelist, route ACL, per-partner rate limit (R42). Nonce and rate limit use fail-open Redis — a conscious trade for gateway availability — so partner writes must be idempotent per `(partner_code, partner_reference)` (R47). An endpoint for one partner adds `requirePartner()` so an admin's ACL mistake cannot open it to others. The partner contract is ours: loosening `partnerAuth()` for one vendor would weaken every partner. <!-- partner -->
- **Webhooks** (D23, D28): the verifier follows the vendor's scheme; the prefix is fail-closed (R45); events are stored unique per `(vendor, event_id)` and processed in the same transaction, so a vendor retry is answered 200 without running twice (R47).

Detail: [auth-and-inbound.md](docs/standards/auth-and-inbound.md).

---

## 5. Data Layer

- **One database per project, tables in `public`** (D14) through `appTable`; data owned by other systems is read through `.existing()` views that are never migrated and cannot be written (R23). Columns only through helpers (R24); UUID v7 primary keys generated by the app (time-ordered B-tree inserts, not guessable), `bigint` identity only for high-volume record tables (D15). Conventions are tested on every exported table (R25).
- **Five repository bases** by table kind — `BaseRepository` (standalone / header, soft delete, actor stamps), `ChildRepository` (details only through their live header: no IDOR, one lock order, sync from a form), `DependentRepository` (rows with their own pages under a live parent, added step by step; ownership through `parentScope()`, R74), `AppendOnlyRepository` (records), `ReadOnlyRepository` (reference views) (R26). One approved exception: the refresh-token repository (R27).
- **Transactions** (D8): `@Transactional()` in services, `TransactionHost` in repositories, carried by AsyncLocalStorage — atomicity without passing `tx` around, and services stay free of the Hono `Context` (R30–R32).
- **Audit** (D16): update, soft delete, restore and detail delete lock the row and append to `record_changes` **in the same transaction** — a rolled-back change leaves no audit row, and the shortcuts around the bases fail lint (R27–R29, R33, R35). A unique conflict is a 409, never a 500 (R36). `record_changes` is partition-ready.
- **Raw SQL** only where the query builder cannot express it, parameterized, read-only, in `*.queries.ts` (R29, R37).

Detail: [database.md](docs/standards/database.md), [transactions.md](docs/standards/transactions.md), [raw-queries.md](docs/standards/raw-queries.md).

---

## 6. Cache (Redis, fail-open)

Redis only through `CacheService` (R54), keys from `CACHE_KEYS` (R56). **Fail-open**: Redis down or slow → the fetcher runs, the request never fails because of the cache, health reports `DEGRADED` (R55). Automatic `<APP_NAME>:<NODE_ENV>:` prefix so projects and environments can share one Redis; `FLUSHALL` / `FLUSHDB` / `KEYS` blocked (D22). Why fail-open, and its consequence: the cache is an optimization, not a source of truth — state that must not be lost (refresh tokens, idempotency) lives in PostgreSQL (D1, D28). Detail: [cache.md](docs/standards/cache.md).

---

## 7. Observability, Configuration & Platform

- **Logging**: no `console.*`; Pino with `requestId` and `actor` added from the request context, sensitive keys redacted (R59). Detail: [logging.md](docs/standards/logging.md).
- **Request ID** (D9): an inbound `X-Request-ID` is accepted only in a safe format (prevents log injection), otherwise a UUID v7; it appears in logs, error envelopes, `record_changes` and outbound calls (R60).
- **Configuration**: `process.env` read in one file (R57); every group validated with Zod at start, naming wrong variables without values; renamed variables refused so a rename never switches a feature off silently (R58). Detail: [configuration.md](docs/standards/configuration.md).
- **Platform security**: security headers, CORS allowlist (empty = off), client IP through `TRUST_PROXY_HOPS` (never raw `X-Forwarded-For`), body limit, global per-IP rate limit in Redis (valid across instances; D18, D29). Agents never read active env files (R70).
- **Health**: `<base>/health` always 200 with `UP` / `DEGRADED` (Redis down) / `DOWN` (DB down); readiness 503 only when the database is down; liveness without dependency checks; DB probe capped at 2 s (R62).
- **Container & identity**: multi-stage Bun Alpine image, non-root, `TZ=UTC`; compose for local PostgreSQL 16 + Redis 7 (optional — native services work too). Values carrying the project name are `IDENTITY_RULES`, so `bun run setup <name>` rewrites them all and fails when one stops matching (R61).

---

## 8. Outbound Integrations

Vendor adapters live only in `src/integrations/<vendor>/` — no routes, no controllers, no dependency on modules, the database or other vendors (R51); domain services use them, controllers do not (R49). Every call goes through `HttpClientService`: keep-alive pool, **required timeout**, `X-Request-ID` forwarded, vendor bodies validated; raw `fetch` / `axios` is rejected (R49, R50, R52). A vendor failure becomes 504 / 502 with `error.origin` + `error.vendor_name` from `INTEGRATION_REGISTRY` and never the vendor's status or body (R52, R53). Why: the client must not depend on a vendor's error format, and vendor bodies may carry secrets. Login-based vendors share one token per process (`AccessTokenCache`, single-flight). Backlog: retry + circuit breaker, a token shared across instances. Detail: [integrations.md](docs/standards/integrations.md).

---

## 9. Testing

| Layer | Location | Infrastructure |
|---|---|---|
| Unit | `src/**/*.test.ts` (co-located) | Dependencies injected through default parameters; SQL recorder renders real SQL |
| E2E / contract | `test/*.e2e.test.ts` | `createApp().request(...)`, no real services |
| Guards | `test/*.test.ts` | Structure, default-deny, OpenAPI, docs sync, migrations, agent skills |
| Integration | `test/integration/*.int.ts` | Real PostgreSQL + Redis, a disposable database per run |

Hermetic by default — `bun test` never touches a developer's database or Redis, and `mock.module()` is banned because it leaks across files (R64). Coverage over source files only, every file loaded by a test; Bun reports no branch coverage, so every branch gets an explicit test (R63). The integration suite proves what mocks cannot — row locks, rollbacks, unique indexes, Lua, races (R65). Generic behaviour (soft delete, audit, detail sync) is tested once in `src/database/`. Detail: [testing.md](docs/standards/testing.md).

---

## 10. Quality Gates

pre-commit (lint-staged, tsc, ls-lint) → commit-msg (commitlint) → pre-push (`validate:full`) → CI (job `verify`: everything again + build + `verify:scaffold`; job `integration`: `test:int`; job `docker`: images, migration, healthy container; job `docs`: the portal). Before a release, `bun run acceptance` takes a fresh clone through setup, every generator, a database, a running server and the images (R81). Local hooks can be skipped, CI cannot. New modules come from one generator, `bun run scaffold` (D31), which reads the `scaffold-module` templates — the only copy of template code; `verify:scaffold` runs that CLI for every variant and every gate, so neither the templates nor the CLI can fall behind the code (R67). Developers and agents use the same command: conventions hold without an AI agent, and an agent spends its effort on the domain, not on boilerplate. Detail: [quality-gates.md](docs/standards/quality-gates.md).

---

## 11. AI Agent Governance

Rules for AI agents are part of the architecture: an agent produces code faster than a human can review it, so the same gates hold both. And because agents read the **same** `docs/standards/` as humans, a standard changed in one file reaches both (R73).

| Component | Role |
|---|---|
| `.agents/AGENTS.md` (imported by `CLAUDE.md`) | What only agents need: mandatory reading, the work plan, `.env` protection, never commit / merge unasked |
| skill `project-standards` | Router: which `docs/standards/` file to read before touching what |
| skill `scaffold-module` | Template code for new modules / adapters, generated with `bun run scaffold` (verified) |
| skill `finish-change` | Router: gates, definition of done and report before a change is called finished (`docs/standards/quality-gates.md` §4) |
| skills `init-project`, `generate-commit-text`, `generate-pr-text`, `update-version`, `generate-logbook`, `env-protection` | Project workflows |
| `.claude/` | Claude Code wrappers (`test/agent-skills.test.ts`); `permissions.deny` + a hook blocking active `.env` files |

Agents run database commands only against the developer's **local** database with explicit permission — never a shared or production one.

---

## 12. Rule Index & Enforcers

Labels (checked by `test/docs-sync.test.ts`: every row has one, every label points at something that exists):

| Label | Meaning |
|---|---|
| `[tsc]` | Rejected by the TypeScript compiler (`bun run typecheck`) |
| `[eslint:<name>]` | A rule or rule group in `eslint.config.mjs` (`bun run lint`) |
| `[depcruise:<name>]` | A rule in `.dependency-cruiser.cjs` (`bun run lint:arch`) |
| `[ls-lint]` | `.ls-lint.yml` (`bun run lint:ls`) |
| `[test:<name>]` | The test file `<name>.test.ts` / `<name>.int.ts` that fails on a violation |
| `[script:<name>]` | The `package.json` script that fails on a violation |
| `[ci:<job>]` | A job in `.github/workflows/ci.yml` |
| `[hook:<file>]` | A Git (Husky) or Claude Code hook that refuses the action |
| `[review-only]` | Not machine-checkable yet — reviewers check it (the reason is in the rule) |

### Structure & layers

| ID | Rule | Enforcer |
|---|---|---|
| R01 | One-way module flow Routes → Controller → Service → Repository; pure transformers | [depcruise:routes-no-service-or-repo] [depcruise:controller-no-repository] [depcruise:service-no-controller-or-routes] [depcruise:service-no-transformer] [depcruise:repository-no-service-or-controller] [depcruise:transformer-pure] |
| R02 | Top-level layers: config is the root, utils pure, core without domain / database / integrations, database without modules, schema only utils | [depcruise:strict-config-isolation] [depcruise:strict-utils-isolation] [depcruise:strict-core-isolation] [depcruise:strict-database-isolation] [depcruise:strict-schema-isolation] |
| R03 | Modules do not import each other | [depcruise:no-cross-module-deps] |
| R04 | No circular dependencies, orphans, unresolvable or unlisted imports, source importing tests; no unused files / exports / dependencies | [depcruise:no-circular] [depcruise:no-orphans] [depcruise:not-to-unresolvable] [depcruise:not-to-unlisted-dep] [depcruise:no-test-in-src] [script:lint:deps] |
| R05 | Folders and every dot segment of a file name are kebab-case | [ls-lint] [test:structure] |
| R06 | Module and integration file patterns; dependent modules one subfolder deep in their parent and named after it (`order-documents`), module names unique; modules not named after vendors; `*.int.ts` only in `test/integration/` | [test:structure] |
| R07 | TypeScript identifiers camelCase / PascalCase / UPPER_CASE (snake_case only for SQL names) | [eslint:@typescript-eslint/naming-convention] |
| R08 | Strict TypeScript, no `any` or unsafe operations | [tsc] [eslint:@typescript-eslint/no-explicit-any] [eslint:@typescript-eslint/no-unsafe-assignment] |
| R09 | Code formatted by Prettier (`*.ts`; Markdown written by hand) | [script:format:check] |

### HTTP contract

| ID | Rule | Enforcer |
|---|---|---|
| R10 | Controllers return `ApiResponse`, every handler wrapped in `asyncHandler`, no `c.json()` / `c.text()` / `c.body()` / `c.html()` | [eslint:CONTROLLER_SYNTAX_RULES] |
| R11 | Input only through `validate()` + `getValidated*()`; reading `c.req` (except headers) in controllers is banned | [eslint:CONTROLLER_SYNTAX_RULES] [test:validate] |
| R12 | snake_case wire in both directions; other request keys → 400 `ERR_NON_SNAKE_CASE_KEY` | [test:snake-case-contract] [test:api-response] [test:openapi.e2e] |
| R13 | Data leaves through a transformer, never as a raw entity — transformers are typed by the response schema, but an entity with extra columns still compiles | [review-only] |
| R14 | Domain errors are `ApiError` subclasses; `throw new Error` in modules is banned | [eslint:MODULE_ERROR_RULES] |
| R15 | `error.code` only from `APP_ERROR_CODES` (no `'ERR_*'` literals or built codes) | [eslint:ERROR_CODE_SYNTAX_RULES] |
| R16 | Client messages are `LocalizedMessage` `{ id, en }`; string literals as messages in modules are banned | [eslint:MODULE_ERROR_RULES] [tsc] [test:translate] |
| R17 | Every route has `describeEndpoint()` (summary + 2xx), snake_case properties, common headers | [test:openapi.e2e] |
| R18 | A 500 never exposes internal messages / details | [test:error-handler] |
| R19 | The API version is a router in code (`/v1`, `/v2`), never env; a breaking change is a new version — `openapi:check` labels it BREAKING (R76), choosing the version is a review decision | [review-only] |

### Date & time

| ID | Rule | Enforcer |
|---|---|---|
| R20 | `new Date(...)` (even "now"), `Temporal.Now`, `Date.parse`, local-time getters / formatters only in `datetime.util.ts` | [eslint:DATETIME_SYNTAX_RULES] |
| R21 | Request time fields from `datetime.dto.ts`; instants without an offset and ambiguous DST times rejected | [test:datetime.dto] [test:datetime.util] |
| R22 | Process (`TZ=UTC`, set by `env-source.ts`) and DB session (`timezone=UTC`, `connection.ts`) in UTC — the session setting is not tested | [test:hermetic-env] [review-only] |

### Data layer

| ID | Rule | Enforcer |
|---|---|---|
| R23 | `pgTable(` / `pgSchema(` only in `schemas.ts`; tables through `appTable` | [eslint:SCHEMA_DECLARATION_RULES] [test:schemas] |
| R24 | Columns through helpers (`timestamp(` / `date(` / `serial(` / `.defaultRandom()` banned in schema files) | [eslint:SCHEMA_FILE_RULES] [test:columns] |
| R25 | Schema conventions: indexed FKs, ids from helpers, bigint only in `APPEND_ONLY_TABLES`, uniques on soft-deleted tables via `activeUniqueIndex()`, partition-ready `record_changes` | [test:schema-conventions] |
| R26 | A module repository extends one base (`BaseRepository` / `ChildRepository` / `DependentRepository` / `AppendOnlyRepository` / `ReadOnlyRepository`) | [eslint:REPOSITORY_SYNTAX_RULES] |
| R27 | No `tx.update` / `tx.delete` in module repositories (single exception: the refresh-token repository may update `auth_refresh_tokens`) | [eslint:REPOSITORY_SYNTAX_RULES] [eslint:AUTH_TOKEN_REPOSITORY_RULES] |
| R28 | Database writes only in repositories | [eslint:TX_WRITE_RULES] |
| R29 | No raw `UPDATE` / `DELETE`; `tx.execute` only in `*.queries.ts`; no `sql.raw` | [eslint:RAW_WRITE_SQL_RULES] [eslint:RAW_QUERY_RULES] [eslint:SQL_RAW_RULES] |
| R30 | The transaction is never kept in a variable or destructured | [eslint:TX_ALIAS_RULES] |
| R31 | `@Transactional()` only in services | [eslint:TRANSACTIONAL_RULES] |
| R32 | `TransactionHost` only in repositories / `*.queries.ts` | [eslint:TX_HOST_IMPORT_PATTERN] [depcruise:transaction-host-only-in-repositories] |
| R33 | `recordChanges` only in `src/database/` | [eslint:MODULE_IMPORT_PATTERNS] [depcruise:record-changes-only-in-database] |
| R34 | Modules never touch the DB connection (`db`, `sqlClient`, `connection.ts`) | [eslint:MODULE_SYNTAX_RULES] [eslint:MODULE_IMPORT_PATTERNS] [depcruise:no-module-direct-db-connection] |
| R35 | Update / soft delete / restore / detail delete lock the row and write `record_changes` in the same transaction | [test:audited.repository] [test:base.repository] [test:child.repository] [test:data-layer] |
| R36 | A unique conflict → 409 (`isUniqueViolation()`), never 500 | [test:unique-violation] [test:data-layer] |
| R37 | Custom reads start from `this.scoped(...)`; raw queries write `deleted_at IS NULL` themselves — query shapes are free, not checkable by AST | [review-only] |

### Authentication & inbound channels

| ID | Rule | Enforcer |
|---|---|---|
| R38 | Default-deny `<base>/v1/*`; public only through `PUBLIC_ROUTES` | [test:default-deny.e2e] [test:public-routes] [test:authenticate] |
| R39 | Per-route authorization `requireRole` / `requireSelfOrRole` → 403 `ERR_ROLE_FORBIDDEN`, documented in OpenAPI | [test:require-role] [test:openapi.e2e] |
| R40 | Refresh token only in an HttpOnly cookie, rotated; reuse revokes the whole family | [test:auth.service] [test:auth.e2e] [test:auth] |
| R41 | Cookie endpoints use `csrfProtection()` | [test:csrf] [test:auth.e2e] |
| R42 | Partner routes only through `partnerAuth()` (signing v1, IP, `allowed_routes`, nonce, rate limit), also with a bearer token | [test:partner-auth] [test:default-deny.e2e] [test:partner] | <!-- partner -->
<!-- no-partner: | R42 | Partner gateway: removed by `bun run setup --no-partner` (D39) — no partner routes | [review-only] | -->
| R43 | Helpers per channel: a channel's helpers only in its files (`*.<channel>.*`), `requireRole` / `requireSelfOrRole` / `currentUser` never there (`*.webhook.*`, …) | [eslint:local/inbound-channel] |
| R44 | Channel routers only under their prefix (`*.webhook.routes.ts` under `/webhooks`, …) | [test:structure] |
| R45 | Webhook verifiers imported only by `app.ts`; the webhook prefix is fail-closed (no valid signature → 401) | [depcruise:webhook-verifier-only-in-app] [test:webhook-auth] [test:default-deny.e2e] |
| R46 | `bodyKeys: 'verbatim'` (vendor casing) only in `*.webhook.*` files | [eslint:local/inbound-channel] [test:validate] |
| R47 | Idempotent inbound: `webhook_events` unique `(vendor, event_id)`, a channel's own writes unique per caller reference — the channel templates (`webhook.md`, …) carry it, hand-written modules are not checked | [script:verify:scaffold] [review-only] |
| R48 | The partner guide (signing vectors, headers, error codes) matches the code | [test:partner-guide] | <!-- partner -->
<!-- no-partner: | R48 | Partner guide: removed with the partner gateway (`--no-partner`, D39) | [review-only] | -->

### Outbound integrations

| ID | Rule | Enforcer |
|---|---|---|
| R49 | `HttpClientService` / `src/core/http` only in `src/integrations/`; controllers do not import integrations | [depcruise:http-client-only-in-integrations] [depcruise:controller-no-integrations] [eslint:MODULE_SYNTAX_RULES] [eslint:MODULE_IMPORT_PATTERNS] |
| R50 | `fetch(`, `axios`, `node:http(s)` and other HTTP clients banned in `src/` except `src/core/http/` | [eslint:OUTBOUND_HTTP_SYNTAX_RULES] [eslint:OUTBOUND_HTTP_IMPORT_PATTERN] |
| R51 | Integrations have no routes / controllers and depend on no module, database or other vendor | [depcruise:strict-integrations-isolation] [depcruise:no-cross-integration-deps] [depcruise:integrations-no-presentation] |
| R52 | Required timeout; vendor failures masked (`ExternalServiceError`), vendor status & body never forwarded, body only in redacted logs | [tsc] [test:http-client.service] [test:vendor-body] |
| R53 | One `INTEGRATION_REGISTRY` entry per vendor (`error.origin` / `error.vendor_name`) | [test:registry] |

### Cache

| ID | Rule | Enforcer |
|---|---|---|
| R54 | Redis only through `CacheService` (`redis.client` / `ioredis` banned in modules & integrations) | [eslint:CACHE_CLIENT_IMPORT_PATTERN] [depcruise:redis-client-only-in-cache] |
| R55 | Fail-open, automatic prefix, `FLUSHALL` / `FLUSHDB` / `KEYS` blocked, atomic `increment` / `setIfAbsent` | [test:cache.service] [test:redis.client] [test:redis] |
| R56 | Keys from `CACHE_KEYS` — an AST cannot tell a key string from any other string | [review-only] |

### Configuration & platform

| ID | Rule | Enforcer |
|---|---|---|
| R57 | `process.env` in `src/` only in `env-source.ts` | [eslint:no-process-env] |
| R58 | Every config group validated with Zod at start (failure = variable names, no values); old names in `RENAMED_ENV_VARS` refused | [test:config] [test:parse-env] |
| R59 | No `console.*`; structured logs with redaction | [eslint:no-console] [test:logger] |
| R60 | `X-Request-ID` accepted only in a safe format; a request context per request | [test:request-id.util] [test:request-context] |
| R61 | Values carrying the project name are in `IDENTITY_RULES`; example registrations in `EXAMPLE_MODULES`; the setup wizard (D38) only fills in the same arguments as the command it prints | [script:lint:setup] [test:setup-wizard] |
| R62 | Health `UP` / `DEGRADED` / `DOWN`; readiness 503 only when the DB is down | [test:health.e2e] [test:health.service] |

### Testing, gates & workflow

| ID | Rule | Enforcer |
|---|---|---|
| R63 | Coverage above `THRESHOLDS`; every `src/` file loaded by a test; exclusions only in `COVERAGE_EXCLUSIONS` with a reason | [script:test:cov] |
| R64 | Hermetic tests (no real DB / Redis); `mock.module()` banned | [test:hermetic-env] [eslint:TEST_SYNTAX_RULES] |
| R65 | Integration suite: no `.rejects` / `.resolves` / `spyOn` / `mock`; runs in CI | [eslint:INTEGRATION_TEST_RULES] [ci:integration] |
| R66 | `eslint-disable` narrow and justified (`-- <reason>`) | [eslint:@eslint-community/eslint-comments/require-description] [eslint:@eslint-community/eslint-comments/no-unused-disable] |
| R67 | Every `scaffold-module` template variant, generated through `bun run scaffold`, passes every gate — the coverage gate included, so a variant ships its own tests; the CLI registers through permanent anchors and fails before writing when one is missing; its wizard (D36) only fills in the same flags — every shape plans the same files as the command it prints — and never asks without a terminal (the one exception, `SCAFFOLD_WIZARD_STDIN=1`, is set only by `bun run acceptance`, which answers it) | [script:verify:scaffold] [ci:verify] [test:scaffold] [test:scaffold-wizard] |
| R68 | `structure.md` names every script, test folder, helper and module, `quality-gates.md` every command; labels in this index are valid | [test:docs-sync] |
| R69 | Every `.agents` skill has a `.claude` wrapper with the same name + description | [test:agent-skills] |
| R70 | Agents never read active `.env` files (only `.env.example`) | [hook:.claude/hooks/protect-env.mjs] |
| R71 | Commit messages follow Conventional Commits with exactly one scope: a fixed platform scope or a folder of the source tree (module, `core/<area>`, `database/<folder>`, `integrations/<vendor>`, `utils/<name>`); branch names `<type>/<slug>` | [hook:.husky/commit-msg] [test:commit-scopes] [script:lint:branch] [ci:verify] |
| R72 | Generated migrations keep matching the SQL guards | [test:migrations] |
| R73 | Each standard lives in one `docs/standards/` file; routers (`AGENTS.md`, `CONTRIBUTING.md`, the `project-standards` / `env-protection` / `finish-change` skills) hold no code blocks and stay within budget; every standards file is linked from `CONTRIBUTING.md` and the `project-standards` skill; every relative link and every `<file>.md §N` reference resolves | [test:docs-sync] |
| R74 | A dependent row is reachable only through its parent: hidden while the parent is deleted or outside `parentScope()` (404, never 403), written only after the parent is locked, never moved to another parent; `assertParentWritable()` guards every write of details and dependents | [test:dependent.repository] [test:child.repository] [test:data-layer] [script:verify:scaffold] |
| R75 | Passwords are hashed and verified only through `hashPassword` / `verifyPassword` (`src/core/security/password.ts`): one cost for stored hashes and the login dummy hash, a cheap one only under `NODE_ENV=test` | [eslint:no-restricted-properties] [test:password] |
| R76 | The API contract is the reviewed snapshot `docs/api/openapi.json`: `openapi:check` fails on any difference (labelled BREAKING / safe / docs, asymmetric for request and response); only a developer runs `openapi:update` — never a hook, CI or the scaffold CLI | [script:openapi:check] [test:compare] [test:api-contract] [ci:verify] [script:verify:scaffold] |
| R77 | CI re-runs every local gate: each gate of `validate:full` is its own step of the CI job `verify` (`lint:branch` replaced by `validate-branch-name -t <head_ref>`: a pull request is a detached checkout) | [test:ci-gates] |
| R78 | Every route documents what it sends — its success message(s) (`response.message`, the controller's constant) and every error code (`errors`, platform middlewares document their own); under `NODE_ENV=test` a response that disagrees fails the tests, and every code matches `ERROR_CATALOG`. The integrator documents `docs/api/*.md` are generated from the same document (one per module, never hand-written) | [tsc] [test:contract-guard] [test:openapi.e2e] [test:error-catalog] [test:markdown] [script:openapi:check] |
| R79 | The deployment path works: both images of the `Dockerfile` build (dependencies installed without lifecycle scripts), the `tools` image migrates a real PostgreSQL, and the production image starts with production settings and reports `healthy` ([docs/deployment.md](docs/deployment.md)) | [ci:docker] |
| R80 | The documentation portal builds: every synced document is in the sidebar and no internal link or anchor is broken | [ci:docs] [script:docs:build] |
| R81 | A release passes the acceptance run (`bun run acceptance --combo a`: per setup combination a fresh clone → setup → every scaffold variant, the wizard answered by the runner → gates → database → server → HTTP → images); its document lists exactly the runner's steps | [test:docs-sync] [review-only] — it needs real services and minutes, so CI does not run it |
| R82 | In the boilerplate the partner gateway stays removable (`bun run setup --no-partner`, D39): partner code of shared files sits in balanced, unnested marked regions, partner-only files are in `PARTNER_ONLY`, and the pruned `src/`, `test/`, `.env.example` mention no partner. Setup drops every marker, so a project has none and `lint:setup` no longer checks them (`package.json` → `boilerplate`) | [script:lint:setup] [test:partner-prune] |
| R83 | Every `package.json` script is in the `bun run help` registry (`scripts/lib/commands.ts`) and the registry names nothing else; every `scripts/*.ts` a script runs answers `--help` / `-h` with its usage and exit 0 before anything is read, written or contacted, and refuses an unknown option with exit 1; CLI questions only through the `Prompter` (`scripts/lib/prompter.ts`, D40) | [test:commands] [test:cli-help] [eslint:CLI_PROMPT_IMPORT_PATTERNS] |
| R84 | One Bun version: `packageManager` in `package.json` is its single source — CI reads it, and the Docker base images and the `@types/bun` pin repeat it exactly | [test:toolchain] |
| R85 | Every paginated list takes the list query (D41, `http-contract.md` §8): `sort` only over the module's allowlist, always ended by `id`; `q` and filters only as declared typed fields; any other parameter a 400 naming it — never ignored; the total counts the same filters | [test:list-query.e2e] [test:list-query.dto] [test:list-query] [script:verify:scaffold] |

---

## 13. Configuration Manifests

Tooling configuration is **not** copied here; the files at the repository root are the source of truth:

| File | Enforces | Run by |
|---|---|---|
| `tsconfig.json` | Strict TypeScript | `bun run typecheck`, pre-commit |
| `eslint.config.mjs` | `no-restricted-syntax` / `no-restricted-imports` groups per area (composed at the top), `local/inbound-channel`, naming, `eslint-comments` | `bun run lint`, lint-staged |
| `.dependency-cruiser.cjs` | Layer boundaries and module flow | `bun run lint:arch` |
| `.ls-lint.yml` | Folder and single-dot file names | `bun run lint:ls`, pre-commit |
| `knip.json` | Unused files, exports, dependencies; `src/core/http/index.ts` is an entry — the API vendor adapters import, unused in a new project until its first `bun run scaffold integration` | `bun run lint:deps` |
| `scripts/check-coverage.ts` | Coverage thresholds (`THRESHOLDS`) | `bun run test:cov` |
| `bunfig.toml` | Hermetic test preload | `bun test` |
| `scripts/setup.ts` | `IDENTITY_RULES`, `EXAMPLE_MODULES` | `bun run setup`, `bun run lint:setup` |
| `.husky/*` | pre-commit, commit-msg, pre-push | Git |
| `commitlint.config.ts` | Conventional Commits (types, header length) | commit-msg, CI |
| `.validate-branch-namerc.json` | `<type>/<slug>` + environment branches | `bun run lint:branch`, CI |
| `.prettierrc`, `.prettierignore` | Format `*.ts` (Markdown excluded) | `bun run format:check` |
| `.github/workflows/ci.yml` | Jobs `verify`, `integration`, `docker`, `docs` | GitHub Actions |
| `drizzle.config.ts` | Migrations from the `public` schema | `bun run db:generate` |
| `Dockerfile` | Production image (runner) and the `tools` image (migrations, `seed:admin`, `auth:purge-tokens`); installs without lifecycle scripts | `docker build`, CI job `docker` ([docs/deployment.md](docs/deployment.md)) |
| `docs-site/sidebar.mjs` | Every synced document is in the portal menu | `bun run docs:build`, CI job `docs` |
| `.claude/settings.json`, `.claude/hooks/protect-env.mjs` | `.env` protection for Claude Code | Claude Code |
