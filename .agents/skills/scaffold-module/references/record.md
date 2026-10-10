# Scaffold Variant — Record (Append-Only)

Use this variant for high-volume rows that are only ever written once and read back: activity logs, status history, delivery attempts. Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. This file replaces Steps 2–11 of `SKILL.md`.

- `sequentialPrimaryKey()` (`bigint` identity): cheap inserts in order. It is **never** a public resource id — records are listed and filtered, not fetched by `/:id`.
- `AppendOnlyRepository`: `append`, `findPage`, `count`; no update, no delete, nothing audited (the table is the record).
- The table **must** be listed in `APPEND_ONLY_TABLES` (`src/database/schema/append-only-tables.ts`) with its reason — the schema convention test fails otherwise.

---

### Step 1: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

```typescript
import { varchar } from 'drizzle-orm/pg-core';
import { sequentialPrimaryKey, timestamps } from '../columns';
import { appTable } from '../schemas';

/** Record table: append-only, sequential key (listed in APPEND_ONLY_TABLES). */
export const <camelPlural> = appTable('<snake_plural>', {
  id: sequentialPrimaryKey(),
  kind: varchar('kind', { length: 50 }).notNull(),
  detail: varchar('detail', { length: 500 }),
  ...timestamps(),
});

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
```

Re-export it in `src/database/schema/domain/index.ts` (`export * from './<name>.schema';`), register it in `APPEND_ONLY_TABLES`:

```text
export const APPEND_ONLY_TABLES: Readonly<Record<string, string>> = {
  record_changes: '…',
  <snake_plural>: '<why: append-only, high volume, never addressed by id>',
};
```

then `bun run db:generate`.

---

### Step 2: Create DTOs (`src/modules/<name>/<name>.dto.ts`)

The sequential id is exposed as a number only for ordering and paging; it is not an address.

```typescript
import { z } from 'zod';
import { isoInstant } from '../../core/openapi';

export const append<PascalSingular>Schema = z.object({
  kind: z.string().min(1, 'Kind is required').max(50),
  detail: z.string().max(500).optional(),
});

export type Append<PascalSingular>Dto = z.infer<typeof append<PascalSingular>Schema>;

export const list<PascalPlural>QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  kind: z.string().max(50).optional(),
});

export type List<PascalPlural>QueryDto = z.infer<typeof list<PascalPlural>QuerySchema>;

export const <camelSingular>ResponseSchema = z.object({
  id: z.number().int(),
  kind: z.string(),
  detail: z.string().nullable(),
  createdAt: isoInstant(),
});

export type <PascalSingular>Response = z.infer<typeof <camelSingular>ResponseSchema>;
```

---

### Step 3: Create Messages (`src/modules/<name>/<name>.messages.ts`)

```typescript
import type { LocalizedMessage } from '../../core/i18n';

export const <UPPER_SINGULAR>_MESSAGES = {
  APPENDED: { id: 'Catatan berhasil disimpan', en: 'Record saved successfully' },
  LIST_RETRIEVED: { id: 'Daftar catatan berhasil diambil', en: 'Records retrieved successfully' },
} as const satisfies Record<string, LocalizedMessage>;
```

---

### Step 4: Create Repository (`src/modules/<name>/<name>.repository.ts`)

```typescript
import { AppendOnlyRepository, defaultTxHost, type TransactionHost } from '../../database';
import { <camelPlural> } from '../../database/schema';

export class <PascalPlural>Repository extends AppendOnlyRepository<typeof <camelPlural>> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, txHost);
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
```

---

### Step 5: Create Transformer (`src/modules/<name>/<name>.transformer.ts`)

```typescript
import type { <PascalSingular> } from '../../database/schema';
import type { <PascalSingular>Response } from './<name>.dto';

export const to<PascalSingular>Response = (record: <PascalSingular>): <PascalSingular>Response => ({
  id: record.id,
  kind: record.kind,
  detail: record.detail,
  createdAt: record.createdAt,
});

export const to<PascalSingular>ListResponse = (records: <PascalSingular>[]): <PascalSingular>Response[] =>
  records.map(to<PascalSingular>Response);
```

---

### Step 6: Create Service (`src/modules/<name>/<name>.service.ts`)

```typescript
import { eq } from 'drizzle-orm';
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';
import { <camelPlural>, type <PascalSingular> } from '../../database/schema';
import type { Append<PascalSingular>Dto, List<PascalPlural>QueryDto } from './<name>.dto';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  async append<PascalSingular>(dto: Append<PascalSingular>Dto): Promise<<PascalSingular>> {
    return this.repository.append({ ...dto });
  }

  /** Newest first, optionally of one kind. */
  async list<PascalPlural>(query: List<PascalPlural>QueryDto): Promise<{ records: <PascalSingular>[]; total: number }> {
    const where = query.kind === undefined ? undefined : eq(<camelPlural>.kind, query.kind);
    const [records, total] = await Promise.all([
      this.repository.findPage({ page: query.page, perPage: query.perPage, where }),
      this.repository.count(where),
    ]);
    return { records, total };
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 7: Create Controller (`src/modules/<name>/<name>.controller.ts`)

```typescript
import { asyncHandler, getValidatedBody, getValidatedQuery } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';
import { to<PascalSingular>ListResponse, to<PascalSingular>Response } from './<name>.transformer';
import type { Append<PascalSingular>Dto, List<PascalPlural>QueryDto } from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';

export class <PascalPlural>Controller {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  append = asyncHandler(async (c) => {
    const record = await this.service.append<PascalSingular>(getValidatedBody<Append<PascalSingular>Dto>(c));
    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.APPENDED, 201);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<List<PascalPlural>QueryDto>(c);
    const { records, total } = await this.service.list<PascalPlural>(query);
    return new ApiResponse(to<PascalSingular>ListResponse(records), <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages: Math.ceil(total / query.perPage) || 1,
    });
  });
}

export const <camelPlural>Controller = new <PascalPlural>Controller();
```

---

### Step 8: Create Routes (`src/modules/<name>/<name>.routes.ts`)

```typescript
import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { <camelPlural>Controller } from './<name>.controller';
import {
  append<PascalSingular>Schema,
  list<PascalPlural>QuerySchema,
  <camelSingular>ResponseSchema,
} from './<name>.dto';

const router = new Hono();
const tags = ['<PascalPlural>'];

router.post(
  '/',
  describeEndpoint({ tags, summary: 'Append a record', response: { status: 201, description: 'Saved', data: <camelSingular>ResponseSchema } }),
  validate({ body: append<PascalSingular>Schema }),
  <camelPlural>Controller.append,
);
router.get(
  '/',
  describeEndpoint({ tags, summary: 'List records, newest first (paginated, optional kind)', response: { status: 200, description: 'A page', paginatedItem: <camelSingular>ResponseSchema } }),
  validate({ query: list<PascalPlural>QuerySchema }),
  <camelPlural>Controller.list,
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

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { <PascalPlural>Repository } from './<name>.repository';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';

describe('<PascalPlural>Repository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new <PascalPlural>Repository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('lists newest first', async () => {
    await repository.findPage({ page: 1, perPage: 20 });

    expect(recorder.statements.at(0)?.sql).toContain(
      'from "<snake_plural>" order by "<snake_plural>"."id" desc limit $1',
    );
  });
});
```
