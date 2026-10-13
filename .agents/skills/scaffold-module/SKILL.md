---
name: scaffold-module
description: Scaffold a new feature/domain module under src/modules/<name>/ (schema, DTO, repository, service, transformer, controller, routes, tests) with bun run scaffold. Use when asked to create, add or scaffold a module, resource or CRUD endpoint, a header with details, a child / dependent module of an existing one (its own pages under a parent, --parent), a partner endpoint, a vendor webhook receiver, or an outbound vendor integration (src/integrations/<name>/).
---

# Scaffold Feature Module

Use this skill when asked to create, add, or scaffold a new domain/feature module under `src/modules/<module-name>/`.

**Pick the variant first**: `docs/standards/new-module.md` §1 (table kinds, templates, working examples). Standalone tables use Steps 2–12 below; the other variants are in `references/` (`header-detail.md`, `dependent.md`, `dependent-one.md`, `record.md`, `partner.md`, `webhook.md`, `integration.md`).

**Then generate with the CLI — do not copy the templates by hand**: `bun run scaffold <module|partner|webhook|integration> <name> [options]` (commands, naming rules, refusals: `docs/standards/new-module.md` §2; `--dry-run` first to check the plan and the singular it derived). It writes every file of the variant, registers it in the shared files, formats the result and prints the next steps. Your work starts after it: the domain fields, rules, messages and tests, following the standards each step links, then `bun run validate:full`.

The order of work and the standard behind each step: `docs/standards/new-module.md` §3. This file holds only the template code the CLI reads (verified by `bun run verify:scaffold`, which runs the CLI); the rules each step relies on are linked, never restated. Changing a template changes what the CLI generates: run `bun run verify:scaffold` afterwards.

---

## 1. Mandatory File Structure

Every feature module with write capabilities (`INSERT`, `UPDATE`, `DELETE`) **MUST** include:

```
src/modules/<name>/
├── <name>.controller.ts
├── <name>.controller.test.ts
├── <name>.dto.ts
├── <name>.messages.ts
├── <name>.repository.ts
├── <name>.repository.test.ts
├── <name>.routes.ts
├── <name>.service.ts
├── <name>.service.test.ts
├── <name>.transformer.ts
└── <name>.transformer.test.ts

src/database/schema/domain/
└── <name>.schema.ts
```

---

## 2. Step-by-Step Scaffolding Workflow

### Step 1: Define Module Identifiers
- **Module Name**: `kebab-case` (e.g. `products`, `flight-schedules`).
- **Route Prefix**: `<API_BASE_PATH>/v1/<kebab-case-plural>` (default `/api/v1/products`), registered on the `v1` router (`docs/standards/naming.md` §3).
- **Table Name**: Plural `snake_case` in PostgreSQL's `public` schema (e.g. `products`).
- **Messages constant**: `UPPER_SNAKE` singular + `_MESSAGES` (e.g. `PRODUCT_MESSAGES`) — written `<UPPER_SINGULAR>_MESSAGES` below.

---

### Step 2: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

Tables use `appTable` and the column helpers; a unique value on a soft-deleted table uses `activeUniqueIndex()`, never `.unique()` — `docs/standards/database.md` §2–3 (§6 for detail and record tables).

```typescript
import { boolean, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, softDelete, timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';

export const <camelPlural> = appTable('<snake_plural>', {
  id: uuidPrimaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps(),
  ...auditColumns(),
  ...softDelete(),
});

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
export type New<PascalSingular> = typeof <camelPlural>.$inferInsert;
```

**Re-Export in `src/database/schema/domain/index.ts`:**
```typescript
export * from './<name>.schema';
```

Then generate the migration: `bun run db:generate`.

---

### Step 3: Create DTOs with Zod (`src/modules/<name>/<name>.dto.ts`)

Fields are camelCase in TypeScript, snake_case on the wire; reuse `uuidParamSchema` / `paginationQuerySchema` (`src/core/dto/common.dto.ts`); dictionaries: `preserveKeys` — `docs/standards/http-contract.md` §2–3.

The response schema documents the endpoint and types the transformer (`isoInstant()` / `isoCalendarDate()` for time) — `docs/standards/openapi.md` §3.

```typescript
import { z } from 'zod';
import { isoInstant } from '../../core/openapi';

export const create<PascalSingular>Schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type Create<PascalSingular>Dto = z.infer<typeof create<PascalSingular>Schema>;

/** Partial update: only the given fields change. */
export const update<PascalSingular>Schema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    isActive: z.boolean(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type Update<PascalSingular>Dto = z.infer<typeof update<PascalSingular>Schema>;

export const <camelSingular>ResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type <PascalSingular>Response = z.infer<typeof <camelSingular>ResponseSchema>;
```

---

### Step 4: Create Messages (`src/modules/<name>/<name>.messages.ts`)

Every user-facing message is a `LocalizedMessage` (`{ id, en }`) — `docs/standards/http-contract.md` §6. Replace `<PascalSingular>` in the Indonesian texts with the proper Indonesian noun.

```typescript
import type { LocalizedMessage } from '../../core/i18n';

export const <UPPER_SINGULAR>_MESSAGES = {
  CREATED: { id: '<PascalSingular> berhasil dibuat', en: '<PascalSingular> created successfully' },
  RETRIEVED: { id: 'Data <PascalSingular> berhasil diambil', en: '<PascalSingular> retrieved successfully' },
  LIST_RETRIEVED: {
    id: 'Daftar <PascalSingular> berhasil diambil',
    en: '<PascalPlural> retrieved successfully',
  },
  UPDATED: { id: '<PascalSingular> berhasil diperbarui', en: '<PascalSingular> updated successfully' },
  DELETED: { id: '<PascalSingular> berhasil dihapus', en: '<PascalSingular> deleted successfully' },
  RESTORED: { id: '<PascalSingular> berhasil dipulihkan', en: '<PascalSingular> restored successfully' },
} as const satisfies Record<string, LocalizedMessage>;

export const <camelSingular>NotFoundMessage = (id: string): LocalizedMessage => ({
  id: `<PascalSingular> dengan ID '${id}' tidak ditemukan`,
  en: `<PascalSingular> with ID '${id}' not found`,
});
```

---

### Step 5: Create Repository (`src/modules/<name>/<name>.repository.ts`)

> Rules for module repositories (which base, no writes around it): `docs/standards/database.md` §6–7.

`BaseRepository` already provides `findById`, `findPage`, `count`, `create`, `updateById`, `softDeleteById` and `restoreById`; add only domain lookups, built on `this.scoped(...)`.

```typescript
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { <camelPlural> } from '../../database/schema';

export class <PascalPlural>Repository extends BaseRepository<typeof <camelPlural>> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, txHost);
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
```

---

### Step 6: Create Transformer (`src/modules/<name>/<name>.transformer.ts`)

```typescript
import type { <PascalSingular> } from '../../database/schema';
import type { <PascalSingular>Response } from './<name>.dto';

export const to<PascalSingular>Response = (entity: <PascalSingular>): <PascalSingular>Response => ({
  id: entity.id,
  name: entity.name,
  isActive: entity.isActive,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const to<PascalSingular>ListResponse = (entities: <PascalSingular>[]): <PascalSingular>Response[] =>
  entities.map(to<PascalSingular>Response);
```

---

### Step 7: Create Service (`src/modules/<name>/<name>.service.ts`)

Missing rows (`null`) become a localized `NotFoundError`; a unique collision (`isUniqueViolation(error)`) becomes a `ConflictError` — `docs/standards/http-contract.md` §5 (example: `src/modules/users/users.service.ts`).

```typescript
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';
import { NotFoundError } from '../../core/errors';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type { Create<PascalSingular>Dto, Update<PascalSingular>Dto } from './<name>.dto';
import { <camelSingular>NotFoundMessage } from './<name>.messages';
import type { <PascalSingular> } from '../../database/schema';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  async create<PascalSingular>(dto: Create<PascalSingular>Dto): Promise<<PascalSingular>> {
    return this.repository.create({ ...dto });
  }

  async get<PascalSingular>ById(id: string): Promise<<PascalSingular>> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return record;
  }

  async list<PascalPlural>(query: PaginationQueryDto): Promise<{ records: <PascalSingular>[]; total: number }> {
    const [records, total] = await Promise.all([
      this.repository.findPage({ page: query.page, perPage: query.perPage }),
      this.repository.count(),
    ]);
    return { records, total };
  }

  async update<PascalSingular>(id: string, dto: Update<PascalSingular>Dto): Promise<<PascalSingular>> {
    const updated = await this.repository.updateById(id, dto);
    if (!updated) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return updated;
  }

  async delete<PascalSingular>(id: string): Promise<void> {
    const deleted = await this.repository.softDeleteById(id);
    if (!deleted) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
  }

  async restore<PascalSingular>(id: string): Promise<<PascalSingular>> {
    const restored = await this.repository.restoreById(id);
    if (!restored) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return restored;
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 8: Create Controller (`src/modules/<name>/<name>.controller.ts`)

> **ESLint Guard**: DO NOT call `c.json()` inside controllers. Return `ApiResponse`.

```typescript
import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';
import { to<PascalSingular>Response, to<PascalSingular>ListResponse } from './<name>.transformer';
import type { PaginationQueryDto, UuidParamDto } from '../../core/dto/common.dto';
import type { Create<PascalSingular>Dto, Update<PascalSingular>Dto } from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';

export class <PascalPlural>Controller {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<Create<PascalSingular>Dto>(c);
    const created = await this.service.create<PascalSingular>(dto);

    return new ApiResponse(to<PascalSingular>Response(created), <UPPER_SINGULAR>_MESSAGES.CREATED, 201);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.get<PascalSingular>ById(param.id);

    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.RETRIEVED, 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.list<PascalPlural>(query);
    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(to<PascalSingular>ListResponse(records), <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages,
    });
  });

  update = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const dto = getValidatedBody<Update<PascalSingular>Dto>(c);
    const updated = await this.service.update<PascalSingular>(param.id, dto);

    return new ApiResponse(to<PascalSingular>Response(updated), <UPPER_SINGULAR>_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    await this.service.delete<PascalSingular>(param.id);

    return new ApiResponse(null, <UPPER_SINGULAR>_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restore<PascalSingular>(param.id);

    return new ApiResponse(to<PascalSingular>Response(restored), <UPPER_SINGULAR>_MESSAGES.RESTORED, 200);
  });
}

export const <camelPlural>Controller = new <PascalPlural>Controller();
```

---

### Step 9: Create Routes (`src/modules/<name>/<name>.routes.ts`)

Every route carries `describeEndpoint()` with the success envelope and the **domain** errors only — `docs/standards/openapi.md` §2.

Routes are protected by default; role checks with `requireRole(...)` after `describeEndpoint()` — `docs/standards/auth-and-inbound.md` §2.

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { <camelPlural>Controller } from './<name>.controller';
import {
  create<PascalSingular>Schema,
  update<PascalSingular>Schema,
  <camelSingular>ResponseSchema,
} from './<name>.dto';

const router = new Hono();
const tags = ['<PascalPlural>'];

router.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a <camelSingular>',
    response: { status: 201, description: 'Created', data: <camelSingular>ResponseSchema },
  }),
  validate({ body: create<PascalSingular>Schema }),
  <camelPlural>Controller.create,
);
router.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List <camelPlural> (paginated)',
    response: { status: 200, description: 'A page', paginatedItem: <camelSingular>ResponseSchema },
  }),
  validate({ query: paginationQuerySchema }),
  <camelPlural>Controller.list,
);
router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a <camelSingular> by id',
    response: { status: 200, description: 'Found', data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.getById,
);
router.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a <camelSingular> (only the given fields)',
    response: { status: 200, description: 'Updated', data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: update<PascalSingular>Schema }),
  <camelPlural>Controller.update,
);
router.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a <camelSingular> (soft delete; restorable)',
    response: { status: 200, description: 'Deleted', data: z.null() },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted <camelSingular>',
    response: { status: 200, description: 'Restored', data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.restore,
);

export { router as <camelPlural>Router };
```

---

### Step 10: Register Route in `src/app.ts`

```typescript
import { <camelPlural>Router } from './modules/<name>/<name>.routes';

// Inside createApp(), next to the other modules on the versioned router
v1.route('/<name>', <camelPlural>Router);
```

---

### Step 11: Create Repository Test (`src/modules/<name>/<name>.repository.test.ts`)

Repositories are tested with the SQL recorder; generic base behaviour is already covered, so test only the module's own lookups and the table wiring — `docs/standards/transactions.md` §4, `docs/standards/testing.md`.

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { <PascalPlural>Repository } from './<name>.repository';
import { <camelPlural>, type <PascalSingular> } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';

const COLUMNS =
  '"id", "name", "is_active", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';

describe('<PascalPlural>Repository (Unit)', () => {
  const sample: <PascalSingular> = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    name: 'Sample',
    isActive: true,
    createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
  };

  const recorder = createSqlRecorder();
  const repository = new <PascalPlural>Repository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('reads live rows of its table', async () => {
    recorder.respondWith([rowOf(<camelPlural>, sample)]);

    expect(await repository.findById(sample.id)).toEqual(sample);
    expect(recorder.statements).toEqual([
      {
        sql: `select ${COLUMNS} from "<snake_plural>" where ("<snake_plural>"."deleted_at" is null and "<snake_plural>"."id" = $1) limit $2`,
        params: [sample.id, 1],
      },
    ]);
  });

  it('creates rows stamped with the actor', async () => {
    recorder.respondWith([rowOf(<camelPlural>, sample)]);

    expect(await repository.create({ name: sample.name })).toEqual(sample);
    expect(recorder.statements.at(0)?.sql).toStartWith('insert into "<snake_plural>"');
    expect(recorder.statements.at(0)?.params).toContain('system');
  });
});
```

---

### Step 12: Create Service Test (`src/modules/<name>/<name>.service.test.ts`)

The repository is replaced by a fake that knows one live row, so every branch of the service — found and missing — runs without a database.

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import type { <PascalSingular> } from '../../database/schema';
import type { <PascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

const record: <PascalSingular> = {
  id: ID,
  name: 'Sample',
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** A repository that knows exactly one live row (`ID`) and records what it was asked. */
const fakeRepository = (calls: unknown[][]): <PascalPlural>Repository =>
  ({
    create: async (values: unknown) => {
      calls.push(['create', values]);
      return record;
    },
    findById: async (id: string) => (id === ID ? record : null),
    findPage: async (options: unknown) => {
      calls.push(['findPage', options]);
      return [record];
    },
    count: async () => 1,
    updateById: async (id: string, values: Partial<<PascalSingular>>) => {
      calls.push(['updateById', id, values]);
      return id === ID ? { ...record, ...values } : null;
    },
    softDeleteById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => (id === ID ? record : null),
  }) as unknown as <PascalPlural>Repository;

describe('<PascalPlural>Service (Unit)', () => {
  it('creates from the DTO', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect(await service.create<PascalSingular>({ name: 'Sample' })).toBe(record);
    expect(calls).toEqual([['create', { name: 'Sample' }]]);
  });

  it('finds by id; a missing row is a NotFoundError', async () => {
    const service = new <PascalPlural>Service(fakeRepository([]));

    expect(await service.get<PascalSingular>ById(ID)).toBe(record);
    expect(await rejectionOf(service.get<PascalSingular>ById(MISSING))).toBeInstanceOf(NotFoundError);
  });

  it('lists a page with the total', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect(await service.list<PascalPlural>({ page: 2, perPage: 10 })).toEqual({ records: [record], total: 1 });
    expect(calls).toEqual([['findPage', { page: 2, perPage: 10 }]]);
  });

  it('updates, deletes and restores; each is a NotFoundError for a missing row', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect((await service.update<PascalSingular>(ID, { isActive: false })).isActive).toBe(false);
    expect(calls).toContainEqual(['updateById', ID, { isActive: false }]);
    await service.delete<PascalSingular>(ID);
    expect(await service.restore<PascalSingular>(ID)).toBe(record);
    for (const attempt of [
      service.update<PascalSingular>(MISSING, { name: 'x' }),
      service.delete<PascalSingular>(MISSING),
      service.restore<PascalSingular>(MISSING),
    ]) {
      expect(await rejectionOf(attempt)).toBeInstanceOf(NotFoundError);
    }
  });
});
```

---

### Step 13: Create Transformer Test (`src/modules/<name>/<name>.transformer.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { <PascalSingular> } from '../../database/schema';
import { <camelSingular>ResponseSchema } from './<name>.dto';
import { to<PascalSingular>ListResponse, to<PascalSingular>Response } from './<name>.transformer';

const record: <PascalSingular> = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  name: 'Sample',
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

describe('to<PascalSingular>Response', () => {
  it('exposes exactly the response fields (no audit or soft-delete columns)', () => {
    const response = to<PascalSingular>Response(record);

    expect(Object.keys(response).sort()).toEqual(Object.keys(<camelSingular>ResponseSchema.shape).sort());
    expect(response.name).toBe('Sample');
  });

  it('maps a list', () => {
    expect(to<PascalSingular>ListResponse([record, record])).toHaveLength(2);
  });
});
```

---

### Step 14: Create Controller Test (`src/modules/<name>/<name>.controller.test.ts`)

The routes run on a bare Hono app with the request context and the error handler, the service spied: this covers routes, validation, controller and transformer together (snake_case on the wire, status codes, a `NotFoundError` becoming a 404). Authentication is not part of the module — `test/default-deny.e2e.test.ts` proves every route needs a token once mounted in `createApp()`.

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import type { <PascalSingular> } from '../../database/schema';
import { <camelSingular>NotFoundMessage } from './<name>.messages';
import { <camelPlural>Router } from './<name>.routes';
import { <camelPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

const record: <PascalSingular> = {
  id: ID,
  name: 'Sample',
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const app = new Hono();
app.use('*', requestContextMiddleware());
app.route('/', <camelPlural>Router);
app.onError(globalErrorHandler);

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('<PascalPlural>Controller (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(<camelPlural>Service, 'create<PascalSingular>').mockImplementation(async () => record),
      spyOn(<camelPlural>Service, 'get<PascalSingular>ById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
        return record;
      }),
      spyOn(<camelPlural>Service, 'list<PascalPlural>').mockImplementation(async () => ({ records: [record], total: 1 })),
      spyOn(<camelPlural>Service, 'update<PascalSingular>').mockImplementation(async () => record),
      spyOn(<camelPlural>Service, 'delete<PascalSingular>').mockImplementation(async () => undefined),
      spyOn(<camelPlural>Service, 'restore<PascalSingular>').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('creates (201) and answers in snake_case', async () => {
    const res = await app.request('/', send('POST', { name: 'Sample' }));
    const body = (await res.json()) as { data: { is_active: boolean; created_at: string } };

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ is_active: true, created_at: '2026-10-05T03:00:00.000Z' });
  });

  it('rejects invalid input (400) before the service', async () => {
    expect((await app.request('/', send('POST', {}))).status).toBe(400);
  });

  it('lists with pagination meta', async () => {
    const res = await app.request('/?page=1&per_page=10');
    const body = (await res.json()) as { meta: unknown };

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ current_page: 1, per_page: 10, total_items: 1, total_pages: 1 });
  });

  it('gets by id, and a missing id is a 404', async () => {
    expect((await app.request(`/${ID}`)).status).toBe(200);
    const res = await app.request(`/${MISSING}`);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('updates, deletes and restores', async () => {
    expect((await app.request(`/${ID}`, send('PATCH', { is_active: false }))).status).toBe(200);
    expect((await app.request(`/${ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });
});
```

---

### Step 15: Verify the Quality Gate

Add the integration test when the module has its own queries, locks, unique indexes or Redis behaviour — `docs/standards/testing.md` (§7 for `bun run test:int`).

These templates are verified mechanically by `bun run verify:scaffold` (also in CI): it runs `bun run scaffold` for each variant (this file, `references/header-detail.md`, `references/dependent.md`, `references/dependent-one.md`, `references/record.md`, `references/partner.md`, `references/webhook.md`) plus a vendor adapter (`references/integration.md`) and runs every gate, the generated tests and the schema conventions. After editing a template, the CLI, or any core API they use, run it.

The templates are formatted for a short module name; `bun run scaffold` formats what it writes. After your own edits (or when copying a block by hand), format before validating:
```bash
bun run format
bun run validate:full
```
Verify that all static checks pass and the coverage gate (`scripts/check-coverage.ts`) passes — every new file must be loaded by a test.
