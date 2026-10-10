# Scaffold Variant — Header + Detail

Use this variant when a resource owns a list of rows that only exist inside it (an order and its items, an invoice and its lines). Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. This file replaces Steps 2–11 of `SKILL.md`.

- **Header** (`<camelPlural>`, table `<snake_plural>`): a standalone table on `BaseRepository` — soft delete, restore, audited updates.
- **Detail** (`<camelSingular>Items`, table `<snake_singular>_items`): rows of one header on `ChildRepository` — reachable only through their header (`/<name>/:id/items[/:childId]`, never `/items/:childId`), hard-deleted with a snapshot in `record_changes`, every change touches the header and records it in `parent_table` / `parent_id`. Rename `items` to the real noun (`lines`, `members`, …) after generating.
- At most two levels: a detail never has its own details.

Extra placeholder: `<snake_singular>` (e.g. `order`). Verified with the others by `bun run verify:scaffold`.

---

### Step 1: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

The detail's foreign key comes from `parentReference()` (`ON DELETE restrict`) and needs an index starting with it — the schema convention test fails without it.

```typescript
import { index, integer, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, parentReference, softDelete, timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';

/** Header: standalone shape (BaseRepository) — audited, soft-deleted. */
export const <camelPlural> = appTable('<snake_plural>', {
  id: uuidPrimaryKey(),
  code: varchar('code', { length: 50 }).notNull(),
  note: varchar('note', { length: 255 }),
  ...timestamps(),
  ...auditColumns(),
  ...softDelete(),
});

/** Detail: lives and dies with its header (ChildRepository) — no soft delete. */
export const <camelSingular>Items = appTable(
  '<snake_singular>_items',
  {
    id: uuidPrimaryKey(),
    <camelSingular>Id: parentReference('<snake_singular>_id', () => <camelPlural>.id),
    description: varchar('description', { length: 255 }).notNull(),
    quantity: integer('quantity').notNull(),
    ...timestamps(),
    ...auditColumns(),
  },
  (table) => [index('<snake_singular>_items_<snake_singular>_idx').on(table.<camelSingular>Id)],
);

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
export type <PascalSingular>Item = typeof <camelSingular>Items.$inferSelect;
```

Re-export it in `src/database/schema/domain/index.ts` (`export * from './<name>.schema';`), then `bun run db:generate`.

---

### Step 2: Create DTOs (`src/modules/<name>/<name>.dto.ts`)

`PUT /<name>/:id/items` saves a form's complete list: items with `id` are kept (updated when changed), items without one are created, existing items missing from the list are deleted.

```typescript
import { z } from 'zod';
import { isoInstant } from '../../core/openapi';

export const create<PascalSingular>Schema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  note: z.string().max(255).optional(),
});

export type Create<PascalSingular>Dto = z.infer<typeof create<PascalSingular>Schema>;

export const update<PascalSingular>Schema = z
  .object({
    code: z.string().min(1, 'Code is required').max(50),
    note: z.string().max(255).nullable(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type Update<PascalSingular>Dto = z.infer<typeof update<PascalSingular>Schema>;

const <camelSingular>ItemFields = z.object({
  description: z.string().min(1, 'Description is required').max(255),
  quantity: z.number().int().positive(),
});

export const create<PascalSingular>ItemSchema = <camelSingular>ItemFields;

export type Create<PascalSingular>ItemDto = z.infer<typeof create<PascalSingular>ItemSchema>;

export const update<PascalSingular>ItemSchema = <camelSingular>ItemFields
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type Update<PascalSingular>ItemDto = z.infer<typeof update<PascalSingular>ItemSchema>;

export const sync<PascalSingular>ItemsSchema = z.object({
  items: z.array(<camelSingular>ItemFields.extend({ id: z.string().uuid().optional() })).max(500),
});

export type Sync<PascalSingular>ItemsDto = z.infer<typeof sync<PascalSingular>ItemsSchema>;

export const <camelSingular>ResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  note: z.string().nullable(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type <PascalSingular>Response = z.infer<typeof <camelSingular>ResponseSchema>;

export const <camelSingular>ItemResponseSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  quantity: z.number().int(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type <PascalSingular>ItemResponse = z.infer<typeof <camelSingular>ItemResponseSchema>;
```

---

### Step 3: Create Messages (`src/modules/<name>/<name>.messages.ts`)

```typescript
import type { LocalizedMessage } from '../../core/i18n';

export const <UPPER_SINGULAR>_MESSAGES = {
  CREATED: { id: '<PascalSingular> berhasil dibuat', en: '<PascalSingular> created successfully' },
  RETRIEVED: { id: 'Data <PascalSingular> berhasil diambil', en: '<PascalSingular> retrieved successfully' },
  LIST_RETRIEVED: { id: 'Daftar <PascalSingular> berhasil diambil', en: '<PascalPlural> retrieved successfully' },
  UPDATED: { id: '<PascalSingular> berhasil diperbarui', en: '<PascalSingular> updated successfully' },
  DELETED: { id: '<PascalSingular> berhasil dihapus', en: '<PascalSingular> deleted successfully' },
  RESTORED: { id: '<PascalSingular> berhasil dipulihkan', en: '<PascalSingular> restored successfully' },
  ITEMS_RETRIEVED: { id: 'Daftar item berhasil diambil', en: 'Items retrieved successfully' },
  ITEM_CREATED: { id: 'Item berhasil ditambahkan', en: 'Item added successfully' },
  ITEM_UPDATED: { id: 'Item berhasil diperbarui', en: 'Item updated successfully' },
  ITEM_DELETED: { id: 'Item berhasil dihapus', en: 'Item deleted successfully' },
  ITEMS_SAVED: { id: 'Daftar item berhasil disimpan', en: 'Items saved successfully' },
} as const satisfies Record<string, LocalizedMessage>;

export const <camelSingular>NotFoundMessage = (id: string): LocalizedMessage => ({
  id: `<PascalSingular> dengan ID '${id}' tidak ditemukan`,
  en: `<PascalSingular> with ID '${id}' not found`,
});

export const <camelSingular>ItemNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Item dengan ID '${id}' tidak ditemukan`,
  en: `Item with ID '${id}' not found`,
});
```

---

### Step 4: Create Repositories (`src/modules/<name>/<name>.repository.ts`)

Both classes extend a base (ESLint). `ChildRepository` takes the header table and the detail's foreign-key column; a missing or soft-deleted header is a `NotFoundError` from the repository itself.

```typescript
import {
  BaseRepository,
  ChildRepository,
  defaultTxHost,
  type TransactionHost,
} from '../../database';
import { <camelSingular>Items, <camelPlural> } from '../../database/schema';

export class <PascalPlural>Repository extends BaseRepository<typeof <camelPlural>> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, txHost);
  }
}

export class <PascalSingular>ItemsRepository extends ChildRepository<
  typeof <camelSingular>Items,
  typeof <camelPlural>
> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelSingular>Items, <camelPlural>, <camelSingular>Items.<camelSingular>Id, txHost);
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
export const <camelSingular>ItemsRepository = new <PascalSingular>ItemsRepository();
```

---

### Step 5: Create Transformer (`src/modules/<name>/<name>.transformer.ts`)

```typescript
import type { <PascalSingular>, <PascalSingular>Item } from '../../database/schema';
import type { <PascalSingular>ItemResponse, <PascalSingular>Response } from './<name>.dto';

export const to<PascalSingular>Response = (entity: <PascalSingular>): <PascalSingular>Response => ({
  id: entity.id,
  code: entity.code,
  note: entity.note,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const to<PascalSingular>ListResponse = (entities: <PascalSingular>[]): <PascalSingular>Response[] =>
  entities.map(to<PascalSingular>Response);

export const to<PascalSingular>ItemResponse = (item: <PascalSingular>Item): <PascalSingular>ItemResponse => ({
  id: item.id,
  description: item.description,
  quantity: item.quantity,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const to<PascalSingular>ItemListResponse = (items: <PascalSingular>Item[]): <PascalSingular>ItemResponse[] =>
  items.map(to<PascalSingular>ItemResponse);
```

---

### Step 6: Create Service (`src/modules/<name>/<name>.service.ts`)

```typescript
import {
  <camelPlural>Repository,
  <camelSingular>ItemsRepository,
  <PascalPlural>Repository,
  <PascalSingular>ItemsRepository,
} from './<name>.repository';
import { NotFoundError } from '../../core/errors';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type {
  Create<PascalSingular>Dto,
  Create<PascalSingular>ItemDto,
  Sync<PascalSingular>ItemsDto,
  Update<PascalSingular>Dto,
  Update<PascalSingular>ItemDto,
} from './<name>.dto';
import { <camelSingular>ItemNotFoundMessage, <camelSingular>NotFoundMessage } from './<name>.messages';
import type { <PascalSingular>, <PascalSingular>Item } from '../../database/schema';

export class <PascalPlural>Service {
  constructor(
    private readonly headers: <PascalPlural>Repository = <camelPlural>Repository,
    private readonly items: <PascalSingular>ItemsRepository = <camelSingular>ItemsRepository,
  ) {}

  async create<PascalSingular>(dto: Create<PascalSingular>Dto): Promise<<PascalSingular>> {
    return this.headers.create({ ...dto });
  }

  async get<PascalSingular>ById(id: string): Promise<<PascalSingular>> {
    const record = await this.headers.findById(id);
    if (!record) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return record;
  }

  async list<PascalPlural>(query: PaginationQueryDto): Promise<{ records: <PascalSingular>[]; total: number }> {
    const [records, total] = await Promise.all([
      this.headers.findPage({ page: query.page, perPage: query.perPage }),
      this.headers.count(),
    ]);
    return { records, total };
  }

  async update<PascalSingular>(id: string, dto: Update<PascalSingular>Dto): Promise<<PascalSingular>> {
    const updated = await this.headers.updateById(id, dto);
    if (!updated) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return updated;
  }

  /** Soft delete; the items stay (restorable with the header). */
  async delete<PascalSingular>(id: string): Promise<void> {
    const deleted = await this.headers.softDeleteById(id);
    if (!deleted) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
  }

  async restore<PascalSingular>(id: string): Promise<<PascalSingular>> {
    const restored = await this.headers.restoreById(id);
    if (!restored) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return restored;
  }

  async listItems(headerId: string): Promise<<PascalSingular>Item[]> {
    return this.items.findAllForParent(headerId);
  }

  async addItem(headerId: string, dto: Create<PascalSingular>ItemDto): Promise<<PascalSingular>Item> {
    return this.items.createForParent(headerId, dto);
  }

  async updateItem(headerId: string, itemId: string, dto: Update<PascalSingular>ItemDto): Promise<<PascalSingular>Item> {
    const updated = await this.items.updateForParent(headerId, itemId, dto);
    if (!updated) throw new NotFoundError(<camelSingular>ItemNotFoundMessage(itemId));
    return updated;
  }

  async deleteItem(headerId: string, itemId: string): Promise<void> {
    const deleted = await this.items.deleteForParent(headerId, itemId);
    if (!deleted) throw new NotFoundError(<camelSingular>ItemNotFoundMessage(itemId));
  }

  async syncItems(headerId: string, dto: Sync<PascalSingular>ItemsDto): Promise<<PascalSingular>Item[]> {
    return this.items.syncForParent(headerId, dto.items);
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 7: Create Controller (`src/modules/<name>/<name>.controller.ts`)

```typescript
import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';
import {
  to<PascalSingular>ItemListResponse,
  to<PascalSingular>ItemResponse,
  to<PascalSingular>ListResponse,
  to<PascalSingular>Response,
} from './<name>.transformer';
import type { PaginationQueryDto, UuidChildParamDto, UuidParamDto } from '../../core/dto/common.dto';
import type {
  Create<PascalSingular>Dto,
  Create<PascalSingular>ItemDto,
  Sync<PascalSingular>ItemsDto,
  Update<PascalSingular>Dto,
  Update<PascalSingular>ItemDto,
} from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';

export class <PascalPlural>Controller {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  create = asyncHandler(async (c) => {
    const created = await this.service.create<PascalSingular>(getValidatedBody<Create<PascalSingular>Dto>(c));
    return new ApiResponse(to<PascalSingular>Response(created), <UPPER_SINGULAR>_MESSAGES.CREATED, 201);
  });

  getById = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.get<PascalSingular>ById(id);
    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.RETRIEVED, 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.list<PascalPlural>(query);
    return new ApiResponse(to<PascalSingular>ListResponse(records), <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages: Math.ceil(total / query.perPage) || 1,
    });
  });

  update = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const updated = await this.service.update<PascalSingular>(id, getValidatedBody<Update<PascalSingular>Dto>(c));
    return new ApiResponse(to<PascalSingular>Response(updated), <UPPER_SINGULAR>_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    await this.service.delete<PascalSingular>(id);
    return new ApiResponse(null, <UPPER_SINGULAR>_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restore<PascalSingular>(id);
    return new ApiResponse(to<PascalSingular>Response(restored), <UPPER_SINGULAR>_MESSAGES.RESTORED, 200);
  });

  listItems = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const items = await this.service.listItems(id);
    return new ApiResponse(to<PascalSingular>ItemListResponse(items), <UPPER_SINGULAR>_MESSAGES.ITEMS_RETRIEVED, 200);
  });

  addItem = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const item = await this.service.addItem(id, getValidatedBody<Create<PascalSingular>ItemDto>(c));
    return new ApiResponse(to<PascalSingular>ItemResponse(item), <UPPER_SINGULAR>_MESSAGES.ITEM_CREATED, 201);
  });

  updateItem = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    const item = await this.service.updateItem(id, childId, getValidatedBody<Update<PascalSingular>ItemDto>(c));
    return new ApiResponse(to<PascalSingular>ItemResponse(item), <UPPER_SINGULAR>_MESSAGES.ITEM_UPDATED, 200);
  });

  deleteItem = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    await this.service.deleteItem(id, childId);
    return new ApiResponse(null, <UPPER_SINGULAR>_MESSAGES.ITEM_DELETED, 200);
  });

  syncItems = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const items = await this.service.syncItems(id, getValidatedBody<Sync<PascalSingular>ItemsDto>(c));
    return new ApiResponse(to<PascalSingular>ItemListResponse(items), <UPPER_SINGULAR>_MESSAGES.ITEMS_SAVED, 200);
  });
}

export const <camelPlural>Controller = new <PascalPlural>Controller();
```

---

### Step 8: Create Routes (`src/modules/<name>/<name>.routes.ts`)

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import {
  paginationQuerySchema,
  uuidChildParamSchema,
  uuidParamSchema,
} from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { <camelPlural>Controller } from './<name>.controller';
import {
  create<PascalSingular>ItemSchema,
  create<PascalSingular>Schema,
  <camelSingular>ItemResponseSchema,
  <camelSingular>ResponseSchema,
  sync<PascalSingular>ItemsSchema,
  update<PascalSingular>ItemSchema,
  update<PascalSingular>Schema,
} from './<name>.dto';

const router = new Hono();
const tags = ['<PascalPlural>'];

router.post(
  '/',
  describeEndpoint({ tags, summary: 'Create a <camelSingular>', response: { status: 201, description: 'Created', data: <camelSingular>ResponseSchema } }),
  validate({ body: create<PascalSingular>Schema }),
  <camelPlural>Controller.create,
);
router.get(
  '/',
  describeEndpoint({ tags, summary: 'List <camelPlural> (paginated)', response: { status: 200, description: 'A page', paginatedItem: <camelSingular>ResponseSchema } }),
  validate({ query: paginationQuerySchema }),
  <camelPlural>Controller.list,
);
router.get(
  '/:id',
  describeEndpoint({ tags, summary: 'Get a <camelSingular> by id', response: { status: 200, description: 'Found', data: <camelSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.getById,
);
router.patch(
  '/:id',
  describeEndpoint({ tags, summary: 'Update a <camelSingular> (only the given fields)', response: { status: 200, description: 'Updated', data: <camelSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema, body: update<PascalSingular>Schema }),
  <camelPlural>Controller.update,
);
router.delete(
  '/:id',
  describeEndpoint({ tags, summary: 'Delete a <camelSingular> (soft delete; restorable)', response: { status: 200, description: 'Deleted', data: z.null() }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({ tags, summary: 'Restore a soft-deleted <camelSingular>', response: { status: 200, description: 'Restored', data: <camelSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.restore,
);

router.get(
  '/:id/items',
  describeEndpoint({ tags, summary: "List a <camelSingular>'s items", response: { status: 200, description: 'Items, oldest first', data: z.array(<camelSingular>ItemResponseSchema) }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.listItems,
);
router.post(
  '/:id/items',
  describeEndpoint({ tags, summary: 'Add an item to a <camelSingular>', response: { status: 201, description: 'Item added', data: <camelSingular>ItemResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema, body: create<PascalSingular>ItemSchema }),
  <camelPlural>Controller.addItem,
);
router.put(
  '/:id/items',
  describeEndpoint({ tags, summary: "Replace a <camelSingular>'s item list (update kept ids, add new, delete missing)", response: { status: 200, description: 'The saved list', data: z.array(<camelSingular>ItemResponseSchema) }, errors: [404] }),
  validate({ params: uuidParamSchema, body: sync<PascalSingular>ItemsSchema }),
  <camelPlural>Controller.syncItems,
);
router.patch(
  '/:id/items/:childId',
  describeEndpoint({ tags, summary: 'Update an item (only the given fields)', response: { status: 200, description: 'Item updated', data: <camelSingular>ItemResponseSchema }, errors: [404] }),
  validate({ params: uuidChildParamSchema, body: update<PascalSingular>ItemSchema }),
  <camelPlural>Controller.updateItem,
);
router.delete(
  '/:id/items/:childId',
  describeEndpoint({ tags, summary: 'Delete an item', response: { status: 200, description: 'Item deleted', data: z.null() }, errors: [404] }),
  validate({ params: uuidChildParamSchema }),
  <camelPlural>Controller.deleteItem,
);

export { router as <camelPlural>Router };
```

---

### Step 9: Register Route in `src/app.ts`

```typescript
import { <camelPlural>Router } from './modules/<name>/<name>.routes';

// Inside createApp(), next to the other modules on the versioned router
v1.route('/<name>', <camelPlural>Router);
```

---

### Step 10: Create Repository Test (`src/modules/<name>/<name>.repository.test.ts`)

`BaseRepository` / `ChildRepository` behaviour (locking, IDOR, sync, audit) is tested once in `src/database/`; here, check the wiring: the header scope, and that items are reached through their header column.

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { <PascalPlural>Repository, <PascalSingular>ItemsRepository } from './<name>.repository';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';

const HEADER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const ITEM_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

describe('<PascalPlural>Repository / <PascalSingular>ItemsRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const headers = new <PascalPlural>Repository(recorder.txHost);
  const items = new <PascalSingular>ItemsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('headers: live rows only', async () => {
    expect(await headers.findById(HEADER_ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain('"<snake_plural>"."deleted_at" is null');
  });

  it('items: reached only through their live header', async () => {
    recorder.respondWith([[HEADER_ID]]);

    expect(await items.findByIdForParent(HEADER_ID, ITEM_ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain('"<snake_plural>"."deleted_at" is null');
    expect(recorder.statements.at(1)?.sql).toContain(
      'where ("<snake_singular>_items"."<snake_singular>_id" = $1 and "<snake_singular>_items"."id" = $2)',
    );
  });
});
```
