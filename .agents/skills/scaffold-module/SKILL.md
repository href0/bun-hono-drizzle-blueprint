---
name: scaffold-module
description: Scaffold a new feature/domain module strictly adhering to Clean Architecture, Drizzle multi-schema, Zod DTOs, TransactionHost Repository, and >=95% test coverage.
---

# Scaffold Feature Module

Use this skill when asked to create, add, or scaffold a new domain/feature module under `src/modules/<module-name>/`.

---

## 1. Mandatory File Structure

Every feature module with write capabilities (`INSERT`, `UPDATE`, `DELETE`) **MUST** include:

```
src/modules/<name>/
├── <name>.controller.ts
├── <name>.controller.test.ts
├── <name>.dto.ts
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
- **Route Prefix**: `/api/v1/<kebab-case-plural>` (e.g. `/api/v1/products`).
- **Table Name**: Plural `snake_case` under schema `domain` (e.g. `domain.products`).

---

### Step 2: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

```typescript
import { uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { domainTable } from '../../database/schema';

export const <camelPlural> = domainTable('<snake_plural>', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
export type New<PascalSingular> = typeof <camelPlural>.$inferInsert;
```

**Re-Export in `src/database/schema/domain/index.ts`:**
```typescript
export * from './<name>.schema';
```

---

### Step 3: Create DTOs with Zod (`src/modules/<name>/<name>.dto.ts`)

```typescript
import { z } from 'zod';

export const create<PascalSingular>Schema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export const update<PascalSingular>Schema = create<PascalSingular>Schema.partial();

export const <camelSingular>IdParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export const <camelSingular>QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type Create<PascalSingular>Dto = z.infer<typeof create<PascalSingular>Schema>;
export type Update<PascalSingular>Dto = z.infer<typeof update<PascalSingular>Schema>;
export type <PascalSingular>IdParamDto = z.infer<typeof <camelSingular>IdParamSchema>;
export type <PascalSingular>QueryDto = z.infer<typeof <camelSingular>QuerySchema>;
```

---

### Step 4: Create Repository (`src/modules/<name>/<name>.repository.ts`)

> **ESLint Guard**: DO NOT import `db` directly. Use `TransactionHost`.

```typescript
import { eq, count } from 'drizzle-orm';
import { TransactionHost, txHost as defaultTxHost } from '../../database';
import { <camelPlural>, type <PascalSingular>, type New<PascalSingular> } from '../../database/schema';

export class <PascalPlural>Repository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async findById(id: string): Promise<<PascalSingular> | null> {
    const [record] = await this.txHost.tx
      .select()
      .from(<camelPlural>)
      .where(eq(<camelPlural>.id, id))
      .limit(1);
    return record ?? null;
  }

  async create(data: New<PascalSingular>): Promise<<PascalSingular>> {
    const result = await this.txHost.tx
      .insert(<camelPlural>)
      .values(data)
      .returning();
    const created = result[0];
    if (!created) {
      throw new Error(
        'INSERT returned no rows — unexpected database-level rejection.',
      );
    }
    return created;
  }

  async findAll(limit: number, offset: number): Promise<<PascalSingular>[]> {
    return this.txHost.tx
      .select()
      .from(<camelPlural>)
      .limit(limit)
      .offset(offset);
  }

  async count(): Promise<number> {
    const [result] = await this.txHost.tx.select({ val: count() }).from(<camelPlural>);
    return Number(result?.val ?? 0);
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
```

---

### Step 5: Create Transformer (`src/modules/<name>/<name>.transformer.ts`)

```typescript
import type { <PascalSingular> } from '../../database/schema';

export interface <PascalSingular>Response {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const to<PascalSingular>Response = (entity: <PascalSingular>): <PascalSingular>Response => ({
  id: entity.id,
  name: entity.name,
  isActive: entity.isActive,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const to<PascalSingular>ListResponse = (entities: <PascalSingular>[]): <PascalSingular>Response[] =>
  entities.map(to<PascalSingular>Response);
```

---

### Step 6: Create Service (`src/modules/<name>/<name>.service.ts`)

```typescript
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';
import { NotFoundError } from '../../core/errors';
import type { Create<PascalSingular>Dto, <PascalSingular>QueryDto } from './<name>.dto';
import type { <PascalSingular> } from '../../database/schema';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  async create<PascalSingular>(dto: Create<PascalSingular>Dto): Promise<<PascalSingular>> {
    return this.repository.create({ ...dto });
  }

  async get<PascalSingular>ById(id: string): Promise<<PascalSingular>> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundError(`<PascalSingular> with ID '${id}' not found`);
    }
    return record;
  }

  async list<PascalPlural>(query: <PascalSingular>QueryDto): Promise<{ records: <PascalSingular>[]; total: number }> {
    const offset = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.repository.findAll(query.limit, offset),
      this.repository.count(),
    ]);
    return { records, total };
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 7: Create Controller (`src/modules/<name>/<name>.controller.ts`)

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
import type { Create<PascalSingular>Dto, <PascalSingular>IdParamDto, <PascalSingular>QueryDto } from './<name>.dto';

export class <PascalPlural>Controller {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<Create<PascalSingular>Dto>(c);
    const created = await this.service.create<PascalSingular>(dto);
    const responseData = to<PascalSingular>Response(created);

    return new ApiResponse(responseData, '<PascalSingular> created successfully', 201);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<<PascalSingular>IdParamDto>(c);
    const record = await this.service.get<PascalSingular>ById(param.id);
    const responseData = to<PascalSingular>Response(record);

    return new ApiResponse(responseData, '<PascalSingular> retrieved successfully', 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<<PascalSingular>QueryDto>(c);
    const { records, total } = await this.service.list<PascalPlural>(query);
    const responseData = to<PascalSingular>ListResponse(records);
    const totalPages = Math.ceil(total / query.limit) || 1;

    return new ApiResponse(responseData, '<PascalPlural> retrieved successfully', 200, {
      currentPage: query.page,
      perPage: query.limit,
      totalItems: total,
      totalPages,
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
import { <camelPlural>Controller } from './<name>.controller';
import {
  create<PascalSingular>Schema,
  <camelSingular>IdParamSchema,
  <camelSingular>QuerySchema,
} from './<name>.dto';

const router = new Hono();

router.post('/', validate({ body: create<PascalSingular>Schema }), <camelPlural>Controller.create);
router.get('/', validate({ query: <camelSingular>QuerySchema }), <camelPlural>Controller.list);
router.get('/:id', validate({ params: <camelSingular>IdParamSchema }), <camelPlural>Controller.getById);

export { router as <camelPlural>Router };
```

---

### Step 9: Register Route in `src/app.ts`

```typescript
import { <camelPlural>Router } from './modules/<name>/<name>.routes';

// Inside createApp()
app.route('/api/v1/<name>', <camelPlural>Router);
```

---

### Step 10: Create Co-Located Tests & Verify Quality Gate

Create unit tests covering repository, service, transformer, and controller.
Run:
```bash
bun run validate:full
```
Verify that all static checks pass and line coverage remains $\ge 95.0\%$.
