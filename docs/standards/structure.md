# Project Structure & Layer Boundaries

Read this file when: placing a new file, adding an import between layers, or adding a script, test area, helper or module. This tree is the canonical map of the repository — `test/docs-sync.test.ts` fails when a script, test folder, helper, integration area, top-level test or module is missing from it.

---

## 1. Directory tree

```
<project-root>/
├── ARCHITECTURE.md              # What & why, rule index R01… with enforcers
├── CONTRIBUTING.md              # How to work here + index of docs/standards/
├── .agents/                     # Agent rules (AGENTS.md) and skills (routers to docs/standards/, scaffold templates)
├── .claude/                     # Claude Code wiring: skill wrappers, settings, .env hook
├── docs/
│   ├── standards/               # The single source of every coding standard (this folder)
│   ├── auth-guide.md            # For frontend developers (Indonesian)
│   ├── partner-integration-guide.md # For partners (Indonesian), guarded by test/partner-guide.test.ts
│   ├── deployment.md            # For whoever deploys (Indonesian): images, production config, migrations
│   ├── api/                     # API contract: openapi.json snapshot + one Markdown per module (README.md index), written by bun run openapi:update after review, never by hand (R76, R78)
│   ├── plans/                   # Active work plans, if any (.agents/AGENTS.md "Work Plans")
│   └── archive/                 # Finished plans = decision history (D0…), original NestJS blueprint (not maintained)
├── docs-site/                   # Interactive documentation portal (Astro Starlight)
├── drizzle/                     # Generated SQL migrations (drizzle-kit)
├── src/                         # §1.1
├── test/                        # §1.2
└── scripts/                     # §1.3
```

### 1.1 `src/`

```
src/
├── config/                      # Zero-trust configuration, one Zod group per file (fail-fast on startup)
│   ├── env-source.ts            # The only reader of process.env (+ TZ=UTC, missing env file guard)
│   ├── parse-env.ts             # Validation per group; errors name the variable, never the value; RENAMED_ENV_VARS
│   ├── <group>.config.ts        # app, auth, database, redis, http, partner, one per vendor (`<vendor>.config.ts`)
│   └── index.ts                 # Barrel
│
├── core/                        # Cross-cutting, domain-agnostic building blocks
│   ├── cache/                   # Redis client (SafeRedis), CacheService, CACHE_KEYS / CACHE_TTL
│   ├── context/                 # RequestContext (AsyncLocalStorage): requestId, actor, locale, clientIp
│   ├── dto/                     # Shared request schemas: common.dto.ts (uuidParamSchema, paginationQuerySchema, emailField), datetime.dto.ts
│   ├── errors/                  # ApiError hierarchy + APP_ERROR_CODES (error-codes.ts) + ERROR_CATALOG (status, type, meaning per code)
│   ├── http/                    # HttpClientService (keep-alive pool, required timeout, X-Request-ID, vendor masking), vendor-body.ts (vendor body redaction for logs), access-token-cache.ts (single-flight vendor token)
│   ├── i18n/                    # LocalizedMessage, translate(), I18N_MESSAGES (cross-cutting messages)
│   ├── logger/                  # Pino logger with redaction
│   ├── middlewares/             # requestContext, clientIp, cors, bodySizeLimit, rateLimit, csrfProtection, authenticate, partnerAuth, webhookAuth, requireRole, validate, globalErrorHandler, …
│   ├── openapi/                 # describeEndpoint, envelope schemas, OpenAPI document + Scalar UI (<base>/docs), contract guard (NODE_ENV=test)
│   ├── response/                # ApiResponse (success envelope), error envelope builder
│   └── security/                # JWT HS256 access tokens, ROLES, PUBLIC_ROUTES (default-deny allowlist), partner API keys + secret cipher
│
├── database/                    # Drizzle infrastructure & data layer
│   ├── connection.ts            # PostgreSQL pool (postgres driver), session timezone UTC
│   ├── audited.repository.ts    # AuditedRepository: lock, diff, record_changes in the same transaction
│   ├── base.repository.ts       # BaseRepository: soft-delete scope, actor stamps, audited update / soft delete / restore
│   ├── child.repository.ts      # ChildRepository: details only through their header (no IDOR), sync
│   ├── dependent.repository.ts  # DependentRepository: own-page rows under a live, in-scope parent (D33)
│   ├── append-only.repository.ts # AppendOnlyRepository: record tables (append + read)
│   ├── read-only.repository.ts  # ReadOnlyRepository: reference views (read only)
│   ├── unique-violation.ts      # isUniqueViolation(): SQLSTATE 23505 → services throw ConflictError
│   ├── transaction-host.ts      # TransactionHost (active transaction or pool)
│   ├── transactional.decorator.ts # @Transactional() and runInTransaction()
│   ├── health-probe.ts          # pingDatabase() for health checks
│   ├── seeds/                   # seed-admin.ts (`bun run seed:admin`)
│   ├── maintenance/             # purge-refresh-tokens.ts (`bun run auth:purge-tokens`)
│   └── schema/                  # Table definitions (public) & reference views
│       ├── schemas.ts           # appTable (public) & referenceSchema — the only pgTable / pgSchema
│       ├── columns.ts           # Column helpers: uuidPrimaryKey, timestamps, instant, softDelete, …
│       ├── append-only-tables.ts # The only tables allowed a sequential (bigint) key
│       ├── permanent-unique-indexes.ts # The only plain uniques allowed on soft-deleted tables (never reused)
│       ├── domain/              # Project tables (migrated)
│       └── reference/           # Reference views owned by other systems (read only, never migrated)
│
├── integrations/                # Vendor adapters — no routes, no controllers
│   ├── registry.ts              # INTEGRATION_REGISTRY: code → institution (error.origin / error.institution)
│   ├── demo-pay/                # Example webhook vendor: demo-pay.webhook.ts (verifier) + demo-pay.webhook.dto.ts
│   └── jsonplaceholder/         # Example keyless outbound adapter: dto, service on HttpClientService, test against a fake vendor, index.ts (removed by `bun run setup` unless --keep-examples)
│
├── modules/                     # Inbound domain modules (HTTP)
│   ├── auth/                    # Login, refresh-token rotation (HttpOnly cookie), logout, /me (/api/v1/auth)
│   ├── health/                  # Health UP/DEGRADED/DOWN, readiness, liveness (/api/health, unversioned)
│   ├── orders/                  # Example header + detail module (removed by `bun run setup` unless --keep-examples)
│   ├── partner-credentials/     # Admin API for inbound partner credentials (/api/v1/partner-credentials, admin only)
│   ├── partner-gateway/         # Example signed partner endpoints (/api/v1/partner/ping, /echo)
│   ├── payment-notifications/   # Example vendor webhook receiver (POST /api/webhooks/demo-pay, idempotent)
│   ├── projects/                # Example parent of dependent modules (removed by `bun run setup` unless --keep-examples)
│   │   ├── project-tasks/       # Example dependent 1:N (/api/v1/projects/:projectId/tasks, /api/v1/project-tasks/:id)
│   │   ├── project-budgets/     # Example dependent 1:1 (/api/v1/projects/:projectId/budget, /api/v1/project-budgets/:id)
│   ├── user-posts/              # Example module consuming an outbound adapter (/api/v1/users/:id/external-posts) (removed by `bun run setup` unless --keep-examples)
│   └── users/                   # Reference standalone-table module (/api/v1/users)
│       ├── users.dto.ts         # Request & response schemas
│       ├── users.messages.ts    # Localized messages
│       ├── users.repository.ts  # extends BaseRepository
│       ├── users.service.ts     # Business logic + @Transactional()
│       ├── users.transformer.ts # Response shaping (drops the password hash)
│       ├── users.controller.ts  # Returns ApiResponse
│       ├── users.routes.ts      # describeEndpoint + validate + controller
│       └── *.test.ts            # Co-located unit tests
│
├── utils/                       # Pure functions (datetime, crypto, case converter, partner signature, ip/route match, record diff, …)
├── app.ts                       # createApp(): middleware pipeline, versioned router, WEBHOOK_VENDORS; `// scaffold:*` markers = where `bun run scaffold` registers
└── index.ts                     # Bun.serve, startup checks, graceful shutdown
```

### 1.2 `test/`

```
test/
├── setup/hermetic-env.ts        # Preload: no real database / Redis in `bun test`
├── helpers/                     # sql-recorder.ts (+ sql-recorder.test.ts; SQL recorder), repository-fixtures.ts (generic test tables), auth-fakes.ts (in-memory auth repositories), authorized-app.ts (tokens for contract tests), partner-signing-vectors.ts (published signing vectors), integration.ts (asActor, rejectionOf, unique for test:int)
├── integration/                 # bun run test:int: setup.ts (preload: disposable DB, migrations, fixtures) + data-layer, redis, auth, partner (*.int.ts)
├── *.e2e.test.ts                # health, auth, users, orders (example), partner-credentials, partner-gateway, vendor-webhooks, openapi, platform, default-deny, outbound
├── hermetic-env.test.ts         # Guards the hermetic preload
├── partner-guide.test.ts        # docs/partner-integration-guide.md matches the code (vectors, headers, error codes)
├── structure.test.ts            # File names, module / integration patterns, dependent subfolders named after their parent, unique module names, module ≠ vendor, channel routers, *.int.ts placement
├── docs-sync.test.ts            # This tree and the command table name everything; rule-index labels; links; docs SSOT
├── agent-skills.test.ts         # Every .agents skill has a .claude wrapper with the same name + description
├── ci-gates.test.ts             # Every gate of validate:full is its own step of the CI job verify
├── api-contract.test.ts         # openapi:check runs in validate and CI; no hook, CI workflow or the scaffold CLI runs openapi:update
├── commit-scopes.test.ts        # Fixed commit scopes in commitlint.config.ts = the table in git-workflow.md; scopes derived from src/
└── migrations.test.ts           # Guards the generated migration SQL
```

### 1.3 `scripts/`

```
scripts/
├── setup.ts                     # `bun run setup [<name>]` (init-project skill, IDENTITY_RULES, EXAMPLE_MODULES; no name in a terminal → the wizard)
├── check-coverage.ts            # Coverage gate (THRESHOLDS = the single source of thresholds)
├── scaffold.ts                  # `bun run scaffold <module|partner|webhook|integration> <name>`: generates from the scaffold-module templates (a missing argument in a terminal → the wizard)
├── verify-scaffold.ts           # `bun run verify:scaffold`: runs the scaffold CLI for every template, then every gate
├── test-integration.ts          # `bun run test:int`: disposable database + real migrations, test/integration, cleanup
├── acceptance.ts                # `bun run acceptance`: per setup combination a fresh clone through setup, every scaffold variant (the wizard answered by the runner), a database, a server, HTTP, Docker (manual-acceptance.md)
├── seed-admin.ts                # `bun run seed:admin --email <email>`
├── partner-sign.ts              # `bun run partner:sign`: signs a partner request for manual testing
├── openapi.ts                   # `bun run openapi:check` / `openapi:update`: the API contract snapshot (docs/api/openapi.json)
├── lib/acceptance.ts            # The acceptance stages A–D as data, the wizard driver, the run of a combination (+ lib/acceptance.test.ts)
├── lib/acceptance-progress.ts   # What the acceptance run shows: live step line, heartbeat, summary table (+ lib/acceptance-progress.test.ts)
├── lib/api-contract/            # Contract engine: document.ts (generation with a fixed config + module of each route), flatten.ts, compare.ts (labels; + compare.test.ts), report.ts, markdown.ts (docs/api/*.md; + markdown.test.ts)
├── lib/git-hooks.ts             # Are the Husky hooks active (core.hooksPath)? bun run setup warns when not (+ lib/git-hooks.test.ts)
├── lib/read-secret.ts           # CLI secrets from a hidden prompt / stdin, never argv or env
├── lib/scaffold.ts              # Scaffold engine (pure): template parser, names, plan of files + registrations (+ lib/scaffold.test.ts)
├── lib/test-services.ts         # PostgreSQL + Redis of disposable runs (test:int, acceptance): TEST_* or local only; Redis key cleanup
├── lib/prompter.ts             # The questions of a CLI wizard behind one interface: scripted in tests, @clack/prompts for a person (+ lib/prompter.test.ts: the real prompts on streams)
├── lib/setup-wizard.ts         # Arguments of bun run setup and its wizard (plan D38): name, --title, description, examples (+ lib/setup-wizard.test.ts)
├── lib/scaffold-wizard.ts       # The scaffold wizard (plan D36): questions per shape → the same flags, @clack/prompts (+ lib/scaffold-wizard.test.ts)
└── purge-refresh-tokens.ts      # `bun run auth:purge-tokens [--days N]`
```

---

## 2. Layer boundaries (dependency-cruiser, `bun run lint:arch`)

```
modules ──► integrations ──► core ──► config
   │             │             └────► utils (pure leaf)
   ├──► core     └──► config, utils
   └──► database (TransactionHost, base repositories, schema — never connection.ts)
database ──► core (request context, errors), utils, config
database/schema ──► utils only
config ──► libraries only (root of the graph)
```

| Layer | May import | Must not import | Rule |
|---|---|---|---|
| `src/config/` | libraries (`zod`, `node:*`) | every application layer | `strict-config-isolation` (prevents config ↔ logger cycles) |
| `src/utils/` | pure libraries | `core`, `database`, `modules`, `integrations` | `strict-utils-isolation` |
| `src/core/` | `utils`, `config`, libraries | `modules`, `database`, `integrations` | `strict-core-isolation` |
| `src/database/schema/` | `drizzle-orm`, `utils` | `modules`, `core`, `config`, `integrations` | `strict-schema-isolation` |
| `src/database/` | `config`, `utils`, `core` (request context, errors) | `modules`, `integrations` | `strict-database-isolation` |
| `src/integrations/<vendor>/` | `core/http`, `config`, `utils` | `modules`, `database`, another vendor | `strict-integrations-isolation`, `no-cross-integration-deps`, `integrations-no-presentation` |
| `src/modules/<module>/` (incl. its dependent subfolders `<module>/<child>/`) | `core`, `database` (abstractions), `integrations`, `config`, `utils`; parent ↔ its dependents (same module folder) | `database/connection.ts`, another module | `no-module-direct-db-connection`, `no-cross-module-deps` |

A module never imports another module: a cross-module need is injected through a constructor or function parameter (e.g. `partnerAuth()` receives the credential lookup of `partner-credentials` in `src/app.ts`). Also enforced everywhere: `no-circular`, `no-orphans`, `no-test-in-src`, `not-to-unresolvable`, `not-to-unlisted-dep`; single-purpose rules (`http-client-only-in-integrations`, `redis-client-only-in-cache`, `record-changes-only-in-database`, `transaction-host-only-in-repositories`, `webhook-verifier-only-in-app`) are described in the topic that owns them.

## 3. Flow inside a module

```
Routes ──► Controller ──► Service ──► Repository ──► PostgreSQL (TransactionHost)
               │             ├──► Integrations (vendor adapters)
               ▼             ▼
          Transformer    Core / Utils
```

| File | May import | Must not import | Rule |
|---|---|---|---|
| `*.routes.ts` | controller, DTO, middlewares | service, repository | `routes-no-service-or-repo` |
| `*.controller.ts` | service, DTO, transformer, `core/response` | repository, integrations | `controller-no-repository`, `controller-no-integrations` |
| `*.service.ts` | repository, integrations, DTO, `core`, `utils`, database (transactions, types) | controller, routes, transformer | `service-no-controller-or-routes`, `service-no-transformer` |
| `*.repository.ts` | database (TransactionHost, bases, schema), `utils` | service, controller, routes | `repository-no-service-or-controller` |
| `*.transformer.ts` | DTO / schema types | service, repository, controller | `transformer-pure` |

File naming (which suffix makes a file a controller, a partner route, …): [naming.md](naming.md).
