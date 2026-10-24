# Unit & E2E Testing — Implementation Guide

Read this file when: writing new test suites, mocking dependencies, or validating test coverage.

---

## 1. Test Architecture Overview

- **Test Runner**: Native Bun Test (`bun:test`)
- **Execution Command**: `bun test`
- **Coverage Command**: `bun run test:cov` (coverage gate; thresholds in `scripts/check-coverage.ts`)
- **Unit Tests**: Co-located with implementation files (`src/**/*.test.ts`).
- **E2E Tests**: Blackbox HTTP tests through `createApp()` located under `test/*.e2e.test.ts` (hermetic: repositories and services faked where a real service would be needed).
- **Integration Tests** (real PostgreSQL + Redis): `test/integration/*.int.ts`, run only by `bun run test:int` (never by `bun test`, never in the coverage gate) — §7.
- **Hermetic by default**: `bunfig.toml` preloads `test/setup/hermetic-env.ts`, pointing `DATABASE_URL` / `REDIS_*` at a closed local port. Bun loads the local env file into `bun test` too; without the preload the suite would reach the developer's real database. `test/hermetic-env.test.ts` guards it. Only the integration suite (§7) reaches real services, in a database it creates for the run.
- **No `mock.module()`** (ESLint): Bun applies it to every later test file in the process. Inject dependencies instead — services/controllers take constructor defaults (`new UsersService(fakeRepo)`), functions take parameters (`pingDatabase(timeout, fakeClient)`), the cache takes a client (`new CacheService(fakeClient)`), repositories take the SQL recorder's `TransactionHost`.
- **Repositories → SQL recorder** (`test/helpers/sql-recorder.ts`): `createSqlRecorder()` gives a real Drizzle instance on a fake driver; assert `recorder.statements` (SQL + params, `BEGIN`/`COMMIT`/`ROLLBACK`), queue rows with `respondWith(rowOf(table, entity))`. Guide and example: [transactions.md §4](transactions.md#4-unit-testing-repositories-with-the-sql-recorder).

---

## 2. Unit Testing Controllers

Controllers return pure `ApiResponse` wrapped by `asyncHandler`. Test them by supplying a lightweight mock `Context`:

```typescript
import { describe, expect, it } from 'bun:test';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';

describe('UsersController (Unit)', () => {
  const mockService = {
    createUser: async () => ({ id: '123', email: 'test@example.com', fullName: 'Test' }),
  } as unknown as UsersService;

  const controller = new UsersController(mockService);
  const mockNext = (async () => {}) as any;

  it('create should return ApiResponse with status 201', async () => {
    const mockContext = {
      get: (key: string) =>
        key === 'validatedBody' ? { email: 'test@example.com', fullName: 'Test', password: 'secretpassword' } : undefined,
      json: (data: unknown, status: number) => ({ data, status }),
    } as any;

    const result = (await controller.create(mockContext, mockNext)) as unknown as {
      status: number;
      data: { success: boolean; data: { email: string } };
    };

    expect(result.status).toBe(201);
    expect(result.data.success).toBe(true);
  });
});
```

---

## 3. Unit Testing Services

Services accept typed DTOs and return entities or throw semantic `ApiError` instances:

```typescript
import { describe, expect, it } from 'bun:test';
import { UsersService } from './users.service';
import { ConflictError } from '../../core/errors';
import type { UsersRepository } from './users.repository';

describe('UsersService (Unit)', () => {
  it('should throw ConflictError if email already exists', async () => {
    const mockRepo = {
      findByEmail: async () => ({ id: '123', email: 'taken@example.com' }),
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);

    expect(
      service.createUser({ email: 'taken@example.com', fullName: 'Test', password: 'secretpassword' })
    ).rejects.toThrow(ConflictError);
  });
});
```

---

## 4. Contract Guards That Run With Every Test Suite

- `test/openapi.e2e.test.ts` — every route of `createApp()` is documented (summary + 2xx via `describeEndpoint()`), snake_case everywhere, 400 on validated routes, common headers present. A new route without `describeEndpoint()` fails here; see [openapi.md](openapi.md).
- `src/database/schema/schema-conventions.test.ts` — every exported table: indexed foreign keys, ids from the helpers, sequential ids only in `APPEND_ONLY_TABLES`, no `serial`, no plain unique on soft-deleted tables, partition-ready `record_changes`. See [database.md](database.md).
- `test/migrations.test.ts` — the generated SQL: no `CREATE SCHEMA`, tables in `public`, no database UUID defaults, `record_changes` CHECKs match the code.
- `test/platform.e2e.test.ts` — the `createApp()` pipeline: security headers, CORS off by default, 413 before the route, rate limit failing open.
- `test/default-deny.e2e.test.ts` — every route of `createApp()` under `<API_BASE_PATH>/v1` answers 401 without a token unless it is in `PUBLIC_ROUTES`; partner routes answer 401 `ERR_PARTNER_HEADERS_MISSING` without partner headers, even with a bearer token; every webhook route belongs to a vendor in `WEBHOOK_VENDORS` and answers 401 `ERR_WEBHOOK_SIGNATURE_INVALID` without its signature (no vendor — a fresh project after `bun run setup` — means no webhook route).
- `test/partner-gateway.e2e.test.ts` — signed partner requests through `createApp()` (credential lookup spied); every refusal branch of `partnerAuth()` is unit-tested in `src/core/middlewares/partner-auth.test.ts` with an in-memory nonce/counter cache.
- `test/vendor-webhooks.e2e.test.ts` — signed Demo Pay webhooks through `createApp()` (service spied): accepted as `webhook:demo-pay`; forged, tampered, stale or unsigned → 401.
- `test/structure.test.ts` — every file name (kebab-case per dot segment), module files `<module>[-<qualifier>][.partner|.webhook].<role>[.test].ts`, integration files `<vendor>.<role>.ts`, no module named like a vendor, `*.partner.routes.ts` routers only under `/v1/partner` (and nothing else there), `*.webhook.routes.ts` only under `/webhooks`. Also run by `verify:scaffold` on the generated modules.
- `test/partner-guide.test.ts` — `docs/partner-integration-guide.md` publishes the same signing vectors (`test/helpers/partner-signing-vectors.ts`, shared with the unit tests), the four headers and every `ERR_PARTNER_*` code.
- `test/hermetic-env.test.ts` — the preload points the database and Redis at a closed port, whatever the local env file says.
- `test/outbound.e2e.test.ts` — the outbound contract end to end: a vendor 401 becomes 502 without the vendor's body, and the inbound `X-Request-ID` reaches the vendor. Adapter tests run against a local fake vendor (`Bun.serve`); see [integrations.md](integrations.md).

## 5. Module E2E Tests (`test/<name>.e2e.test.ts`)

A module's HTTP contract is tested through `createApp()` with its service stubbed by `spyOn` on the exported singleton — never `mock.module()`, which leaks into later files. Restore every spy in `afterAll`. Routes are protected by default (default-deny), so wrap the app with `authorize(createApp(), role?, userId?)` (`test/helpers/authorized-app.ts`): every request then carries a Bearer token unless it sets its own `Authorization` header; a role test signs in as `'user'` and expects 403 `ERR_ROLE_FORBIDDEN`. See `test/users.e2e.test.ts` (standalone) and `test/orders.e2e.test.ts` (header + detail: IDOR → 404, sync, nested snake_case keys).

```typescript
beforeAll(async () => {
  spies.push(spyOn(ordersService, 'listItems').mockImplementation(async (id) => { … }));
  app = await authorize(createApp(), 'admin');
});
afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});
```

Repository behaviour is not re-tested per module: the bases are tested once (`src/database/*.repository.test.ts`) against test-only tables in `test/helpers/repository-fixtures.ts` (`test_orders` header, `test_order_lines` detail, `test_events` record); a module repository test checks only what the module adds.

## 6. Blackbox E2E HTTP Testing (`test/health.e2e.test.ts`)

Public routes (health, `PUBLIC_ROUTES`) need no token: instantiate a fresh `createApp()` and dispatch requests via `app.request()`:

```typescript
import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';

describe('Health E2E Probe', () => {
  it('GET /api/health/liveness should return 200 with UP status', async () => {
    const app = createApp();
    const res = await app.request('/api/health/liveness');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { status: string } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('UP');
  });
});
```

---

## 7. Integration Suite on Real Services (`bun run test:int`)

What the SQL recorder and the fakes cannot prove — row locks, rollbacks, partial unique indexes, the audit trail as stored, refresh-token races, the Lua script, nonce claims, fail-open on a dropped Redis connection — is tested against a real PostgreSQL and Redis (plan step 6.1).

- **Run**: `bun run test:int` (all files), `bun run test:int partner` (file names containing `partner`), `--keep-db` to inspect the database afterwards, `--dry-run` to print the targets a run would use (passwords never printed). CI job `integration` runs it with PostgreSQL 16 + Redis 7 service containers; locally native services are fine (the oldest Redis in use so far is 3.0 — the scripts need ≥ 2.6).
- **Services**: `TEST_DATABASE_URL` (an existing database on the test server — the runner only creates and drops databases from it) and `TEST_REDIS_HOST` / `TEST_REDIS_PORT` / `TEST_REDIS_PASSWORD` / `TEST_REDIS_DB`. Each service comes whole from one side — Redis from `TEST_REDIS_*` as soon as `TEST_REDIS_HOST` is set, never a mix with `REDIS_*` (a local password never travels to another server). Unset, they fall back to `DATABASE_URL` / `REDIS_*` **only on a developer machine** (`NODE_ENV` `development` or `test`) **and only when those point at this machine**; `NODE_ENV=production` is refused. A server (staging, production VPS) never runs this suite — CI does, against its own service containers.
- The same service rules serve `bun run acceptance` ([manual-acceptance.md](manual-acceptance.md)); both runners read them from `scripts/lib/test-services.ts`.
- **Disposable per run** (`scripts/test-integration.ts`): `CREATE DATABASE <name>_it_<run>` (marked with a comment) → `bun test --preload test/integration/setup.ts <files>` → `DROP DATABASE`. Databases of killed runs are dropped by a later run after an hour — only ones carrying the marker comment, never a look-alike name. Redis keys use the prefix `<APP_NAME>:int-test:<run>` and are deleted with SCAN + DEL (never `FLUSH*`). The development database and keys are never touched.
- **Preload** (`test/integration/setup.ts`, after the hermetic one): refuses any database not named `*_it_<run>`, points `DATABASE_URL` / `REDIS_*` at the run's targets, applies the real migrations (`drizzle/`), creates the generic fixture tables of `test/helpers/repository-fixtures.ts` (DDL generated with `drizzle-kit/api`), connects Redis, and closes both connections after the last file.
- **Writing a test**: one file per area (`<area>.int.ts`); data from `unique()` (rows stay until the database is dropped, so never assume an empty table); writes as a request with `asActor()`; through HTTP with `createApp().request()` — the real pipeline, repositories and Redis, no spies. Helpers: `test/helpers/integration.ts`.
- **When to add one**: a module whose repository has its own queries (`*.queries.ts`, custom `where`), locks, unique indexes (`activeUniqueIndex`, permanent uniques) or Redis behaviour beyond `CacheService` gets `test/integration/<module>.int.ts`. Generic base-repository behaviour is already covered (`data-layer.int.ts`). `bun run test:int` is required before finishing a change to repositories, transactions, migrations, auth, the partner gateway or the cache ([quality-gates.md](quality-gates.md) §1).
- **Enforced**: ESLint rejects `.rejects` / `.resolves`, `spyOn` and `mock` under `test/integration/`; `test/structure.test.ts` keeps `*.int.ts` directly in `test/integration/` (anywhere else they would never run) and nothing but `<area>.int.ts` + `setup.ts` there.
- **Never `expect(promise).rejects` / `.resolves` here**: in Bun 1.3.0 they wait on the promise in a way that can stall real socket I/O — the transaction stays `idle in transaction` and the test times out. Await first with `rejectionOf(promise)`, then assert on the error.
