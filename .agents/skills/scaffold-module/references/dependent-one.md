# Scaffold Variant — Dependent Section (1:1)

Use this variant for **at most one** row per parent, added any time after the parent exists — typically one step of a multi-step form: an application's contact person, a user's profile, an order's shipping details (plan D33). It is `dependent.md` (read it first) with a unique live row per parent. This file replaces Steps 2–14 of `SKILL.md`.

Generate it with `bun run scaffold module <plural> --parent=<parent-name> --one`: the parent is an existing standalone or header module and is **not edited** — the module lives in a subfolder of it, `src/modules/<parent-name>/<name>/` (one level, files named after the subfolder; `test/structure.test.ts`). `<name>` is the module's own name, the parent's singular + the plural you typed (`project-budgets` for `budgets` under `projects`, see `dependent.md`); only the route under the parent keeps the short singular `<segment>` (`budget`).

- **Table**: as `dependent.md`, but the parent column carries `activeUniqueIndex` (one **live** row per parent; it is also the index the foreign key needs). After a soft delete a new row may be created; restoring the old one while a live one exists is a unique violation → 409.
- **Repository**: `DependentRepository` — `findOneForParent`, `upsertForParent` (locks the parent `FOR UPDATE`, so concurrent saves of one parent queue: one row, the later saves update it), `softDeleteForParent`, `findById`, `restoreById`.
- **Routes**: the section under its parent, in the singular — `GET` / `PUT` / `DELETE /<parent-name>/:<parentCamelSingular>Id/<segment>` (`PUT` creates (201) or updates (200)); the row by its own id — `GET /<name>/:id`, `POST /<name>/:id/restore`.
- **Ownership** and parent state: `parentScope()` / `assertParentWritable()`, as in `dependent.md`.

Placeholders: those of `dependent.md`.

---

### Step 1: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

```typescript
import { varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  parentReference,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';
import { <parentCamelPlural> } from './<parent-name>.schema';

/** Dependent section: at most one live row per <parentCamelSingular> (DependentRepository). */
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
  (table) => [
    activeUniqueIndex('<snake_plural>_<parent_snake_singular>_unique', [table.<parentCamelSingular>Id], table.deletedAt),
  ],
);

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
```

Re-export it in `src/database/schema/domain/index.ts` (`export * from './<name>.schema';`), then `bun run db:generate`.

---

### Step 2: Create DTOs (`src/modules/<parent-name>/<name>/<name>.dto.ts`)

`PUT` saves the whole section: every field is required, as in a form.

```typescript
import { z } from 'zod';
import { isoInstant } from '../../../core/openapi';

/** The parent in the path: `/<parent-name>/:<parentCamelSingular>Id/<segment>`. */
export const <camelSingular>ParentParamSchema = z.object({
  <parentCamelSingular>Id: z.string().uuid(),
});

export type <PascalSingular>ParentParamDto = z.infer<typeof <camelSingular>ParentParamSchema>;

export const save<PascalSingular>Schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type Save<PascalSingular>Dto = z.infer<typeof save<PascalSingular>Schema>;

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
  UPDATED: { id: '<PascalSingular> berhasil diperbarui', en: '<PascalSingular> updated successfully' },
  DELETED: { id: '<PascalSingular> berhasil dihapus', en: '<PascalSingular> deleted successfully' },
  RESTORED: { id: '<PascalSingular> berhasil dipulihkan', en: '<PascalSingular> restored successfully' },
  ALREADY_EXISTS: {
    id: '<PascalSingular> lain yang aktif sudah ada untuk data ini',
    en: 'Another live <PascalSingular> already exists for this record',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const <camelSingular>NotFoundMessage = (id: string): LocalizedMessage => ({
  id: `<PascalSingular> dengan ID '${id}' tidak ditemukan`,
  en: `<PascalSingular> with ID '${id}' not found`,
});

export const <camelSingular>MissingMessage = (<parentCamelSingular>Id: string): LocalizedMessage => ({
  id: `<PascalSingular> untuk '${<parentCamelSingular>Id}' belum ada`,
  en: `No <PascalSingular> for '${<parentCamelSingular>Id}' yet`,
});
```

---

### Step 4: Create Repository (`src/modules/<parent-name>/<name>/<name>.repository.ts`)

```typescript
import { DependentRepository, defaultTxHost, type TransactionHost } from '../../../database';
import { <camelPlural>, <parentCamelPlural> } from '../../../database/schema';

/**
 * The <camelSingular> of a <parentCamelSingular> (at most one live row). When the domain needs it,
 * override:
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
```

---

### Step 6: Create Service (`src/modules/<parent-name>/<name>/<name>.service.ts`)

A restore that collides with the live row of the same parent is a `ConflictError` (`isUniqueViolation`, as in `src/modules/users/users.service.ts`).

```typescript
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';
import { ConflictError, NotFoundError } from '../../../core/errors';
import { isUniqueViolation, type UpsertResult } from '../../../database';
import type { Save<PascalSingular>Dto } from './<name>.dto';
import {
  <camelSingular>MissingMessage,
  <camelSingular>NotFoundMessage,
  <UPPER_SINGULAR>_MESSAGES,
} from './<name>.messages';
import type { <PascalSingular> } from '../../../database/schema';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  async get<PascalSingular>(<parentCamelSingular>Id: string): Promise<<PascalSingular>> {
    const record = await this.repository.findOneForParent(<parentCamelSingular>Id);
    if (!record) throw new NotFoundError(<camelSingular>MissingMessage(<parentCamelSingular>Id));
    return record;
  }

  /** Creates the <parentCamelSingular>'s <camelSingular> or updates the live one. */
  async save<PascalSingular>(
    <parentCamelSingular>Id: string,
    dto: Save<PascalSingular>Dto,
  ): Promise<UpsertResult<<PascalSingular>>> {
    return this.repository.upsertForParent(<parentCamelSingular>Id, { ...dto });
  }

  async delete<PascalSingular>(<parentCamelSingular>Id: string): Promise<void> {
    const deleted = await this.repository.softDeleteForParent(<parentCamelSingular>Id);
    if (!deleted) throw new NotFoundError(<camelSingular>MissingMessage(<parentCamelSingular>Id));
  }

  async get<PascalSingular>ById(id: string): Promise<<PascalSingular>> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return record;
  }

  async restore<PascalSingular>(id: string): Promise<<PascalSingular>> {
    try {
      const restored = await this.repository.restoreById(id);
      if (!restored) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
      return restored;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(<UPPER_SINGULAR>_MESSAGES.ALREADY_EXISTS);
      throw error;
    }
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 7: Create Controller (`src/modules/<parent-name>/<name>/<name>.controller.ts`)

```typescript
import { asyncHandler, getValidatedBody, getValidatedParams } from '../../../core/middlewares';
import { ApiResponse } from '../../../core/response';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';
import { to<PascalSingular>Response } from './<name>.transformer';
import type { UuidParamDto } from '../../../core/dto/common.dto';
import type { <PascalSingular>ParentParamDto, Save<PascalSingular>Dto } from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';

export class <PascalPlural>Controller {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  getForParent = asyncHandler(async (c) => {
    const { <parentCamelSingular>Id } = getValidatedParams<<PascalSingular>ParentParamDto>(c);
    const record = await this.service.get<PascalSingular>(<parentCamelSingular>Id);

    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.RETRIEVED, 200);
  });

  save = asyncHandler(async (c) => {
    const { <parentCamelSingular>Id } = getValidatedParams<<PascalSingular>ParentParamDto>(c);
    const dto = getValidatedBody<Save<PascalSingular>Dto>(c);
    const { row, created } = await this.service.save<PascalSingular>(<parentCamelSingular>Id, dto);

    return created
      ? new ApiResponse(to<PascalSingular>Response(row), <UPPER_SINGULAR>_MESSAGES.CREATED, 201)
      : new ApiResponse(to<PascalSingular>Response(row), <UPPER_SINGULAR>_MESSAGES.UPDATED, 200);
  });

  removeForParent = asyncHandler(async (c) => {
    const { <parentCamelSingular>Id } = getValidatedParams<<PascalSingular>ParentParamDto>(c);
    await this.service.delete<PascalSingular>(<parentCamelSingular>Id);

    return new ApiResponse(null, <UPPER_SINGULAR>_MESSAGES.DELETED, 200);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.get<PascalSingular>ById(param.id);

    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.RETRIEVED, 200);
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

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../../core/dto/common.dto';
import { validate } from '../../../core/middlewares';
import { describeEndpoint } from '../../../core/openapi';
import { <camelPlural>Controller } from './<name>.controller';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';
import {
  <camelSingular>ParentParamSchema,
  <camelSingular>ResponseSchema,
  save<PascalSingular>Schema,
} from './<name>.dto';

const tags = ['<PascalPlural>'];

/** Mounted on `/<parent-name>/:<parentCamelSingular>Id/<segment>`: the <parentCamelSingular>'s <camelSingular>. */
const parentRouter = new Hono();

parentRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: "Get a <parentCamelSingular>'s <camelSingular>",
    response: { status: 200, description: 'Found', message: <UPPER_SINGULAR>_MESSAGES.RETRIEVED, data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: <camelSingular>ParentParamSchema }),
  <camelPlural>Controller.getForParent,
);
parentRouter.put(
  '/',
  describeEndpoint({
    tags,
    summary: "Save a <parentCamelSingular>'s <camelSingular> (201 created, 200 updated)",
    response: { status: 201, description: 'Created', message: <UPPER_SINGULAR>_MESSAGES.CREATED, data: <camelSingular>ResponseSchema },
    alsoResponds: [{ status: 200, description: 'Updated', message: <UPPER_SINGULAR>_MESSAGES.UPDATED }],
    errors: [404],
  }),
  validate({ params: <camelSingular>ParentParamSchema, body: save<PascalSingular>Schema }),
  <camelPlural>Controller.save,
);
parentRouter.delete(
  '/',
  describeEndpoint({
    tags,
    summary: "Delete a <parentCamelSingular>'s <camelSingular> (soft delete; restorable)",
    response: { status: 200, description: 'Deleted', message: <UPPER_SINGULAR>_MESSAGES.DELETED, data: z.null() },
    errors: [404],
  }),
  validate({ params: <camelSingular>ParentParamSchema }),
  <camelPlural>Controller.removeForParent,
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
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted <camelSingular> (409 while another one is live)',
    response: { status: 200, description: 'Restored', message: <UPPER_SINGULAR>_MESSAGES.RESTORED, data: <camelSingular>ResponseSchema },
    errors: [404, 409],
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

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { NotFoundError } from '../../../core/errors';
import { <PascalPlural>Repository } from './<name>.repository';
import { createSqlRecorder } from '../../../../test/helpers/sql-recorder';

const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

describe('<PascalPlural>Repository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new <PascalPlural>Repository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it("reads the <parentCamelSingular>'s live row only while the <parentCamelSingular> is live", async () => {
    recorder.respondWith([[PARENT_ID]]);

    expect(await repository.findOneForParent(PARENT_ID)).toBeNull();
    expect(recorder.statements.at(1)?.sql).toContain(
      'exists (select 1 from "<parent_snake_plural>" where ("<parent_snake_plural>"."id" = "<snake_plural>"."<parent_snake_singular>_id" and "<parent_snake_plural>"."deleted_at" is null))',
    );
  });

  it('saves under a live <parentCamelSingular> only, locked FOR UPDATE (concurrent saves queue)', async () => {
    let failure: unknown;
    try {
      await repository.upsertForParent(PARENT_ID, { name: 'Sample' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(NotFoundError);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'BEGIN',
      expect.stringMatching(/^select .* from "<parent_snake_plural>" where .* for update$/) as string,
      'ROLLBACK',
    ]);
  });
});
```

---

### Step 11: Create Service Test (`src/modules/<parent-name>/<name>/<name>.service.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { ConflictError, NotFoundError } from '../../../core/errors';
import type { <PascalSingular> } from '../../../database/schema';
import type { <PascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const TAKEN = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9b';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';
const EMPTY_PARENT = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9c';

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

/** A unique violation as postgres.js reports it (SQLSTATE 23505). */
const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

/** PARENT_ID has one live row (`ID`); EMPTY_PARENT has none; restoring TAKEN collides. */
const fakeRepository = (calls: unknown[][]): <PascalPlural>Repository =>
  ({
    findOneForParent: async (parentId: string) => (parentId === PARENT_ID ? record : null),
    upsertForParent: async (parentId: string, values: unknown) => {
      calls.push(['upsertForParent', parentId, values]);
      return { row: record, created: parentId === EMPTY_PARENT };
    },
    softDeleteForParent: async (parentId: string) => (parentId === PARENT_ID ? record : null),
    findById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => {
      if (id === TAKEN) throw uniqueViolation;
      return id === ID ? record : null;
    },
  }) as unknown as <PascalPlural>Repository;

describe('<PascalPlural>Service (Unit)', () => {
  it("gets the <parentCamelSingular>'s row; none yet is a NotFoundError", async () => {
    const service = new <PascalPlural>Service(fakeRepository([]));

    expect(await service.get<PascalSingular>(PARENT_ID)).toBe(record);
    expect(await rejectionOf(service.get<PascalSingular>(EMPTY_PARENT))).toBeInstanceOf(NotFoundError);
  });

  it('saves (create or update) under the <parentCamelSingular> from the path', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect((await service.save<PascalSingular>(EMPTY_PARENT, { name: 'Sample' })).created).toBe(true);
    expect((await service.save<PascalSingular>(PARENT_ID, { name: 'Sample' })).created).toBe(false);
    expect(calls.at(0)).toEqual(['upsertForParent', EMPTY_PARENT, { name: 'Sample' }]);
  });

  it('deletes the row; none yet is a NotFoundError', async () => {
    const service = new <PascalPlural>Service(fakeRepository([]));

    await service.delete<PascalSingular>(PARENT_ID);
    expect(await rejectionOf(service.delete<PascalSingular>(EMPTY_PARENT))).toBeInstanceOf(NotFoundError);
  });

  it('finds and restores by id; missing is a NotFoundError, a live sibling a ConflictError', async () => {
    const service = new <PascalPlural>Service(fakeRepository([]));

    expect(await service.get<PascalSingular>ById(ID)).toBe(record);
    expect(await service.restore<PascalSingular>(ID)).toBe(record);
    expect(await rejectionOf(service.get<PascalSingular>ById(MISSING))).toBeInstanceOf(NotFoundError);
    expect(await rejectionOf(service.restore<PascalSingular>(MISSING))).toBeInstanceOf(NotFoundError);
    expect(await rejectionOf(service.restore<PascalSingular>(TAKEN))).toBeInstanceOf(ConflictError);
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
import { to<PascalSingular>Response } from './<name>.transformer';

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
});
```

---

### Step 13: Create Controller Test (`src/modules/<parent-name>/<name>/<name>.controller.test.ts`)

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../../core/middlewares';
import type { <PascalSingular> } from '../../../database/schema';
import { <camelSingular>MissingMessage, <camelSingular>NotFoundMessage } from './<name>.messages';
import { <camelPlural>ParentRouter, <camelPlural>Router } from './<name>.routes';
import { <camelPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';
const EMPTY_PARENT = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9c';

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

const section = (parentId: string): string => `/<parent-name>/${parentId}/<segment>`;

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('<PascalPlural>Controller (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(<camelPlural>Service, 'get<PascalSingular>').mockImplementation(async (parentId) => {
        if (parentId !== PARENT_ID) throw new NotFoundError(<camelSingular>MissingMessage(parentId));
        return record;
      }),
      spyOn(<camelPlural>Service, 'save<PascalSingular>').mockImplementation(async (parentId) => ({
        row: record,
        created: parentId === EMPTY_PARENT,
      })),
      spyOn(<camelPlural>Service, 'delete<PascalSingular>').mockImplementation(async () => undefined),
      spyOn(<camelPlural>Service, 'get<PascalSingular>ById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
        return record;
      }),
      spyOn(<camelPlural>Service, 'restore<PascalSingular>').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it("gets the <parentCamelSingular>'s <camelSingular> (snake_case), 404 while there is none", async () => {
    const res = await app.request(section(PARENT_ID));
    const body = (await res.json()) as { data: { <parent_snake_singular>_id: string } };

    expect(res.status).toBe(200);
    expect(body.data.<parent_snake_singular>_id).toBe(PARENT_ID);
    expect((await app.request(section(EMPTY_PARENT))).status).toBe(404);
  });

  it('PUT creates (201) the first time and updates (200) afterwards', async () => {
    expect((await app.request(section(EMPTY_PARENT), send('PUT', { name: 'Sample' }))).status).toBe(201);
    expect((await app.request(section(PARENT_ID), send('PUT', { name: 'Sample' }))).status).toBe(200);
  });

  it('rejects an invalid parent id or body (400) before the service', async () => {
    expect((await app.request('/<parent-name>/not-a-uuid/<segment>')).status).toBe(400);
    expect((await app.request(section(PARENT_ID), send('PUT', {}))).status).toBe(400);
  });

  it('deletes under the parent, gets and restores by its own id', async () => {
    expect((await app.request(section(PARENT_ID), { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/<name>/${ID}`)).status).toBe(200);
    expect((await app.request(`/<name>/${MISSING}`)).status).toBe(404);
    expect((await app.request(`/<name>/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });
});
```

---

### Step 14: Verify the Quality Gate

Same as `SKILL.md` Step 15. When you add `parentScope()` or `assertParentWritable()`, add a test for it — and an integration test when the rule depends on real locks or data (`docs/standards/testing.md` §7).
