# Scaffold Variant — Dependent (1:N)

Use this variant for rows that have their own page but always belong to one parent, added any time after the parent exists: an application's members, a project's tasks, a customer's addresses (plan D33). Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. This file replaces Steps 2–14 of `SKILL.md`. For **at most one** row per parent (a form section) use `dependent-one.md` (`--one`).

Generate it with `bun run scaffold module <segment> --parent=<parent-name>`: the parent is an existing standalone or header module and is **not edited** — the module lives in a subfolder of it, `src/modules/<parent-name>/<name>/` (one level, files named after the subfolder; `test/structure.test.ts`). `<name>` is the module's own name, **the parent's singular + `<segment>`** (`order-documents` for `documents` under `orders`; typing the full name gives the same module): its table and flat routes never collide with another parent's (`invoice-documents`), exactly as a header-detail's `order_items`. Only the route under the parent keeps the short `<segment>`.

- **Table**: standalone shape (`uuidPrimaryKey` + `timestamps` + `auditColumns` + `softDelete`) plus `parentReference('<parent_snake_singular>_id')`, indexed.
- **Repository**: `DependentRepository` — reads see a row only while its parent is live and inside `parentScope()`; writes lock the parent first and call `assertParentWritable(parent)`; the parent reference never changes; updates, deletes and restores are audited under the parent (`docs/standards/database.md` §6).
- **Routes** (shallow nesting): the collection under the parent — `GET` / `POST /<parent-name>/:<parentCamelSingular>Id/<segment>`; one row by its own id — `GET` / `PATCH` / `DELETE /<name>/:id`, `POST /<name>/:id/restore`. The parent comes from the path, never from the body. No list across parents is generated: add one deliberately, with the ownership filter it needs.
- **Ownership**: when the parent belongs to a user (or a partner), override `parentScope()` in the repository; another owner's parent is then a 404 for every read and write of its rows.

Extra placeholders, from `--parent=<parent-name>`: `<parent-name>` (kebab plural, route), `<parentCamelPlural>` (table variable), `<parent_snake_plural>` (table), `<parentCamelSingular>` / `<ParentPascalSingular>` (parameter `<parentCamelSingular>Id`, type), `<parent_snake_singular>` (column `<parent_snake_singular>_id`), and `<segment>` (the short name of the route under the parent; `<name>` and the other placeholders are the full, parent-prefixed name). Verified by `bun run verify:scaffold`.

---

### Step 1: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

The parent reference comes from `parentReference()` (`ON DELETE restrict`) and needs an index starting with it — the schema convention test fails without it.

```typescript
import { index, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, parentReference, softDelete, timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';
import { <parentCamelPlural> } from './<parent-name>.schema';

/** Dependent: own page and soft delete, always under one <parentCamelSingular> (DependentRepository). */
export const <camelPlural> = appTable(
  '<snake_plural>',
  {
    id: uuidPrimaryKey(),
    <parentCamelSingular>Id: parentReference('<parent_snake_singular>_id', () => <parentCamelPlural>.id),
    name: varchar('name', { length: 255 }).notNull(),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [index('<snake_plural>_<parent_snake_singular>_idx').on(table.<parentCamelSingular>Id)],
);

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
```

Re-export it in `src/database/schema/domain/index.ts` (`export * from './<name>.schema';`), then `bun run db:generate`.

---

### Step 2: Create DTOs (`src/modules/<parent-name>/<name>/<name>.dto.ts`)

The parent is a path parameter of the collection routes; the body never carries it.

```typescript
import { z } from 'zod';
import { isoInstant } from '../../../core/openapi';

/** The parent in the path: `/<parent-name>/:<parentCamelSingular>Id/<segment>`. */
export const <camelSingular>ParentParamSchema = z.object({
  <parentCamelSingular>Id: z.string().uuid(),
});

export type <PascalSingular>ParentParamDto = z.infer<typeof <camelSingular>ParentParamSchema>;

export const create<PascalSingular>Schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type Create<PascalSingular>Dto = z.infer<typeof create<PascalSingular>Schema>;

/** Partial update: only the given fields change. */
export const update<PascalSingular>Schema = create<PascalSingular>Schema
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type Update<PascalSingular>Dto = z.infer<typeof update<PascalSingular>Schema>;

export const <camelSingular>ResponseSchema = z.object({
  id: z.string().uuid(),
  <parentCamelSingular>Id: z.string().uuid(),
  name: z.string(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type <PascalSingular>Response = z.infer<typeof <camelSingular>ResponseSchema>;
```

---

### Step 3: Create Messages (`src/modules/<parent-name>/<name>/<name>.messages.ts`)

Replace `<PascalSingular>` in the Indonesian texts with the proper Indonesian noun.

```typescript
import type { LocalizedMessage } from '../../../core/i18n';

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

### Step 4: Create Repository (`src/modules/<parent-name>/<name>/<name>.repository.ts`)

`DependentRepository` provides `findById`, `findPageForParent`, `countForParent`, `createForParent`, `updateById`, `softDeleteById` and `restoreById` (`docs/standards/database.md` §6). Ownership and parent state are the two hooks — leave them out until the domain needs them.

```typescript
import { DependentRepository, defaultTxHost, type TransactionHost } from '../../../database';
import { <camelPlural>, <parentCamelPlural> } from '../../../database/schema';

/**
 * <PascalPlural> of a <parentCamelSingular>. When the domain needs it, override:
 * - `parentScope()` — ownership of the parent (e.g. its `createdBy` is the caller): another
 *   owner's <parentCamelSingular> is then a 404 for every read and write;
 * - `assertParentWritable(parent)` — refuse writes by the parent's state (e.g. submitted).
 */
export class <PascalPlural>Repository extends DependentRepository<
  typeof <camelPlural>,
  typeof <parentCamelPlural>
> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, <parentCamelPlural>, <camelPlural>.<parentCamelSingular>Id, txHost);
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
```

---

### Step 5: Create Transformer (`src/modules/<parent-name>/<name>/<name>.transformer.ts`)

```typescript
import type { <PascalSingular> } from '../../../database/schema';
import type { <PascalSingular>Response } from './<name>.dto';

export const to<PascalSingular>Response = (entity: <PascalSingular>): <PascalSingular>Response => ({
  id: entity.id,
  <parentCamelSingular>Id: entity.<parentCamelSingular>Id,
  name: entity.name,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const to<PascalSingular>ListResponse = (entities: <PascalSingular>[]): <PascalSingular>Response[] =>
  entities.map(to<PascalSingular>Response);
```

---

### Step 6: Create Service (`src/modules/<parent-name>/<name>/<name>.service.ts`)

A parent that is missing, deleted or out of scope is a `NotFoundError` from the repository (parent-scoped calls) or `null` (calls by id) — both a 404, so another owner's data is never confirmed to exist.

```typescript
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';
import { NotFoundError } from '../../../core/errors';
import type { PaginationQueryDto } from '../../../core/dto/common.dto';
import type { Create<PascalSingular>Dto, Update<PascalSingular>Dto } from './<name>.dto';
import { <camelSingular>NotFoundMessage } from './<name>.messages';
import type { <PascalSingular> } from '../../../database/schema';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  async create<PascalSingular>(<parentCamelSingular>Id: string, dto: Create<PascalSingular>Dto): Promise<<PascalSingular>> {
    return this.repository.createForParent(<parentCamelSingular>Id, { ...dto });
  }

  async list<PascalPlural>(
    <parentCamelSingular>Id: string,
    query: PaginationQueryDto,
  ): Promise<{ records: <PascalSingular>[]; total: number }> {
    const [records, total] = await Promise.all([
      this.repository.findPageForParent(<parentCamelSingular>Id, { page: query.page, perPage: query.perPage }),
      this.repository.countForParent(<parentCamelSingular>Id),
    ]);
    return { records, total };
  }

  async get<PascalSingular>ById(id: string): Promise<<PascalSingular>> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return record;
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

### Step 7: Create Controller (`src/modules/<parent-name>/<name>/<name>.controller.ts`)

```typescript
import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../../core/middlewares';
import { ApiResponse } from '../../../core/response';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';
import { to<PascalSingular>Response, to<PascalSingular>ListResponse } from './<name>.transformer';
import type { PaginationQueryDto, UuidParamDto } from '../../../core/dto/common.dto';
import type {
  Create<PascalSingular>Dto,
  <PascalSingular>ParentParamDto,
  Update<PascalSingular>Dto,
} from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';

export class <PascalPlural>Controller {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  create = asyncHandler(async (c) => {
    const { <parentCamelSingular>Id } = getValidatedParams<<PascalSingular>ParentParamDto>(c);
    const dto = getValidatedBody<Create<PascalSingular>Dto>(c);
    const created = await this.service.create<PascalSingular>(<parentCamelSingular>Id, dto);

    return new ApiResponse(to<PascalSingular>Response(created), <UPPER_SINGULAR>_MESSAGES.CREATED, 201);
  });

  list = asyncHandler(async (c) => {
    const { <parentCamelSingular>Id } = getValidatedParams<<PascalSingular>ParentParamDto>(c);
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.list<PascalPlural>(<parentCamelSingular>Id, query);
    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(to<PascalSingular>ListResponse(records), <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages,
    });
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.get<PascalSingular>ById(param.id);

    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.RETRIEVED, 200);
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

### Step 8: Create Routes (`src/modules/<parent-name>/<name>/<name>.routes.ts`)

Two routers from one file: the collection under the parent and the rows by their own id (shallow nesting). Both are registered in `src/app.ts`; the parent module is never edited.

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../../core/dto/common.dto';
import { validate } from '../../../core/middlewares';
import { describeEndpoint } from '../../../core/openapi';
import { <camelPlural>Controller } from './<name>.controller';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';
import {
  create<PascalSingular>Schema,
  <camelSingular>ParentParamSchema,
  <camelSingular>ResponseSchema,
  update<PascalSingular>Schema,
} from './<name>.dto';

const tags = ['<PascalPlural>'];

/** Mounted on `/<parent-name>/:<parentCamelSingular>Id/<segment>`: the <parentCamelSingular>'s <camelPlural>. */
const parentRouter = new Hono();

parentRouter.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Add a <camelSingular> to a <parentCamelSingular>',
    response: { status: 201, description: 'Created', message: <UPPER_SINGULAR>_MESSAGES.CREATED, data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: <camelSingular>ParentParamSchema, body: create<PascalSingular>Schema }),
  <camelPlural>Controller.create,
);
parentRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: "List a <parentCamelSingular>'s <camelPlural> (paginated)",
    response: { status: 200, description: 'A page', message: <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, paginatedItem: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: <camelSingular>ParentParamSchema, query: paginationQuerySchema }),
  <camelPlural>Controller.list,
);

/** Mounted on `/<name>`: one <camelSingular> by its own id. */
const router = new Hono();

router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a <camelSingular> by id',
    response: { status: 200, description: 'Found', message: <UPPER_SINGULAR>_MESSAGES.RETRIEVED, data: <camelSingular>ResponseSchema },
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
    response: { status: 200, description: 'Updated', message: <UPPER_SINGULAR>_MESSAGES.UPDATED, data: <camelSingular>ResponseSchema },
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
    response: { status: 200, description: 'Deleted', message: <UPPER_SINGULAR>_MESSAGES.DELETED, data: z.null() },
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
    response: { status: 200, description: 'Restored', message: <UPPER_SINGULAR>_MESSAGES.RESTORED, data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.restore,
);

export { parentRouter as <camelPlural>ParentRouter, router as <camelPlural>Router };
```

---

### Step 9: Register Routes in `src/app.ts`

```typescript
import { <camelPlural>ParentRouter, <camelPlural>Router } from './modules/<parent-name>/<name>/<name>.routes';

// Inside createApp(), next to the other modules on the versioned router
v1.route('/<parent-name>/:<parentCamelSingular>Id/<segment>', <camelPlural>ParentRouter);
v1.route('/<name>', <camelPlural>Router);
```

---

### Step 10: Create Repository Test (`src/modules/<parent-name>/<name>/<name>.repository.test.ts`)

The generic behaviour is tested once in `src/database/dependent.repository.test.ts` (and on PostgreSQL in `test/integration/data-layer.int.ts`); here only the wiring: this table, its parent table and the parent column.

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { NotFoundError } from '../../../core/errors';
import { <PascalPlural>Repository } from './<name>.repository';
import { createSqlRecorder } from '../../../../test/helpers/sql-recorder';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

describe('<PascalPlural>Repository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new <PascalPlural>Repository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('reads a live row only while its <parentCamelSingular> is live', async () => {
    expect(await repository.findById(ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain(
      'where ("<snake_plural>"."deleted_at" is null and exists (select 1 from "<parent_snake_plural>" where ("<parent_snake_plural>"."id" = "<snake_plural>"."<parent_snake_singular>_id" and "<parent_snake_plural>"."deleted_at" is null)) and "<snake_plural>"."id" = $1)',
    );
  });

  it('creates under a live <parentCamelSingular> only (locked first, rolled back otherwise)', async () => {
    let failure: unknown;
    try {
      await repository.createForParent(PARENT_ID, { name: 'Sample' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(NotFoundError);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'BEGIN',
      expect.stringMatching(/^select .* from "<parent_snake_plural>" where .* for share$/) as string,
      'ROLLBACK',
    ]);
    expect(recorder.statements.at(1)?.params).toEqual([PARENT_ID]);
  });
});
```

---

### Step 11: Create Service Test (`src/modules/<parent-name>/<name>/<name>.service.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import type { <PascalSingular> } from '../../../database/schema';
import type { <PascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

const record: <PascalSingular> = {
  id: ID,
  <parentCamelSingular>Id: PARENT_ID,
  name: 'Sample',
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
    createForParent: async (parentId: string, values: unknown) => {
      calls.push(['createForParent', parentId, values]);
      return record;
    },
    findPageForParent: async (parentId: string, options: unknown) => {
      calls.push(['findPageForParent', parentId, options]);
      return [record];
    },
    countForParent: async () => 1,
    findById: async (id: string) => (id === ID ? record : null),
    updateById: async (id: string, values: Partial<<PascalSingular>>) => {
      calls.push(['updateById', id, values]);
      return id === ID ? { ...record, ...values } : null;
    },
    softDeleteById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => (id === ID ? record : null),
  }) as unknown as <PascalPlural>Repository;

describe('<PascalPlural>Service (Unit)', () => {
  it('creates under the <parentCamelSingular> from the path', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect(await service.create<PascalSingular>(PARENT_ID, { name: 'Sample' })).toBe(record);
    expect(calls).toEqual([['createForParent', PARENT_ID, { name: 'Sample' }]]);
  });

  it("lists a page of the <parentCamelSingular>'s rows with the total", async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect(await service.list<PascalPlural>(PARENT_ID, { page: 2, perPage: 10 })).toEqual({
      records: [record],
      total: 1,
    });
    expect(calls).toEqual([['findPageForParent', PARENT_ID, { page: 2, perPage: 10 }]]);
  });

  it('finds, updates, deletes and restores by id; each is a NotFoundError for a missing row', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect(await service.get<PascalSingular>ById(ID)).toBe(record);
    expect((await service.update<PascalSingular>(ID, { name: 'Renamed' })).name).toBe('Renamed');
    expect(calls).toContainEqual(['updateById', ID, { name: 'Renamed' }]);
    await service.delete<PascalSingular>(ID);
    expect(await service.restore<PascalSingular>(ID)).toBe(record);
    for (const attempt of [
      service.get<PascalSingular>ById(MISSING),
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

### Step 12: Create Transformer Test (`src/modules/<parent-name>/<name>/<name>.transformer.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { <PascalSingular> } from '../../../database/schema';
import { <camelSingular>ResponseSchema } from './<name>.dto';
import { to<PascalSingular>ListResponse, to<PascalSingular>Response } from './<name>.transformer';

const record: <PascalSingular> = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  <parentCamelSingular>Id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a',
  name: 'Sample',
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
    expect(response.<parentCamelSingular>Id).toBe(record.<parentCamelSingular>Id);
  });

  it('maps a list', () => {
    expect(to<PascalSingular>ListResponse([record, record])).toHaveLength(2);
  });
});
```

---

### Step 13: Create Controller Test (`src/modules/<parent-name>/<name>/<name>.controller.test.ts`)

Both routers on a bare Hono app, mounted on the same paths as in `src/app.ts`; the service spied.

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../../core/middlewares';
import type { <PascalSingular> } from '../../../database/schema';
import { <camelSingular>NotFoundMessage } from './<name>.messages';
import { <camelPlural>ParentRouter, <camelPlural>Router } from './<name>.routes';
import { <camelPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

const record: <PascalSingular> = {
  id: ID,
  <parentCamelSingular>Id: PARENT_ID,
  name: 'Sample',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const app = new Hono();
app.use('*', requestContextMiddleware());
app.route('/<parent-name>/:<parentCamelSingular>Id/<segment>', <camelPlural>ParentRouter);
app.route('/<name>', <camelPlural>Router);
app.onError(globalErrorHandler);

const collection = `/<parent-name>/${PARENT_ID}/<segment>`;

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('<PascalPlural>Controller (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];
  const parents: string[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(<camelPlural>Service, 'create<PascalSingular>').mockImplementation(async (parentId) => {
        parents.push(parentId);
        return record;
      }),
      spyOn(<camelPlural>Service, 'list<PascalPlural>').mockImplementation(async () => ({ records: [record], total: 1 })),
      spyOn(<camelPlural>Service, 'get<PascalSingular>ById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
        return record;
      }),
      spyOn(<camelPlural>Service, 'update<PascalSingular>').mockImplementation(async () => record),
      spyOn(<camelPlural>Service, 'delete<PascalSingular>').mockImplementation(async () => undefined),
      spyOn(<camelPlural>Service, 'restore<PascalSingular>').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('creates under the <parentCamelSingular> of the path (201, snake_case)', async () => {
    const res = await app.request(collection, send('POST', { name: 'Sample' }));
    const body = (await res.json()) as { data: { <parent_snake_singular>_id: string } };

    expect(res.status).toBe(201);
    expect(body.data.<parent_snake_singular>_id).toBe(PARENT_ID);
    expect(parents).toEqual([PARENT_ID]);
  });

  it('rejects an invalid parent id or body (400) before the service', async () => {
    expect((await app.request('/<parent-name>/not-a-uuid/<segment>', send('POST', { name: 'x' }))).status).toBe(400);
    expect((await app.request(collection, send('POST', {}))).status).toBe(400);
  });

  it("lists the <parentCamelSingular>'s rows with pagination meta", async () => {
    const res = await app.request(`${collection}?page=1&per_page=10`);
    const body = (await res.json()) as { meta: unknown };

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ current_page: 1, per_page: 10, total_items: 1, total_pages: 1 });
  });

  it('gets by its own id, and a missing id is a 404', async () => {
    expect((await app.request(`/<name>/${ID}`)).status).toBe(200);
    const res = await app.request(`/<name>/${MISSING}`);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('updates, deletes and restores by its own id', async () => {
    expect((await app.request(`/<name>/${ID}`, send('PATCH', { name: 'Renamed' }))).status).toBe(200);
    expect((await app.request(`/<name>/${ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/<name>/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });
});
```

---

### Step 14: Verify the Quality Gate

Same as `SKILL.md` Step 15. When you add `parentScope()` or `assertParentWritable()`, add a test for it — and an integration test when the rule depends on real locks or data (`docs/standards/testing.md` §7).
