# Scaffold Variant — Record (Append-Only)

Use this variant for high-volume rows that are only ever written once and read back: activity logs, status history, delivery attempts. Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. This file replaces Steps 2–11 of `SKILL.md`.

- `sequentialPrimaryKey()` (`bigint` identity): cheap inserts in order. It is **never** a public resource id — records are listed and filtered, not fetched by `/:id`.
- `AppendOnlyRepository`: `append`, `findPage`, `count`, `findList` (the list query, D41); no update, no delete, nothing audited (the table is the record).
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
import {
  instantRangeQuery,
  listQuerySchema,
  searchQueryField,
  strictListQuery,
} from '../../core/dto/list-query.dto';
import { MAX_PER_PAGE } from '../../core/dto/common.dto';
import { isoInstant } from '../../core/openapi';

export const append<PascalSingular>Schema = z.object({
  kind: z.string().min(1, 'Kind is required').max(50),
  detail: z.string().max(500).optional(),
});

export type Append<PascalSingular>Dto = z.infer<typeof append<PascalSingular>Schema>;

/** Fields the list may sort by (D41); the repository maps each one to its column. */
export const <UPPER_SINGULAR>_SORTABLE = ['createdAt', 'kind'] as const;

export type <PascalSingular>SortField = (typeof <UPPER_SINGULAR>_SORTABLE)[number];

/** `?sort=&q=&kind=&created_from=&created_to=` (20 a page); `q` searches kind and detail. */
export const list<PascalPlural>QuerySchema = strictListQuery(
  listQuerySchema(<UPPER_SINGULAR>_SORTABLE).extend({
    perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(20),
    q: searchQueryField,
    kind: z.string().max(50).optional(),
    ...instantRangeQuery('created'),
  }),
  { ranges: ['created'] },
);

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
import { and, eq } from 'drizzle-orm';
import {
  AppendOnlyRepository,
  defaultTxHost,
  instantRange,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import { <camelPlural>, type <PascalSingular> } from '../../database/schema';
import type { List<PascalPlural>QueryDto, <PascalSingular>SortField } from './<name>.dto';

/** The list's allowlist (D41): sortable fields → columns, and the columns `q` searches. */
const <UPPER_SINGULAR>_LIST_COLUMNS: ListColumns<<PascalSingular>SortField> = {
  sort: { createdAt: <camelPlural>.createdAt, kind: <camelPlural>.kind },
  search: [<camelPlural>.kind, <camelPlural>.detail],
};

export class <PascalPlural>Repository extends AppendOnlyRepository<typeof <camelPlural>> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, txHost);
  }

  /** Newest first unless sorted; the same filters for the page and the total. */
  async find<PascalSingular>List(
    query: List<PascalPlural>QueryDto,
  ): Promise<{ rows: <PascalSingular>[]; total: number }> {
    return this.findList(
      query,
      <UPPER_SINGULAR>_LIST_COLUMNS,
      and(
        query.kind === undefined ? undefined : eq(<camelPlural>.kind, query.kind),
        instantRange(<camelPlural>.createdAt, query.createdFrom, query.createdTo),
      ),
    );
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
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';
import type { <PascalSingular> } from '../../database/schema';
import type { Append<PascalSingular>Dto, List<PascalPlural>QueryDto } from './<name>.dto';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  async append<PascalSingular>(dto: Append<PascalSingular>Dto): Promise<<PascalSingular>> {
    return this.repository.append({ ...dto });
  }

  /** Newest first unless sorted; filtered by the list query. */
  async list<PascalPlural>(query: List<PascalPlural>QueryDto): Promise<{ records: <PascalSingular>[]; total: number }> {
    const { rows, total } = await this.repository.find<PascalSingular>List(query);
    return { records: rows, total };
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
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';
import {
  append<PascalSingular>Schema,
  list<PascalPlural>QuerySchema,
  <camelSingular>ResponseSchema,
} from './<name>.dto';

const router = new Hono();
const tags = ['<PascalPlural>'];

router.post(
  '/',
  describeEndpoint({ tags, summary: 'Append a record', response: { status: 201, description: 'Saved', message: <UPPER_SINGULAR>_MESSAGES.APPENDED, data: <camelSingular>ResponseSchema } }),
  validate({ body: append<PascalSingular>Schema }),
  <camelPlural>Controller.append,
);
router.get(
  '/',
  describeEndpoint({ tags, summary: 'List records, newest first (paginated, sortable, searchable, optional kind)', response: { status: 200, description: 'A page', message: <UPPER_SINGULAR>_MESSAGES.LIST_RETRIEVED, paginatedItem: <camelSingular>ResponseSchema } }),
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

  it('lists by the allowlist: sort, q and kind on the page and the total', async () => {
    recorder.respondWith([], [[0]]);

    expect(
      await repository.find<PascalSingular>List({
        page: 1,
        perPage: 20,
        sort: [{ field: 'kind', direction: 'asc' }],
        q: 'log',
        kind: 'login',
      }),
    ).toEqual({ rows: [], total: 0 });
    const where = 'where (("<snake_plural>"."kind" ilike $1 or "<snake_plural>"."detail" ilike $2) and "<snake_plural>"."kind" = $3)';
    expect(recorder.statements.map((statement) => statement.sql.slice(statement.sql.indexOf(' from ')))).toEqual([
      ` from "<snake_plural>" ${where} order by "<snake_plural>"."kind" asc, "<snake_plural>"."id" asc limit $4`,
      ` from "<snake_plural>" ${where}`,
    ]);
  });
});
```

---

### Step 11: Create Service Test (`src/modules/<name>/<name>.service.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { <PascalSingular> } from '../../database/schema';
import type { <PascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const record: <PascalSingular> = { id: 1, kind: 'login', detail: null, createdAt: AT, updatedAt: AT };

const fakeRepository = (calls: unknown[][]): <PascalPlural>Repository =>
  ({
    append: async (values: unknown) => {
      calls.push(['append', values]);
      return record;
    },
    find<PascalSingular>List: async (query: unknown) => {
      calls.push(['find<PascalSingular>List', query]);
      return { rows: [record], total: 1 };
    },
  }) as unknown as <PascalPlural>Repository;

describe('<PascalPlural>Service (Unit)', () => {
  it('appends from the DTO', async () => {
    const calls: unknown[][] = [];
    const service = new <PascalPlural>Service(fakeRepository(calls));

    expect(await service.append<PascalSingular>({ kind: 'login' })).toBe(record);
    expect(calls).toEqual([['append', { kind: 'login' }]]);
  });

  it('lists through the list query (page and total under the same filters)', async () => {
    const calls: unknown[][] = [];
    const query = { page: 1, perPage: 20, kind: 'login' };
    expect(await new <PascalPlural>Service(fakeRepository(calls)).list<PascalPlural>(query)).toEqual({
      records: [record],
      total: 1,
    });
    expect(calls).toEqual([['find<PascalSingular>List', query]]);
  });
});
```

---

### Step 12: Create Transformer Test (`src/modules/<name>/<name>.transformer.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { <PascalSingular> } from '../../database/schema';
import { <camelSingular>ResponseSchema } from './<name>.dto';
import { to<PascalSingular>ListResponse, to<PascalSingular>Response } from './<name>.transformer';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const record: <PascalSingular> = { id: 1, kind: 'login', detail: null, createdAt: AT, updatedAt: AT };

describe('to<PascalSingular>Response', () => {
  it('exposes exactly the response fields', () => {
    expect(Object.keys(to<PascalSingular>Response(record)).sort()).toEqual(Object.keys(<camelSingular>ResponseSchema.shape).sort());
  });

  it('maps a list', () => {
    expect(to<PascalSingular>ListResponse([record, record])).toHaveLength(2);
  });
});
```

---

### Step 13: Create Controller Test (`src/modules/<name>/<name>.controller.test.ts`)

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import type { <PascalSingular> } from '../../database/schema';
import { <camelPlural>Router } from './<name>.routes';
import { <camelPlural>Service } from './<name>.service';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const record: <PascalSingular> = { id: 1, kind: 'login', detail: null, createdAt: AT, updatedAt: AT };

const app = new Hono();
app.use('*', requestContextMiddleware());
app.route('/', <camelPlural>Router);
app.onError(globalErrorHandler);

describe('<PascalPlural>Controller (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];
  let list: ReturnType<typeof spyOn>;

  beforeAll(() => {
    list = spyOn(<camelPlural>Service, 'list<PascalPlural>').mockImplementation(async () => ({ records: [record], total: 1 }));
    spies.push(
      list,
      spyOn(<camelPlural>Service, 'append<PascalSingular>').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('appends (201) and answers in snake_case', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'login' }),
    });
    const body = (await res.json()) as { data: { created_at: string } };

    expect(res.status).toBe(201);
    expect(body.data.created_at).toBe('2026-10-05T03:00:00.000Z');
  });

  it('lists with pagination meta; an oversized page is a 400', async () => {
    const res = await app.request('/?kind=login');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { meta: unknown }).meta).toEqual({ current_page: 1, per_page: 20, total_items: 1, total_pages: 1 });
    expect((await app.request('/?per_page=1000')).status).toBe(400);
  });

  it('passes sort, q and kind parsed; a column outside the allowlist or an unknown parameter is a 400', async () => {
    list.mockClear();
    expect((await app.request('/?sort=-created_at&q=log&kind=login')).status).toBe(200);
    expect(list.mock.calls[0]?.[0]).toEqual({
      page: 1,
      perPage: 20,
      sort: [{ field: 'createdAt', direction: 'desc' }],
      q: 'log',
      kind: 'login',
    });

    for (const query of ['sort=detail', 'unknown=1']) {
      expect((await app.request(`/?${query}`)).status).toBe(400);
    }
  });
});
```

---

### Step 14: Verify the Quality Gate

Same as `SKILL.md` Step 15, then `bun run validate:full`.
