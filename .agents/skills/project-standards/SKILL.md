---
name: project-standards
description: Understand this project's coding standards, folder structure, naming conventions, and architectural patterns before writing any code in this project
---

# Project Standards

Before writing or modifying any code in this project, you MUST internalize the following standards. Violations will be caught by automated quality gates (`bun run validate:full`) and will block commits and CI pipelines.

---

## 1. Tech Stack

- **Runtime & Package Manager**: [Bun](https://bun.sh) (v1.3+)
- **HTTP Engine**: [Hono](https://hono.dev) (v4.7+)
- **Language**: TypeScript 5 (Strict Mode: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
- **Database ORM**: [Drizzle ORM](https://orm.drizzle.team) with `postgres` driver (PostgreSQL 16+)
- **Validation**: [Zod](https://zod.dev) (v3.25+)
- **Date & Time**: [temporal-polyfill](https://github.com/fullcalendar/temporal-polyfill) (`Temporal`), UTC runtime and DB session — see Rule 12
- **Structured Logging**: [Pino](https://github.com/pinojs/pino) with Correlation ID (`requestId`) and PII redaction
- **Cache**: Redis via [ioredis](https://github.com/redis/ioredis) with fail-open resilience
  - Every key is auto-prefixed with `<APP_NAME>:<NODE_ENV>:` (override: `REDIS_KEY_PREFIX`), so projects and environments can share one Redis.
  - The client reconnects forever (backoff ≤ 30 s), fails fast while disconnected (`commandTimeout`, no offline queue) and blocks `FLUSHALL`/`FLUSHDB`/`KEYS`. See [redis-cache.md](references/redis-cache.md).
- **API Docs**: OpenAPI 3.1 via [hono-openapi](https://github.com/rhinobase/hono-openapi) + `zod-openapi` v4 (Zod 3) and the [Scalar](https://scalar.com) reference UI — see Rule 11
- **HTTP Client**: Axios with persistent HTTP/HTTPS Keep-Alive connection pooling (`maxSockets: 100`) and vendor masking
- **Testing**: Native `bun:test` runner with an LCOV coverage gate (`scripts/check-coverage.ts`, the single source of thresholds)

---

## 2. Directory Architecture & Layer Boundaries

```
<project-root>/
├── .agents/                    # Workspace agent rules & skills
├── drizzle/                    # Auto-generated SQL migrations (drizzle-kit)
├── scripts/
│   ├── check-coverage.ts       # Coverage gate: thresholds (SSOT), per-file check, untested-file detection
│   └── setup.ts                # Project initializer (init-project skill, IDENTITY_RULES)
├── src/
│   ├── app.ts                  # Hono application factory & global middleware pipeline
│   ├── index.ts                # Bootstrap server entry point (Bun.serve)
│   ├── config/                 # Environment validation, one Zod group per file (fail-fast)
│   │   ├── env-source.ts       # The only reader of process.env (+ missing .env guard)
│   │   ├── parse-env.ts        # parseEnv(): lists every invalid var, never prints values; RENAMED_ENV_VARS guard
│   │   ├── <group>.config.ts   # app, database, redis, http, integrations → `<group>Config`
│   │   └── index.ts            # Barrel: import configs from 'src/config'
│   ├── core/                   # Framework-agnostic building blocks (isolated layer)
│   │   ├── cache/              # Redis client, SSOT keys, and CacheService
│   │   ├── context/            # RequestContext (AsyncLocalStorage): requestId, locale, clientIp, actor
│   │   ├── dto/                # Shared request schemas (uuidParamSchema, paginationQuerySchema)
│   │   ├── errors/             # Semantic ApiError class hierarchy
│   │   ├── http/               # HttpClientService with connection pool
│   │   ├── i18n/               # LocalizedMessage, translate(), I18N_MESSAGES (cross-cutting)
│   │   ├── logger/             # Pino logger instance with PII redact
│   │   ├── middlewares/        # requestContext, clientIp, cors, bodySizeLimit, rateLimit, validate, globalErrorHandler, …
│   │   ├── openapi/            # describeEndpoint, envelope schemas, buildOpenApiDocument, mountApiDocs
│   │   └── response/           # ApiResponse standardized JSON envelope
│   ├── database/               # Database persistence & connection layer
│   │   ├── connection.ts       # PostgreSQL connection pool & Drizzle instance
│   │   ├── audited.repository.ts # AuditedRepository: lock, diff, record_changes in the same transaction
│   │   ├── base.repository.ts  # BaseRepository: soft delete scope, actor stamps, audited update/delete/restore
│   │   ├── child.repository.ts # ChildRepository: details reachable only through their header, sync
│   │   ├── append-only.repository.ts # AppendOnlyRepository: record tables (append + read)
│   │   ├── read-only.repository.ts # ReadOnlyRepository: reference views (read only)
│   │   ├── transaction-host.ts # TransactionHost (AsyncLocalStorage context resolver)
│   │   ├── transactional.decorator.ts # @Transactional() and runInTransaction()
│   │   └── schema/             # Drizzle definitions (see references/database.md)
│   │       ├── schemas.ts      # appTable (public) + referenceSchema — the only pgTable()/pgSchema()
│   │       ├── columns.ts      # Column helpers: uuidPrimaryKey, timestamps, instant, softDelete, …
│   │       ├── append-only-tables.ts # The only tables allowed a sequential (bigint) key
│   │       ├── domain/         # Project tables (appTable)
│   │       └── reference/      # Shared reference tables (Read-Only)
│   ├── modules/                # Feature domains (business capabilities)
│   │   ├── health/             # Healthcheck probes
│   │   └── users/              # Reference feature domain
│   │       ├── users.controller.ts
│   │       ├── users.controller.test.ts
│   │       ├── users.dto.ts
│   │       ├── users.repository.ts
│   │       ├── users.repository.test.ts
│   │       ├── users.routes.ts
│   │       ├── users.service.ts
│   │       ├── users.service.test.ts
│   │       ├── users.transformer.ts
│   │       └── users.transformer.test.ts
│   └── utils/                  # Pure utility functions (zero dependencies on core/modules)
└── test/                       # E2E blackbox HTTP tests, setup/ (hermetic preload), helpers/ (SQL recorder, repository fixtures)
```

---

## 3. Strict Layer Boundaries (`dependency-cruiser`)

Enforced by `.dependency-cruiser.cjs`:
0. **Config Layer (`src/config/`)**: Root of the graph — libraries only (zod, node). Cannot import from any application layer (`core`, `database`, `modules`, `integrations`, `utils`). Rule `strict-config-isolation`.
1. **Core Layer**: Cannot import from `src/modules`, `src/database`, or `src/integrations`.
2. **Utils Layer**: Pure functions only. Cannot import from `src/core`, `src/database`, or `src/modules`.
3. **Database Layer**: Cannot import from `src/modules` or `src/integrations` (it may use `core` — request context for the audit actor, errors — `utils` and `config`). Schema files (`src/database/schema/`) may only use `utils` (`strict-schema-isolation`). Raw connection (`connection.ts`) cannot be imported by `src/modules`.
4. **Modules Layer**: Inbound domain modules. Cannot cross-import other domain modules directly (use services or shared core).
5. **Integrations Layer (`src/integrations/`)**: Outbound 3rd-party adapters (e.g. WhatsApp, Payment Gateways). Cannot import from `src/modules` or `src/database`. Cannot contain controllers or routes.

**Allowed dependency directions (implicit graph)**:
```
modules → integrations → core → config
modules → integrations → core → utils
modules → core → config
modules → core → utils (pure leaf, zero deps)
modules → database (via TransactionHost / health abstractions only; never connection.ts)
database → core (request context, errors), utils, config
database/schema → utils (pure helpers only; never core, config, modules, integrations)
config → (libraries only)
```
Any import path not shown above is forbidden by `dependency-cruiser`.

**Intra-Module Dependency Flow (Unidirectional DAG)**:
```
Routes ──> Controller ──> Service ──> Repository ──> Database (TransactionHost)
                │             │
                │             ├───> Integrations (Outbound 3rd-party adapters)
                ▼             ▼
           Transformer   Core / Utils
```
- **Routes**: Can only bind `Controller`, `DTO`, and middlewares. Forbidden from importing `Service` or `Repository`.
- **Controller**: Can only call `Service`, `DTO`, and `Transformer`. Forbidden from importing `Repository`.
- **Service**: Can only call `Repository`, `Integrations`, `DTO`, `Core`, `Utils`, and `Database` (TransactionHost/types). Forbidden from importing `Controller`, `Routes`, or `Transformer`.
- **Repository**: Data access leaf. Forbidden from importing `Service`, `Controller`, or `Routes`.
- **Transformer**: Pure data formatting function. Forbidden from importing stateful `Service`, `Repository`, or `Controller`.
- **Integrations**: Pure outbound adapters (`*.service.ts`, `*.dto.ts`). Forbidden from importing domain modules or database layers.

---

## 4. Core Architectural Rules

### Rule 1: Return, Don't Send (Pure Controllers)
- Controllers **MUST NEVER** call `c.json()` or `c.text()` directly.
- Controllers **MUST RETURN** an `ApiResponse` instance.
- Controllers **MUST** be wrapped in `asyncHandler`.
- Violation of this rule is blocked at the AST level by ESLint `no-restricted-syntax` (group `CONTROLLER_SYNTAX_RULES` in `eslint.config.mjs`: `c.json`/`c.text`/`c.body`/`c.html`).

```typescript
// users.controller.ts
export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateUserDto>(c);
    const user = await this.service.createUser(dto);
    const responseData = toUserResponse(user);

    return new ApiResponse(responseData, USER_MESSAGES.CREATED, 201);
  });
}
```

### Rule 2: Validation First (Zod Middleware)
- Never parse raw `await c.req.json()` inside controller logic.
- Bind the `validate({ body, query, params })` middleware to route definitions.
- Controllers extract sanitized, strongly-typed data using getters:
  - `getValidatedBody<T>(c)`
  - `getValidatedParams<T>(c)`
  - `getValidatedQuery<T>(c)`

```typescript
// users.routes.ts
const router = new Hono();
router.post('/', validate({ body: createUserSchema }), usersController.create);
router.get('/', validate({ query: paginationQuerySchema }), usersController.list);
router.get('/:id', validate({ params: uuidParamSchema }), usersController.getById);
```

- Body and query keys arrive in `snake_case` and reach the DTO in camelCase (see Rule 6).

### Rule 3: Decoupled Repositories (TransactionHost)
- Repositories **MUST NOT** import `db` directly.
- Repositories **MUST** receive `TransactionHost` in constructor (defaulting to the singleton `defaultTxHost`); tests inject the SQL recorder's host (`test/helpers/sql-recorder.ts`).
- All queries **MUST** execute against `this.txHost.tx`.
- This ensures seamless transactional atomicity under `@Transactional()` or `runInTransaction()`.
- Violation of this rule is blocked by ESLint `no-restricted-syntax` / `no-restricted-imports` (groups `MODULE_SYNTAX_RULES`, `MODULE_IMPORT_PATTERNS`) and dependency-cruiser `no-module-direct-db-connection`.
- Every module repository **extends** a base by table kind — `BaseRepository`, `ChildRepository`, `AppendOnlyRepository`, `ReadOnlyRepository` — and never writes around it (no `tx.update` / `tx.delete`, no raw `UPDATE` / `DELETE`); writes happen only in repositories, raw queries only in `*.queries.ts`, `@Transactional()` only in services. Full rule table: CONTRIBUTING §5.3; guide: [database.md §6](references/database.md).

```typescript
// users.repository.ts
export class UsersRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.txHost.tx
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }
}
```

### Rule 4: Strict Service Layer & Semantic Error Throwing
- Services **NEVER** accept the Hono `Context` object. They accept plain DTOs or primitive arguments. Request-scoped data (request ID, actor) comes from `getRequestContext()` / `getActor()` (`src/core/context/request-context.ts`).
- Services **NEVER** return HTTP responses.
- Business rule failures **MUST THROW** semantic `ApiError` instances (`src/core/errors/`). Throwing a plain `Error` in `src/modules/**` and `'ERR_*'` literals anywhere in `src/` are rejected by ESLint — error codes come only from `APP_ERROR_CODES` (`src/core/errors/error-codes.ts`):
  - `ValidationError` (400) · `BadRequestError` (400) · `UnauthorizedError` (401) · `ForbiddenError` (403) · `NotFoundError` (404) · `ConflictError` (409, type `CONFLICT`) · `PayloadTooLargeError` (413) · `TooManyRequestsError` (429, optional `retryAfterSeconds` → `Retry-After`) · `ServiceUnavailableError` (503)
  - `ExternalServiceError(kind, message, { origin })` — `TIMEOUT` → 504, `UNREACHABLE` / `ERROR` → 502; the vendor's status is never forwarded
  - `InternalServerError` (500) — broken invariants; its message and details are logged, never sent to the client
- Constructor shape: `new XError(message, { details?, origin?, code? })` — `code` overrides the class default with a more specific registry code (e.g. `APP_ERROR_CODES.INVALID_JSON`).

```typescript
// users.service.ts
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(USER_MESSAGES.EMAIL_TAKEN, {
        details: [{ field: 'email', message: USER_MESSAGES.EMAIL_ALREADY_REGISTERED }],
      });
    }
    return this.repository.create({ ...dto, passwordHash: '...' });
  }
}
```

### Rule 5: Response Transformer (Data Shaping)
- Never return raw database entities to the client (to prevent leaking sensitive columns like `passwordHash`, internal tokens, etc.).
- Transform outputs using dedicated pure functions in `<name>.transformer.ts`:
  - `to<Name>Response(entity)`
  - `to<Name>ListResponse(entities)`

### Rule 6: Strict Casing Invariant (snake_case Wire Format vs camelCase Codebase)
- **HTTP Response Payloads**: MUST ALWAYS be serialized in `snake_case` (e.g. `status_code`, `full_name`, `is_active`). This is automatically performed by `ApiResponse.toJSON()` and `globalErrorHandler`.
- **HTTP Request Payloads (body & query)**: clients MUST send `snake_case` keys. `validate()` rejects any other casing with 400 `ERR_NON_SNAKE_CASE_KEY` (each offending key listed exactly as sent) and converts accepted payloads to camelCase before Zod, so DTOs stay camelCase. Route params are not converted. Free-form dictionary fields opt out with `validate({ body, preserveKeys: ['metadata'] })` (top-level only).
- **Known limitation — response dictionaries**: `preserveKeys` only applies to requests. `ApiResponse` converts every key of the response (including a dictionary echoed back) to snake_case, so `{ someKey: 1 }` is returned as `{ some_key: 1 }`. In public contracts prefer `{ key, value }` arrays over dictionaries; a response-side opt-out will be added only when a real need appears.
- **Shared request DTOs**: `uuidParamSchema` (`:id`) and `paginationQuerySchema` (`?page=&per_page=`, max `MAX_PER_PAGE`) live in `src/core/dto/common.dto.ts` — reuse them instead of redefining per module.
- **Database Tables**: Physical SQL table names MUST be `snake_case` (e.g. `domainSchema.table('user_profiles', ...)`).
- **TypeScript Codebase**: All identifiers (variables, parameters, properties, methods, DTO fields) **MUST NOT** be `snake_case`. They MUST use `camelCase` or `PascalCase` enforced by ESLint.

### Rule 7: Strict Unidirectional Intra-Module Flow
- **Routes -> Controller -> Service -> Repository**: This directed acyclic graph is strictly enforced by `dependency-cruiser`.
- Controllers **MUST NOT** import repositories directly.
- Routes **MUST NOT** import services or repositories directly.
- Services **MUST NOT** import presentation artifacts (controllers, routes, or transformers).
- Repositories **MUST NOT** import services or controllers.
- Transformers **MUST** be pure functions with zero service or repository dependencies.

### Rule 8: Absolute Database Connection Isolation
- Domain modules under `src/modules/**` **MUST NEVER** import `src/database/connection.ts` or directly import `db` or `sqlClient`.
- Repositories must query exclusively through `this.txHost.tx`.
- Health checks must use `pingDatabase()` exported by the database layer.
- Enforced at both ESLint AST level and Dependency Cruiser layer.

### Rule 9: Outbound Integrations & HttpClientService Isolation
- Third-party HTTP integration adapters MUST reside exclusively under `src/integrations/<vendor>/`.
- `HttpClientService` and `src/core/http` **MUST ONLY** be imported inside `src/integrations/**`.
- Modules under `src/modules/**` **MUST NOT** import `HttpClientService` or `src/core/http` directly. They MUST consume integration services (e.g. `JsonPlaceholderService`).
- Integrations under `src/integrations/**` **MUST NEVER** import anything from `src/modules/**` or `src/database/**`. Their sole responsibility is calling external APIs and returning response data/contracts.
- Controllers **MUST NOT** import integrations directly; domain services orchestrate external data fetching.
- Integrations **MUST NOT** contain routes, controllers, or database calls.
- Enforced deterministically via ESLint AST (`no-restricted-syntax`, `no-restricted-imports`) and Dependency Cruiser (`http-client-only-in-integrations`, `strict-integrations-isolation`, `controller-no-integrations`).


### Rule 10: Localized User-Facing Messages (i18n `id` / `en`)
- Messages sent to clients are `LocalizedMessage` objects (`{ id, en }`, every supported locale required by the type), never string literals: `I18N_MESSAGES` (`src/core/i18n/messages.ts`) for cross-cutting text, `src/modules/<name>/<name>.messages.ts` for domain text (`<NAME>_MESSAGES` constants; functions such as `userNotFoundMessage(id)` for parameterized text).
- The response language is resolved per request from `Accept-Language` (fallback `DEFAULT_LOCALE`, default `id`), stored in `RequestContext` (`getLocale()`), and sent back as `Content-Language`.
- `Error.message` stays English for logs; translation happens when the envelope is built. Zod field messages are not translated (known limitation).
- Enforced by ESLint `no-restricted-syntax` in `src/modules/**` (string literals in `new ApiResponse(...)`, `new XError(...)`, error `details[].message`); `InternalServerError` is exempt because its text is log-only.

### Rule 11: Documented Endpoints (OpenAPI)
- Every route carries `describeEndpoint({ tags, summary, response, errors })` from `src/core/openapi`: the success envelope (`data` or `paginatedItem`) and the **domain** errors it can return.
- Never described by hand: the request body, query and path parameters, 400 and (with a body) 413 — `validate()` documents them from the same Zod schemas it enforces; 429 and 500 — added on every route; the common headers (`Accept-Language`, `X-Request-ID`, `Content-Language`, `RateLimit-*`, `Retry-After`) — added by the document builder.
- Response schemas live in `<name>.dto.ts` (`<name>ResponseSchema`) and type the transformer (`z.infer`), so docs cannot drift from what the API returns. Time values use `isoInstant()` / `isoCalendarDate()` (`Temporal` in TypeScript; on the wire `…T03:00:00.000Z` / `YYYY-MM-DD` via `toWireTime()`).
- Schemas are camelCase like DTOs; the published document is converted to snake_case by `toSnakeCaseOpenApi()`.
- Served at `<API_BASE_PATH>/docs` (Scalar UI) and `<API_BASE_PATH>/docs/openapi.json` when `API_DOCS_ENABLED` (default on, off in production).
- Enforced by `test/openapi.e2e.test.ts`: every route of `createApp()` is in the document with a `summary` and a 2xx response (so `validate()` alone is not enough), every schema property and query parameter is snake_case, validated routes document 400, every operation carries the common headers. Full guide: [openapi.md](references/openapi.md).

### Rule 12: Date & Time (Temporal, UTC)
- Three kinds of time, never mixed: instant (`*_at`, `Temporal.Instant`, `timestamptz`, ISO 8601 UTC), calendar date (`*_date`, `Temporal.PlainDate`, `date`, `YYYY-MM-DD`), local schedule (instant + `*_timezone` IANA name).
- All parsing and `Date` ⇄ Temporal conversion goes through `src/utils/datetime.util.ts`; request fields use `instantField` / `calendarDateField` / `timeZoneField` (`src/core/dto/datetime.dto.ts`). Requests without a UTC offset are rejected; DST-skipped or repeated wall times are rejected, never guessed.
- The process (`TZ=UTC`) and the database session (`timezone=UTC`) run in UTC. Responses write every instant with millisecond precision (`toWireTime()` in `ApiResponse`).
- Enforced by ESLint `DATETIME_SYNTAX_RULES`: `new Date(...)` — even for "now" — and `Temporal.Now` (use `nowInstant()` / `nowIsoUtc()`), `Date.parse` and local-time getters/setters/formatters are rejected outside `datetime.util.ts`. Full guide: [datetime.md](references/datetime.md).

---

## 5. Standard Output Envelopes

`message` is written in the language negotiated from `Accept-Language` (fallback `DEFAULT_LOCALE`, default `id`); the response carries `Content-Language` and `Vary: Accept-Language`. The examples below are the default (`id`) responses.

### Success Envelope
```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar pengguna berhasil diambil",
  "data": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "full_name": "John Doe",
      "is_active": true
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 10,
    "total_items": 42,
    "total_pages": 5
  }
}
```

### Validation Error Envelope (HTTP 400)
```json
{
  "success": false,
  "status_code": 400,
  "message": "Validasi data gagal. Silakan periksa kembali input Anda",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      { "field": "email", "message": "Invalid email address format" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-09-24T04:42:51.000Z"
}
```

Field messages come from the Zod schema and are not translated (known limitation). Other `VALIDATION_ERROR` codes: `ERR_INVALID_JSON` (malformed body) and `ERR_NON_SNAKE_CASE_KEY` (key not in snake_case; `field` is the key exactly as sent).

---

## 6. Testing & Quality Gate Mandates

1. **Unit Tests**: Co-located in the same directory (`*.test.ts`).
2. **E2E Tests**: Located in `test/*.e2e.test.ts` testing blackbox HTTP routes via `app.request()`.
3. **Mandatory Coverage**: `bun run test:cov` must pass. Thresholds live only in `scripts/check-coverage.ts` (`THRESHOLDS`): global lines & functions, per-file lines, and every `src/` file must be loaded by at least one test. Exclusions require a reason and a removal step in `COVERAGE_EXCLUSIONS`.
4. **Verification Command**:
   ```bash
   bun run validate:full
   ```
   Runs `typecheck` $\rightarrow$ `lint` $\rightarrow$ `lint:ls` $\rightarrow$ `format:check` $\rightarrow$ `lint:arch` $\rightarrow$ `lint:deps` $\rightarrow$ `lint:branch` $\rightarrow$ `test:cov`.

---

## 7. Deep-Dive Implementation References

When implementing specific subsystems, consult the corresponding deep-dive reference document:

| Subsystem | Reference Document | Key Topics |
|---|---|---|
| **Bootstrap & Lifecycle** | [bootstrap.md](references/bootstrap.md) | `createApp()`, `Bun.serve`, middleware pipeline sequence, graceful shutdown |
| **Database & Schema** | [database.md](references/database.md) | Connection pool, tables in `public` vs optional reference views, column helpers, choosing a primary key, migrations, audit trail (`record_changes`), table kinds, `BaseRepository` / `ChildRepository` |
| **Declarative Transactions** | [transactions.md](references/transactions.md) | `TransactionHost`, `AsyncLocalStorage`, `@Transactional()`, nested context |
| **Structured Logging** | [logging.md](references/logging.md) | Pino logger, `requestId` correlation, automatic PII redaction |
| **Redis Caching** | [redis-cache.md](references/redis-cache.md) | `CacheService`, `CACHE_KEYS` SSOT, fail-open resilience guarantee |
| **Raw SQL Queries** | [raw-queries.md](references/raw-queries.md) | Drizzle `sql` tagged template, parameterization safety, `*.queries.ts` files |
| **Date & Time** | [datetime.md](references/datetime.md) | Instant vs calendar date vs local schedule, `datetime.util.ts`, DTO fields, UTC runtime/session, DST rules |
| **API Documentation** | [openapi.md](references/openapi.md) | `describeEndpoint`, response schemas in DTOs, what is generated automatically, `/api/docs`, enforcement |
| **Testing Standards** | [testing.md](references/testing.md) | `bun:test` controller/service/repo mocking, blackbox E2E HTTP testing |

