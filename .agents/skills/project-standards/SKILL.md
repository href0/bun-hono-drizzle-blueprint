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
- **Validation**: [Zod](https://zod.dev) (v3.24+)
- **Structured Logging**: [Pino](https://github.com/pinojs/pino) with Correlation ID (`requestId`) and PII redaction
- **Cache**: Redis via [ioredis](https://github.com/redis/ioredis) with fail-open resilience
  - By default, this boilerplate uses a **standalone Redis instance** with no key prefix. This is sufficient for single-project deployments.
  - For multi-project setups sharing one Redis cluster, set `REDIS_KEY_PREFIX=<app-name>:<env>` in `.env`. The ioredis client auto-prepends this prefix to all keys, preventing collisions.
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
│   ├── config/                 # Environment validation (Zod schema fail-fast)
│   │   ├── env.config.ts
│   │   └── index.ts
│   ├── core/                   # Framework-agnostic building blocks (isolated layer)
│   │   ├── cache/              # Redis client, SSOT keys, and CacheService
│   │   ├── errors/             # Semantic ApiError class hierarchy
│   │   ├── http/               # HttpClientService with connection pool
│   │   ├── logger/             # Pino logger instance with PII redact
│   │   ├── middlewares/        # asyncHandler, errorHandler, validate, requestId, etc.
│   │   └── response/           # ApiResponse standardized JSON envelope
│   ├── database/               # Database persistence & connection layer
│   │   ├── connection.ts       # PostgreSQL connection pool & Drizzle instance
│   │   ├── transaction-host.ts # TransactionHost (AsyncLocalStorage context resolver)
│   │   ├── transactional.decorator.ts # @Transactional() and runInTransaction()
│   │   └── schema/             # Multi-schema Drizzle definitions
│   │       ├── domain/         # Primary domain tables (CRUD)
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
└── test/                       # E2E blackbox HTTP integration tests
```

---

## 3. Strict Layer Boundaries (`dependency-cruiser`)

Enforced by `.dependency-cruiser.cjs`:
1. **Core Layer**: Cannot import from `src/modules` or `src/database`.
2. **Utils Layer**: Pure functions only. Cannot import from `src/core`, `src/database`, or `src/modules`.
3. **Database Layer**: Cannot import from `src/modules` or `src/integrations`. Raw connection (`connection.ts`) cannot be imported by `src/modules`.
4. **Modules Layer**: Inbound domain modules. Cannot cross-import other domain modules directly (use services or shared core).
5. **Integrations Layer (`src/integrations/`)**: Outbound 3rd-party adapters (e.g. WhatsApp, Payment Gateways). Cannot import from `src/modules` or `src/database`. Cannot contain controllers or routes.

**Allowed dependency directions (implicit graph)**:
```
modules → integrations → core → config
modules → integrations → core → utils
modules → core → config
modules → core → utils (pure leaf, zero deps)
modules → database (via TransactionHost / health abstractions only; never connection.ts)
database → config
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

## 4. The 5 Core Architectural Rules

### Rule 1: Return, Don't Send (Pure Controllers)
- Controllers **MUST NEVER** call `c.json()` or `c.text()` directly.
- Controllers **MUST RETURN** an `ApiResponse` instance.
- Controllers **MUST** be wrapped in `asyncHandler`.
- Violation of this rule is blocked at the AST level by ESLint rule `no-c-json-in-controllers`.

```typescript
// users.controller.ts
export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateUserDto>(c);
    const user = await this.service.createUser(dto);
    const responseData = toUserResponse(user);

    return new ApiResponse(responseData, 'User created successfully', 201);
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
```

### Rule 3: Decoupled Repositories (TransactionHost)
- Repositories **MUST NOT** import `db` directly.
- Repositories **MUST** receive `TransactionHost` in constructor (defaulting to singleton `txHost`).
- All queries **MUST** execute against `this.txHost.tx`.
- This ensures seamless transactional atomicity under `@Transactional()` or `runInTransaction()`.
- Violation of this rule is blocked at the AST level by ESLint rule `no-direct-db-in-repositories`.

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
- Services **NEVER** accept the Hono `Context` object. They accept plain DTOs or primitive arguments.
- Services **NEVER** return HTTP responses.
- Business rule failures **MUST THROW** semantic `ApiError` instances:
  - `ValidationError` (HTTP 400 / schema validation failure)
  - `BadRequestError` (HTTP 400 / business logic failure)
  - `UnauthorizedError` (HTTP 401)
  - `ForbiddenError` (HTTP 403)
  - `NotFoundError` (HTTP 404)
  - `ConflictError` (HTTP 409)
  - `ExternalServiceError` (HTTP 502 / vendor failure)

```typescript
// users.service.ts
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(`Email '${dto.email}' is already registered`);
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

---

## 5. Standard Output Envelopes

### Success Envelope
```json
{
  "success": true,
  "status_code": 200,
  "message": "Users retrieved successfully",
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
  "message": "Validation Failed",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      { "field": "email", "message": "Invalid email address format" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  },
  "request_id": "req-muf1q47a-jntb8o",
  "timestamp": "2026-09-24T04:42:51.000Z"
}
```

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
| **Database & Multi-Schema** | [database.md](references/database.md) | Connection pool, `domain` vs `reference` schemas, `drizzle-kit` migration isolation |
| **Declarative Transactions** | [transactions.md](references/transactions.md) | `TransactionHost`, `AsyncLocalStorage`, `@Transactional()`, nested context |
| **Structured Logging** | [logging.md](references/logging.md) | Pino logger, `requestId` correlation, automatic PII redaction |
| **Redis Caching** | [redis-cache.md](references/redis-cache.md) | `CacheService`, `CACHE_KEYS` SSOT, fail-open resilience guarantee |
| **Raw SQL Queries** | [raw-queries.md](references/raw-queries.md) | Drizzle `sql` tagged template, parameterization safety, `*.queries.ts` files |
| **Testing Standards** | [testing.md](references/testing.md) | `bun:test` controller/service/repo mocking, blackbox E2E HTTP testing |

