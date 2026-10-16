# Scaffold Variant — Header + Detail

Use this variant when a resource owns a list of rows that only exist inside it (an order and its items, an invoice and its lines). Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. This file replaces Steps 2–11 of `SKILL.md`.

- **Header** (`<camelPlural>`, table `<snake_plural>`): a standalone table on `BaseRepository` — soft delete, restore, audited updates.
- **Detail** (`<camelSingular><DetailPascalPlural>`, table `<snake_singular>_<detail_snake_plural>`): rows of one header on `ChildRepository` — reachable only through their header (`/<name>/:id/<detail-plural>[/:childId]`, never `/<detail-plural>/:childId`), hard-deleted with a snapshot in `record_changes`, every change touches the header and records it in `parent_table` / `parent_id`. The detail is named with `bun run scaffold module <name> --variant=header-detail --detail=<plural>` (default `items`: `order_items`; `--detail=members` on `classes`: `class_members`, `/classes/:id/members`).
- At most two levels: a detail never has its own details.

Extra placeholders: `<snake_singular>` (e.g. `order`), and the detail — `<detail-plural>` (route, `items` / `line-items`), `<detail_snake_plural>` (table suffix), `<detailCamelPlural>` / `<detailCamelSingular>` (variables, `items` / `item`), `<DetailPascalPlural>` / `<DetailPascalSingular>` (types, methods, `Items` / `Item`), `<DETAIL_UPPER_PLURAL>` / `<DETAIL_UPPER_SINGULAR>` (constants, `ITEMS` / `ITEM`). Verified with the others by `bun run verify:scaffold`, with the default detail and with `--detail`.

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
export const <camelSingular><DetailPascalPlural> = appTable(
  '<snake_singular>_<detail_snake_plural>',
  {
    id: uuidPrimaryKey(),
    <camelSingular>Id: parentReference('<snake_singular>_id', () => <camelPlural>.id),
    description: varchar('description', { length: 255 }).notNull(),
    quantity: integer('quantity').notNull(),
    ...timestamps(),
    ...auditColumns(),
  },
  (table) => [index('<snake_singular>_<detail_snake_plural>_<snake_singular>_idx').on(table.<camelSingular>Id)],
);

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
export type <PascalSingular><DetailPascalSingular> = typeof <camelSingular><DetailPascalPlural>.$inferSelect;
```

Re-export it in `src/database/schema/domain/index.ts` (`export * from './<name>.schema';`), then `bun run db:generate`.

---

### Step 2: Create DTOs (`src/modules/<name>/<name>.dto.ts`)

`PUT /<name>/:id/<detail-plural>` saves a form's complete list: details with `id` are kept (updated when changed), details without one are created, existing details missing from the list are deleted.

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

const <camelSingular><DetailPascalSingular>Fields = z.object({
  description: z.string().min(1, 'Description is required').max(255),
  quantity: z.number().int().positive(),
});

export const create<PascalSingular><DetailPascalSingular>Schema = <camelSingular><DetailPascalSingular>Fields;

export type Create<PascalSingular><DetailPascalSingular>Dto = z.infer<typeof create<PascalSingular><DetailPascalSingular>Schema>;

export const update<PascalSingular><DetailPascalSingular>Schema = <camelSingular><DetailPascalSingular>Fields
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type Update<PascalSingular><DetailPascalSingular>Dto = z.infer<typeof update<PascalSingular><DetailPascalSingular>Schema>;

export const sync<PascalSingular><DetailPascalPlural>Schema = z.object({
  <detailCamelPlural>: z.array(<camelSingular><DetailPascalSingular>Fields.extend({ id: z.string().uuid().optional() })).max(500),
});

export type Sync<PascalSingular><DetailPascalPlural>Dto = z.infer<typeof sync<PascalSingular><DetailPascalPlural>Schema>;

export const <camelSingular>ResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  note: z.string().nullable(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type <PascalSingular>Response = z.infer<typeof <camelSingular>ResponseSchema>;

export const <camelSingular><DetailPascalSingular>ResponseSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  quantity: z.number().int(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type <PascalSingular><DetailPascalSingular>Response = z.infer<typeof <camelSingular><DetailPascalSingular>ResponseSchema>;
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
  <DETAIL_UPPER_PLURAL>_RETRIEVED: { id: 'Daftar <detailCamelSingular> berhasil diambil', en: '<DetailPascalPlural> retrieved successfully' },
  <DETAIL_UPPER_SINGULAR>_CREATED: { id: '<DetailPascalSingular> berhasil ditambahkan', en: '<DetailPascalSingular> added successfully' },
  <DETAIL_UPPER_SINGULAR>_UPDATED: { id: '<DetailPascalSingular> berhasil diperbarui', en: '<DetailPascalSingular> updated successfully' },
  <DETAIL_UPPER_SINGULAR>_DELETED: { id: '<DetailPascalSingular> berhasil dihapus', en: '<DetailPascalSingular> deleted successfully' },
  <DETAIL_UPPER_PLURAL>_SAVED: { id: 'Daftar <detailCamelSingular> berhasil disimpan', en: '<DetailPascalPlural> saved successfully' },
} as const satisfies Record<string, LocalizedMessage>;

export const <camelSingular>NotFoundMessage = (id: string): LocalizedMessage => ({
  id: `<PascalSingular> dengan ID '${id}' tidak ditemukan`,
  en: `<PascalSingular> with ID '${id}' not found`,
});

export const <camelSingular><DetailPascalSingular>NotFoundMessage = (id: string): LocalizedMessage => ({
  id: `<DetailPascalSingular> dengan ID '${id}' tidak ditemukan`,
  en: `<DetailPascalSingular> with ID '${id}' not found`,
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
import { <camelSingular><DetailPascalPlural>, <camelPlural> } from '../../database/schema';

export class <PascalPlural>Repository extends BaseRepository<typeof <camelPlural>> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, txHost);
  }
}

export class <PascalSingular><DetailPascalPlural>Repository extends ChildRepository<
  typeof <camelSingular><DetailPascalPlural>,
  typeof <camelPlural>
> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelSingular><DetailPascalPlural>, <camelPlural>, <camelSingular><DetailPascalPlural>.<camelSingular>Id, txHost);
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
export const <camelSingular><DetailPascalPlural>Repository = new <PascalSingular><DetailPascalPlural>Repository();
```

---

### Step 5: Create Transformer (`src/modules/<name>/<name>.transformer.ts`)

```typescript
import type { <PascalSingular>, <PascalSingular><DetailPascalSingular> } from '../../database/schema';
import type { <PascalSingular><DetailPascalSingular>Response, <PascalSingular>Response } from './<name>.dto';

export const to<PascalSingular>Response = (entity: <PascalSingular>): <PascalSingular>Response => ({
  id: entity.id,
  code: entity.code,
  note: entity.note,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const to<PascalSingular>ListResponse = (entities: <PascalSingular>[]): <PascalSingular>Response[] =>
  entities.map(to<PascalSingular>Response);

export const to<PascalSingular><DetailPascalSingular>Response = (<detailCamelSingular>: <PascalSingular><DetailPascalSingular>): <PascalSingular><DetailPascalSingular>Response => ({
  id: <detailCamelSingular>.id,
  description: <detailCamelSingular>.description,
  quantity: <detailCamelSingular>.quantity,
  createdAt: <detailCamelSingular>.createdAt,
  updatedAt: <detailCamelSingular>.updatedAt,
});

export const to<PascalSingular><DetailPascalSingular>ListResponse = (<detailCamelPlural>: <PascalSingular><DetailPascalSingular>[]): <PascalSingular><DetailPascalSingular>Response[] =>
  <detailCamelPlural>.map(to<PascalSingular><DetailPascalSingular>Response);
```

---

### Step 6: Create Service (`src/modules/<name>/<name>.service.ts`)

```typescript
import {
  <camelPlural>Repository,
  <camelSingular><DetailPascalPlural>Repository,
  <PascalPlural>Repository,
  <PascalSingular><DetailPascalPlural>Repository,
} from './<name>.repository';
import { NotFoundError } from '../../core/errors';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type {
  Create<PascalSingular>Dto,
  Create<PascalSingular><DetailPascalSingular>Dto,
  Sync<PascalSingular><DetailPascalPlural>Dto,
  Update<PascalSingular>Dto,
  Update<PascalSingular><DetailPascalSingular>Dto,
} from './<name>.dto';
import { <camelSingular><DetailPascalSingular>NotFoundMessage, <camelSingular>NotFoundMessage } from './<name>.messages';
import type { <PascalSingular>, <PascalSingular><DetailPascalSingular> } from '../../database/schema';

export class <PascalPlural>Service {
  constructor(
    private readonly headers: <PascalPlural>Repository = <camelPlural>Repository,
    private readonly <detailCamelPlural>: <PascalSingular><DetailPascalPlural>Repository = <camelSingular><DetailPascalPlural>Repository,
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

  /** Soft delete; the <detailCamelPlural> stay (restorable with the header). */
  async delete<PascalSingular>(id: string): Promise<void> {
    const deleted = await this.headers.softDeleteById(id);
    if (!deleted) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
  }

  async restore<PascalSingular>(id: string): Promise<<PascalSingular>> {
    const restored = await this.headers.restoreById(id);
    if (!restored) throw new NotFoundError(<camelSingular>NotFoundMessage(id));
    return restored;
  }

  async list<DetailPascalPlural>(headerId: string): Promise<<PascalSingular><DetailPascalSingular>[]> {
    return this.<detailCamelPlural>.findAllForParent(headerId);
  }

  async add<DetailPascalSingular>(headerId: string, dto: Create<PascalSingular><DetailPascalSingular>Dto): Promise<<PascalSingular><DetailPascalSingular>> {
    return this.<detailCamelPlural>.createForParent(headerId, dto);
  }

  async update<DetailPascalSingular>(headerId: string, <detailCamelSingular>Id: string, dto: Update<PascalSingular><DetailPascalSingular>Dto): Promise<<PascalSingular><DetailPascalSingular>> {
    const updated = await this.<detailCamelPlural>.updateForParent(headerId, <detailCamelSingular>Id, dto);
    if (!updated) throw new NotFoundError(<camelSingular><DetailPascalSingular>NotFoundMessage(<detailCamelSingular>Id));
    return updated;
  }

  async delete<DetailPascalSingular>(headerId: string, <detailCamelSingular>Id: string): Promise<void> {
    const deleted = await this.<detailCamelPlural>.deleteForParent(headerId, <detailCamelSingular>Id);
    if (!deleted) throw new NotFoundError(<camelSingular><DetailPascalSingular>NotFoundMessage(<detailCamelSingular>Id));
  }

  async sync<DetailPascalPlural>(headerId: string, dto: Sync<PascalSingular><DetailPascalPlural>Dto): Promise<<PascalSingular><DetailPascalSingular>[]> {
    return this.<detailCamelPlural>.syncForParent(headerId, dto.<detailCamelPlural>);
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
  to<PascalSingular><DetailPascalSingular>ListResponse,
  to<PascalSingular><DetailPascalSingular>Response,
  to<PascalSingular>ListResponse,
  to<PascalSingular>Response,
} from './<name>.transformer';
import type { PaginationQueryDto, UuidChildParamDto, UuidParamDto } from '../../core/dto/common.dto';
import type {
  Create<PascalSingular>Dto,
  Create<PascalSingular><DetailPascalSingular>Dto,
  Sync<PascalSingular><DetailPascalPlural>Dto,
  Update<PascalSingular>Dto,
  Update<PascalSingular><DetailPascalSingular>Dto,
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

  list<DetailPascalPlural> = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const <detailCamelPlural> = await this.service.list<DetailPascalPlural>(id);
    return new ApiResponse(to<PascalSingular><DetailPascalSingular>ListResponse(<detailCamelPlural>), <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_PLURAL>_RETRIEVED, 200);
  });

  add<DetailPascalSingular> = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const <detailCamelSingular> = await this.service.add<DetailPascalSingular>(id, getValidatedBody<Create<PascalSingular><DetailPascalSingular>Dto>(c));
    return new ApiResponse(to<PascalSingular><DetailPascalSingular>Response(<detailCamelSingular>), <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_SINGULAR>_CREATED, 201);
  });

  update<DetailPascalSingular> = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    const <detailCamelSingular> = await this.service.update<DetailPascalSingular>(id, childId, getValidatedBody<Update<PascalSingular><DetailPascalSingular>Dto>(c));
    return new ApiResponse(to<PascalSingular><DetailPascalSingular>Response(<detailCamelSingular>), <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_SINGULAR>_UPDATED, 200);
  });

  delete<DetailPascalSingular> = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    await this.service.delete<DetailPascalSingular>(id, childId);
    return new ApiResponse(null, <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_SINGULAR>_DELETED, 200);
  });

  sync<DetailPascalPlural> = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const <detailCamelPlural> = await this.service.sync<DetailPascalPlural>(id, getValidatedBody<Sync<PascalSingular><DetailPascalPlural>Dto>(c));
    return new ApiResponse(to<PascalSingular><DetailPascalSingular>ListResponse(<detailCamelPlural>), <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_PLURAL>_SAVED, 200);
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
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';
import {
  create<PascalSingular><DetailPascalSingular>Schema,
  create<PascalSingular>Schema,
  <camelSingular><DetailPascalSingular>ResponseSchema,
  <camelSingular>ResponseSchema,
  sync<PascalSingular><DetailPascalPlural>Schema,
  update<PascalSingular><DetailPascalSingular>Schema,
  update<PascalSingular>Schema,
} from './<name>.dto';

const router = new Hono();
const tags = ['<PascalPlural>'];

router.post(
  '/',
  describeEndpoint({ tags, summary: 'Create a <camelSingular>', response: { status: 201, description: 'Created', message: <UPPER_SINGULAR>_MESSAGES.CREATED, data: <camelSingular>ResponseSchema } }),
  validate({ body: create<PascalSingular>Schema }),
  <camelPlural>Controller.create,
);
router.get(
  '/',
  describeEndpoint({ tags, summary: 'List <camelPlural> (paginated)', response: { status: 200, description: 'A page', message: <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, paginatedItem: <camelSingular>ResponseSchema } }),
  validate({ query: paginationQuerySchema }),
  <camelPlural>Controller.list,
);
router.get(
  '/:id',
  describeEndpoint({ tags, summary: 'Get a <camelSingular> by id', response: { status: 200, description: 'Found', message: <UPPER_SINGULAR>_MESSAGES.RETRIEVED, data: <camelSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.getById,
);
router.patch(
  '/:id',
  describeEndpoint({ tags, summary: 'Update a <camelSingular> (only the given fields)', response: { status: 200, description: 'Updated', message: <UPPER_SINGULAR>_MESSAGES.UPDATED, data: <camelSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema, body: update<PascalSingular>Schema }),
  <camelPlural>Controller.update,
);
router.delete(
  '/:id',
  describeEndpoint({ tags, summary: 'Delete a <camelSingular> (soft delete; restorable)', response: { status: 200, description: 'Deleted', message: <UPPER_SINGULAR>_MESSAGES.DELETED, data: z.null() }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({ tags, summary: 'Restore a soft-deleted <camelSingular>', response: { status: 200, description: 'Restored', message: <UPPER_SINGULAR>_MESSAGES.RESTORED, data: <camelSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.restore,
);

router.get(
  '/:id/<detail-plural>',
  describeEndpoint({ tags, summary: "List a <camelSingular>'s <detailCamelPlural>", response: { status: 200, description: '<DetailPascalPlural>, oldest first', message: <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_PLURAL>_RETRIEVED, data: z.array(<camelSingular><DetailPascalSingular>ResponseSchema) }, errors: [404] }),
  validate({ params: uuidParamSchema }),
  <camelPlural>Controller.list<DetailPascalPlural>,
);
router.post(
  '/:id/<detail-plural>',
  describeEndpoint({ tags, summary: 'Add an <detailCamelSingular> to a <camelSingular>', response: { status: 201, description: '<DetailPascalSingular> added', message: <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_SINGULAR>_CREATED, data: <camelSingular><DetailPascalSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidParamSchema, body: create<PascalSingular><DetailPascalSingular>Schema }),
  <camelPlural>Controller.add<DetailPascalSingular>,
);
router.put(
  '/:id/<detail-plural>',
  describeEndpoint({ tags, summary: "Replace a <camelSingular>'s <detailCamelSingular> list (update kept ids, add new, delete missing)", response: { status: 200, description: 'The saved list', message: <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_PLURAL>_SAVED, data: z.array(<camelSingular><DetailPascalSingular>ResponseSchema) }, errors: [404] }),
  validate({ params: uuidParamSchema, body: sync<PascalSingular><DetailPascalPlural>Schema }),
  <camelPlural>Controller.sync<DetailPascalPlural>,
);
router.patch(
  '/:id/<detail-plural>/:childId',
  describeEndpoint({ tags, summary: 'Update an <detailCamelSingular> (only the given fields)', response: { status: 200, description: '<DetailPascalSingular> updated', message: <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_SINGULAR>_UPDATED, data: <camelSingular><DetailPascalSingular>ResponseSchema }, errors: [404] }),
  validate({ params: uuidChildParamSchema, body: update<PascalSingular><DetailPascalSingular>Schema }),
  <camelPlural>Controller.update<DetailPascalSingular>,
);
router.delete(
  '/:id/<detail-plural>/:childId',
  describeEndpoint({ tags, summary: 'Delete an <detailCamelSingular>', response: { status: 200, description: '<DetailPascalSingular> deleted', message: <UPPER_SINGULAR>_MESSAGES.<DETAIL_UPPER_SINGULAR>_DELETED, data: z.null() }, errors: [404] }),
  validate({ params: uuidChildParamSchema }),
  <camelPlural>Controller.delete<DetailPascalSingular>,
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
import { <PascalPlural>Repository, <PascalSingular><DetailPascalPlural>Repository } from './<name>.repository';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';

const HEADER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const <DETAIL_UPPER_SINGULAR>_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

describe('<PascalPlural>Repository / <PascalSingular><DetailPascalPlural>Repository (Unit)', () => {
  const recorder = createSqlRecorder();
  const headers = new <PascalPlural>Repository(recorder.txHost);
  const <detailCamelPlural> = new <PascalSingular><DetailPascalPlural>Repository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('headers: live rows only', async () => {
    expect(await headers.findById(HEADER_ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain('"<snake_plural>"."deleted_at" is null');
  });

  it('<detailCamelPlural>: reached only through their live header', async () => {
    recorder.respondWith([[HEADER_ID]]);

    expect(await <detailCamelPlural>.findByIdForParent(HEADER_ID, <DETAIL_UPPER_SINGULAR>_ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain('"<snake_plural>"."deleted_at" is null');
    expect(recorder.statements.at(1)?.sql).toContain(
      'where ("<snake_singular>_<detail_snake_plural>"."<snake_singular>_id" = $1 and "<snake_singular>_<detail_snake_plural>"."id" = $2)',
    );
  });
});
```

---

### Step 11: Create Service Test (`src/modules/<name>/<name>.service.test.ts`)

Both repositories are fakes that know one live header and one of its items, so every branch — found and missing, header and item — runs without a database.

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import type { <PascalSingular>, <PascalSingular><DetailPascalSingular> } from '../../database/schema';
import type { <PascalPlural>Repository, <PascalSingular><DetailPascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const <DETAIL_UPPER_SINGULAR>_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8da0';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');

const header: <PascalSingular> = {
  id: ID,
  code: 'H-1',
  note: null,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const <detailCamelSingular>: <PascalSingular><DetailPascalSingular> = {
  id: <DETAIL_UPPER_SINGULAR>_ID,
  <camelSingular>Id: ID,
  description: 'First',
  quantity: 1,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

const fakeHeaders = (calls: unknown[][]): <PascalPlural>Repository =>
  ({
    create: async (values: unknown) => {
      calls.push(['create', values]);
      return header;
    },
    findById: async (id: string) => (id === ID ? header : null),
    findPage: async (options: unknown) => {
      calls.push(['findPage', options]);
      return [header];
    },
    count: async () => 1,
    updateById: async (id: string, values: Partial<<PascalSingular>>) => (id === ID ? { ...header, ...values } : null),
    softDeleteById: async (id: string) => (id === ID ? header : null),
    restoreById: async (id: string) => (id === ID ? header : null),
  }) as unknown as <PascalPlural>Repository;

const fake<DetailPascalPlural> = (calls: unknown[][]): <PascalSingular><DetailPascalPlural>Repository =>
  ({
    findAllForParent: async (headerId: string) => (headerId === ID ? [<detailCamelSingular>] : []),
    createForParent: async (headerId: string, values: unknown) => {
      calls.push(['createForParent', headerId, values]);
      return <detailCamelSingular>;
    },
    updateForParent: async (_headerId: string, <detailCamelSingular>Id: string, values: Partial<<PascalSingular><DetailPascalSingular>>) =>
      <detailCamelSingular>Id === <DETAIL_UPPER_SINGULAR>_ID ? { ...<detailCamelSingular>, ...values } : null,
    deleteForParent: async (_headerId: string, <detailCamelSingular>Id: string) => <detailCamelSingular>Id === <DETAIL_UPPER_SINGULAR>_ID,
    syncForParent: async (headerId: string, <detailCamelPlural>: unknown[]) => {
      calls.push(['syncForParent', headerId, <detailCamelPlural>]);
      return [<detailCamelSingular>];
    },
  }) as unknown as <PascalSingular><DetailPascalPlural>Repository;

describe('<PascalPlural>Service (Unit)', () => {
  it('creates, finds and lists headers; a missing header is a NotFoundError', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeHeaders(calls), fake<DetailPascalPlural>([]));

    expect(await service.create<PascalSingular>({ code: 'H-1' })).toBe(header);
    expect(await service.get<PascalSingular>ById(ID)).toBe(header);
    expect(await service.list<PascalPlural>({ page: 1, perPage: 10 })).toEqual({ records: [header], total: 1 });
    expect(calls).toEqual([['create', { code: 'H-1' }], ['findPage', { page: 1, perPage: 10 }]]);
    expect(await rejectionOf(service.get<PascalSingular>ById(MISSING))).toBeInstanceOf(NotFoundError);
  });

  it('updates, deletes and restores headers; each is a NotFoundError for a missing header', async () => {
    const service = new <PascalPlural>Service(fakeHeaders([]), fake<DetailPascalPlural>([]));

    expect((await service.update<PascalSingular>(ID, { note: 'changed' })).note).toBe('changed');
    await service.delete<PascalSingular>(ID);
    expect(await service.restore<PascalSingular>(ID)).toBe(header);
    for (const attempt of [
      service.update<PascalSingular>(MISSING, { note: 'x' }),
      service.delete<PascalSingular>(MISSING),
      service.restore<PascalSingular>(MISSING),
    ]) {
      expect(await rejectionOf(attempt)).toBeInstanceOf(NotFoundError);
    }
  });

  it('handles <detailCamelPlural> through their header; a missing <detailCamelSingular> is a NotFoundError', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeHeaders([]), fake<DetailPascalPlural>(calls));

    expect(await service.list<DetailPascalPlural>(ID)).toEqual([<detailCamelSingular>]);
    expect(await service.add<DetailPascalSingular>(ID, { description: 'First', quantity: 1 })).toBe(<detailCamelSingular>);
    expect((await service.update<DetailPascalSingular>(ID, <DETAIL_UPPER_SINGULAR>_ID, { quantity: 2 })).quantity).toBe(2);
    await service.delete<DetailPascalSingular>(ID, <DETAIL_UPPER_SINGULAR>_ID);
    expect(await service.sync<DetailPascalPlural>(ID, { <detailCamelPlural>: [{ description: 'First', quantity: 1 }] })).toEqual([<detailCamelSingular>]);
    expect(calls).toEqual([
      ['createForParent', ID, { description: 'First', quantity: 1 }],
      ['syncForParent', ID, [{ description: 'First', quantity: 1 }]],
    ]);
    expect(await rejectionOf(service.update<DetailPascalSingular>(ID, MISSING, { quantity: 2 }))).toBeInstanceOf(NotFoundError);
    expect(await rejectionOf(service.delete<DetailPascalSingular>(ID, MISSING))).toBeInstanceOf(NotFoundError);
  });
});
```

---

### Step 12: Create Transformer Test (`src/modules/<name>/<name>.transformer.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { <PascalSingular>, <PascalSingular><DetailPascalSingular> } from '../../database/schema';
import { <camelSingular><DetailPascalSingular>ResponseSchema, <camelSingular>ResponseSchema } from './<name>.dto';
import {
  to<PascalSingular><DetailPascalSingular>ListResponse,
  to<PascalSingular>ListResponse,
  to<PascalSingular>Response,
} from './<name>.transformer';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const audit = { createdAt: AT, updatedAt: AT, createdBy: 'system', updatedBy: 'system' };
const header: <PascalSingular> = { id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e', code: 'H-1', note: null, deletedAt: null, ...audit };
const <detailCamelSingular>: <PascalSingular><DetailPascalSingular> = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8da0',
  <camelSingular>Id: header.id,
  description: 'First',
  quantity: 1,
  ...audit,
};

describe('<name> transformers', () => {
  it('expose exactly the response fields (no audit, soft-delete or parent columns)', () => {
    expect(Object.keys(to<PascalSingular>Response(header)).sort()).toEqual(Object.keys(<camelSingular>ResponseSchema.shape).sort());
    expect(Object.keys(to<PascalSingular><DetailPascalSingular>ListResponse([<detailCamelSingular>]).at(0) ?? {}).sort()).toEqual(
      Object.keys(<camelSingular><DetailPascalSingular>ResponseSchema.shape).sort(),
    );
  });

  it('map lists', () => {
    expect(to<PascalSingular>ListResponse([header, header])).toHaveLength(2);
  });
});
```

---

### Step 13: Create Controller Test (`src/modules/<name>/<name>.controller.test.ts`)

The routes run on a bare Hono app with the request context and the error handler, the service spied — routes, validation, controller and transformer together. Authentication is proven for every route by `test/default-deny.e2e.test.ts` once mounted in `createApp()`.

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import type { <PascalSingular>, <PascalSingular><DetailPascalSingular> } from '../../database/schema';
import { <camelSingular><DetailPascalSingular>NotFoundMessage } from './<name>.messages';
import { <camelPlural>Router } from './<name>.routes';
import { <camelPlural>Service } from './<name>.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const <DETAIL_UPPER_SINGULAR>_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8da0';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const audit = { createdAt: AT, updatedAt: AT, createdBy: 'system', updatedBy: 'system' };
const header: <PascalSingular> = { id: ID, code: 'H-1', note: null, deletedAt: null, ...audit };
const <detailCamelSingular>: <PascalSingular><DetailPascalSingular> = { id: <DETAIL_UPPER_SINGULAR>_ID, <camelSingular>Id: ID, description: 'First', quantity: 1, ...audit };

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
      spyOn(<camelPlural>Service, 'create<PascalSingular>').mockImplementation(async () => header),
      spyOn(<camelPlural>Service, 'get<PascalSingular>ById').mockImplementation(async () => header),
      spyOn(<camelPlural>Service, 'list<PascalPlural>').mockImplementation(async () => ({ records: [header], total: 1 })),
      spyOn(<camelPlural>Service, 'update<PascalSingular>').mockImplementation(async () => header),
      spyOn(<camelPlural>Service, 'delete<PascalSingular>').mockImplementation(async () => undefined),
      spyOn(<camelPlural>Service, 'restore<PascalSingular>').mockImplementation(async () => header),
      spyOn(<camelPlural>Service, 'list<DetailPascalPlural>').mockImplementation(async () => [<detailCamelSingular>]),
      spyOn(<camelPlural>Service, 'add<DetailPascalSingular>').mockImplementation(async () => <detailCamelSingular>),
      spyOn(<camelPlural>Service, 'update<DetailPascalSingular>').mockImplementation(async (_id, <detailCamelSingular>Id) => {
        if (<detailCamelSingular>Id !== <DETAIL_UPPER_SINGULAR>_ID) throw new NotFoundError(<camelSingular><DetailPascalSingular>NotFoundMessage(<detailCamelSingular>Id));
        return <detailCamelSingular>;
      }),
      spyOn(<camelPlural>Service, 'delete<DetailPascalSingular>').mockImplementation(async () => undefined),
      spyOn(<camelPlural>Service, 'sync<DetailPascalPlural>').mockImplementation(async () => [<detailCamelSingular>]),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('header: create (201), invalid input (400), list with meta, get, update, delete, restore', async () => {
    expect((await app.request('/', send('POST', { code: 'H-1' }))).status).toBe(201);
    expect((await app.request('/', send('POST', {}))).status).toBe(400);
    const list = await app.request('/?page=1&per_page=10');
    expect(((await list.json()) as { meta: unknown }).meta).toEqual({ current_page: 1, per_page: 10, total_items: 1, total_pages: 1 });
    expect((await app.request(`/${ID}`)).status).toBe(200);
    expect((await app.request(`/${ID}`, send('PATCH', { note: 'changed' }))).status).toBe(200);
    expect((await app.request(`/${ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });

  it('<detailCamelPlural>: list, add (201), save the whole list, update, delete — snake_case on the wire', async () => {
    const res = await app.request(`/${ID}/<detail-plural>`);
    const body = (await res.json()) as { data: { quantity: number; created_at: string }[] };

    expect(body.data.at(0)).toMatchObject({ quantity: 1, created_at: '2026-10-05T03:00:00.000Z' });
    expect((await app.request(`/${ID}/<detail-plural>`, send('POST', { description: 'First', quantity: 1 }))).status).toBe(201);
    expect((await app.request(`/${ID}/<detail-plural>`, send('PUT', { <detail_snake_plural>: [{ description: 'First', quantity: 1 }] }))).status).toBe(200);
    expect((await app.request(`/${ID}/<detail-plural>/${<DETAIL_UPPER_SINGULAR>_ID}`, send('PATCH', { quantity: 2 }))).status).toBe(200);
    expect((await app.request(`/${ID}/<detail-plural>/${<DETAIL_UPPER_SINGULAR>_ID}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('an <detailCamelSingular> of another header is a 404 (never another header\'s row)', async () => {
    const res = await app.request(`/${ID}/<detail-plural>/${MISSING}`, send('PATCH', { quantity: 2 }));

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('ERR_NOT_FOUND');
  });
});
```

---

### Step 14: Verify the Quality Gate

Same as `SKILL.md` Step 15: add an integration test for own queries, locks or unique indexes, then `bun run validate:full`.
