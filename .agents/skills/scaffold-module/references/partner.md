# Scaffold Variant — Partner Endpoint (Inbound Partner API)

Use this variant for endpoints that **partner systems** call server-to-server with signed requests (`partnerAuth()`, signing v1 — `docs/partner-integration-guide.md`), not users with access tokens. Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. This file replaces Steps 2–11 of `SKILL.md`.

- **Channel files** (plan D24): routes and controller are `<name>.partner.routes.ts` / `<name>.partner.controller.ts`. ESLint (`local/inbound-channel`) allows `currentPartner()` / `requirePartner()` only in `*.partner.*` files and forbids `requireRole()` / `currentUser()` there; `test/structure.test.ts` fails when a `*.partner.routes.ts` router is mounted anywhere but `<API_BASE_PATH>/v1/partner`, or when anything else is mounted there.
- **Who is calling** comes from the verified signature (`currentPartner().code`), never from the body — a partner cannot act as another. Every read is scoped to the calling partner (no cross-partner access).
- **Idempotency** (plan D28): the partner sends its own reference (transaction number); `(partner_code, partner_reference)` is unique, so a retry of the same request is a 409, never a duplicate row.
- **Access**: the partner credential's `allowed_routes` must list `/<name>` and `/<name>/*` (relative to `/partner`). For an endpoint meant for one partner only, add `requirePartner('<code>')` after `describeEndpoint()` (plan D27).
- A module may also have `<name>.routes.ts` for admins/users (bearer); keep each channel in its own files.

---

### Step 1: Create Drizzle Schema (`src/database/schema/domain/<name>.schema.ts`)

```typescript
import { varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';

/** Written by partners: one row per partner reference (idempotent retries). */
export const <camelPlural> = appTable(
  '<snake_plural>',
  {
    id: uuidPrimaryKey(),
    /** The partner that sent it (from the verified signature, never from the body). */
    partnerCode: varchar('partner_code', { length: 50 }).notNull(),
    /** The partner's own reference, e.g. its transaction number. */
    partnerReference: varchar('partner_reference', { length: 100 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [
    activeUniqueIndex(
      '<snake_plural>_partner_reference_uq',
      [table.partnerCode, table.partnerReference],
      table.deletedAt,
    ),
  ],
);

export type <PascalSingular> = typeof <camelPlural>.$inferSelect;
```

Re-export it in `src/database/schema/domain/index.ts` (`export * from './<name>.schema';`), then `bun run db:generate`.

---

### Step 2: Create DTOs (`src/modules/<name>/<name>.dto.ts`)

```typescript
import { z } from 'zod';
import { isoInstant } from '../../core/openapi';

const partnerReferenceField = z
  .string()
  .regex(/^[A-Za-z0-9._:/-]{1,100}$/, 'Must be 1-100 of [A-Za-z0-9._:/-]');

export const create<PascalSingular>Schema = z.object({
  partnerReference: partnerReferenceField,
  description: z.string().trim().min(1, 'Description is required').max(255),
});

export type Create<PascalSingular>Dto = z.infer<typeof create<PascalSingular>Schema>;

export const <camelSingular>ReferenceParamSchema = z.object({ reference: partnerReferenceField });

export type <PascalSingular>ReferenceParamDto = z.infer<typeof <camelSingular>ReferenceParamSchema>;

export const <camelSingular>ResponseSchema = z.object({
  id: z.string().uuid(),
  partnerReference: z.string(),
  description: z.string(),
  createdAt: isoInstant(),
});

export type <PascalSingular>Response = z.infer<typeof <camelSingular>ResponseSchema>;
```

---

### Step 3: Create Messages (`src/modules/<name>/<name>.messages.ts`)

```typescript
import type { LocalizedMessage } from '../../core/i18n';

export const <UPPER_SINGULAR>_MESSAGES = {
  CREATED: { id: 'Data partner berhasil disimpan', en: 'Partner record saved successfully' },
  RETRIEVED: { id: 'Data partner berhasil diambil', en: 'Partner record retrieved successfully' },
  REFERENCE_TAKEN: {
    id: 'Referensi ini sudah pernah dikirim',
    en: 'This reference has already been submitted',
  },
  REFERENCE_ALREADY_USED: {
    id: 'Gunakan referensi baru untuk data baru',
    en: 'Use a new reference for new data',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const <camelSingular>NotFoundMessage = (reference: string): LocalizedMessage => ({
  id: `Data dengan referensi '${reference}' tidak ditemukan`,
  en: `Record with reference '${reference}' not found`,
});
```

---

### Step 4: Create Repository (`src/modules/<name>/<name>.repository.ts`)

```typescript
import { and, eq } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { <camelPlural>, type <PascalSingular> } from '../../database/schema';

export class <PascalPlural>Repository extends BaseRepository<typeof <camelPlural>> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(<camelPlural>, txHost);
  }

  /** The live record of this partner with this reference (never another partner's). */
  async findByPartnerReference(partnerCode: string, reference: string): Promise<<PascalSingular> | null> {
    const rows = await this.txHost.tx
      .select()
      .from(<camelPlural>)
      .where(
        this.scoped(
          and(eq(<camelPlural>.partnerCode, partnerCode), eq(<camelPlural>.partnerReference, reference)),
        ),
      )
      .limit(1);
    return rows.at(0) ?? null;
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
  partnerReference: record.partnerReference,
  description: record.description,
  createdAt: record.createdAt,
});
```

---

### Step 6: Create Service (`src/modules/<name>/<name>.service.ts`)

```typescript
import { ConflictError, NotFoundError } from '../../core/errors';
import { isUniqueViolation } from '../../database/unique-violation';
import type { <PascalSingular> } from '../../database/schema';
import type { Create<PascalSingular>Dto } from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES, <camelSingular>NotFoundMessage } from './<name>.messages';
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';

const referenceTaken = (): ConflictError =>
  new ConflictError(<UPPER_SINGULAR>_MESSAGES.REFERENCE_TAKEN, {
    details: [{ field: 'partner_reference', message: <UPPER_SINGULAR>_MESSAGES.REFERENCE_ALREADY_USED }],
  });

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  /** One row per (partner, reference): the unique index decides, so a retry is a 409. */
  async createForPartner(partnerCode: string, dto: Create<PascalSingular>Dto): Promise<<PascalSingular>> {
    try {
      return await this.repository.create({ partnerCode, ...dto });
    } catch (error) {
      if (isUniqueViolation(error)) throw referenceTaken();
      throw error;
    }
  }

  async getForPartner(partnerCode: string, reference: string): Promise<<PascalSingular>> {
    const record = await this.repository.findByPartnerReference(partnerCode, reference);
    if (!record) throw new NotFoundError(<camelSingular>NotFoundMessage(reference));
    return record;
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 7: Create Partner Controller (`src/modules/<name>/<name>.partner.controller.ts`)

```typescript
import {
  asyncHandler,
  currentPartner,
  getValidatedBody,
  getValidatedParams,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type { Create<PascalSingular>Dto, <PascalSingular>ReferenceParamDto } from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';
import { to<PascalSingular>Response } from './<name>.transformer';

export class <PascalPlural>PartnerController {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<Create<PascalSingular>Dto>(c);
    const record = await this.service.createForPartner(currentPartner().code, dto);
    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.CREATED, 201);
  });

  getByReference = asyncHandler(async (c) => {
    const { reference } = getValidatedParams<<PascalSingular>ReferenceParamDto>(c);
    const record = await this.service.getForPartner(currentPartner().code, reference);
    return new ApiResponse(to<PascalSingular>Response(record), <UPPER_SINGULAR>_MESSAGES.RETRIEVED, 200);
  });
}

export const <camelPlural>PartnerController = new <PascalPlural>PartnerController();
```

---

### Step 8: Create Partner Routes (`src/modules/<name>/<name>.partner.routes.ts`)

No `requireRole()` here: `partnerAuth()` already verified the partner (signature, IP whitelist, `allowed_routes`, nonce, rate limit). OpenAPI marks these operations with the partner signing headers automatically.

```typescript
import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import {
  create<PascalSingular>Schema,
  <camelSingular>ReferenceParamSchema,
  <camelSingular>ResponseSchema,
} from './<name>.dto';
import { <camelPlural>PartnerController } from './<name>.partner.controller';

export const <camelPlural>PartnerRoutes = new Hono();
const tags = ['Partner — <PascalPlural>'];

<camelPlural>PartnerRoutes.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Submit a record (idempotent per partner reference)',
    response: { status: 201, description: 'Saved', data: <camelSingular>ResponseSchema },
    errors: [409],
  }),
  validate({ body: create<PascalSingular>Schema }),
  <camelPlural>PartnerController.create,
);
<camelPlural>PartnerRoutes.get(
  '/:reference',
  describeEndpoint({
    tags,
    summary: 'Get a record of the calling partner by its reference',
    response: { status: 200, description: 'Found', data: <camelSingular>ResponseSchema },
    errors: [404],
  }),
  validate({ params: <camelSingular>ReferenceParamSchema }),
  <camelPlural>PartnerController.getByReference,
);
```

---

### Step 9: Register Route in `src/app.ts`

```typescript
import { <camelPlural>PartnerRoutes } from './modules/<name>/<name>.partner.routes';

// Inside createApp(), on the versioned router — under /partner (partnerAuth), never elsewhere
v1.route('/partner/<name>', <camelPlural>PartnerRoutes);
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

  it('finds a live record of one partner by reference', async () => {
    expect(await repository.findByPartnerReference('acme', 'TRX-1')).toBeNull();

    const statement = recorder.statements.at(0);
    expect(statement?.sql).toContain('"<snake_plural>"."deleted_at" is null');
    expect(statement?.sql).toContain('"<snake_plural>"."partner_code" = $1');
    expect(statement?.params.slice(0, 2)).toEqual(['acme', 'TRX-1']);
  });
});
```

---

### Step 11: Create Service Test (`src/modules/<name>/<name>.service.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { ConflictError, NotFoundError } from '../../core/errors';
import type { <PascalSingular> } from '../../database/schema';
import type { <PascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

const record: <PascalSingular> = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  partnerCode: 'acme',
  partnerReference: 'TRX-1',
  description: 'First',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'partner:acme',
  updatedBy: 'partner:acme',
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

describe('<PascalPlural>Service (Unit)', () => {
  it('stores the calling partner, and a repeated reference is a 409', async () => {
    const created: unknown[] = [];
    const service = new <PascalPlural>Service({
      create: async (values: unknown) => {
        created.push(values);
        if (created.length > 1) throw Object.assign(new Error('duplicate'), { code: '23505' });
        return record;
      },
    } as unknown as <PascalPlural>Repository);
    const dto = { partnerReference: 'TRX-1', description: 'First' };

    expect(await service.createForPartner('acme', dto)).toBe(record);
    expect(created).toEqual([{ partnerCode: 'acme', ...dto }]);
    expect(await rejectionOf(service.createForPartner('acme', dto))).toBeInstanceOf(ConflictError);
  });

  it('reads only the calling partner\'s records', async () => {
    const service = new <PascalPlural>Service({
      findByPartnerReference: async (partnerCode: string) => (partnerCode === 'acme' ? record : null),
    } as unknown as <PascalPlural>Repository);

    expect(await service.getForPartner('acme', 'TRX-1')).toBe(record);
    expect(await rejectionOf(service.getForPartner('other', 'TRX-1'))).toBeInstanceOf(NotFoundError);
  });
});
```

---

### Step 12: Create Transformer Test (`src/modules/<name>/<name>.transformer.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { <camelSingular>ResponseSchema } from './<name>.dto';
import { to<PascalSingular>Response } from './<name>.transformer';

describe('to<PascalSingular>Response', () => {
  it('exposes only the response fields (not the partner code or audit columns)', () => {
    const response = to<PascalSingular>Response({
      id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
      partnerCode: 'acme',
      partnerReference: 'TRX-1',
      description: 'First',
      createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
      updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
      createdBy: 'partner:acme',
      updatedBy: 'partner:acme',
      deletedAt: null,
    });

    expect(Object.keys(response).sort()).toEqual(Object.keys(<camelSingular>ResponseSchema.shape).sort());
  });
});
```

---

### Step 13: Create Partner Controller Test (`src/modules/<name>/<name>.partner.controller.test.ts`)

The controller is tested behind a stand-in for `partnerAuth()` that marks the request as coming from a verified partner; signing itself is tested in `src/core/middlewares/partner-auth.test.ts` and end to end in `test/partner-gateway.e2e.test.ts` (signed requests through `createApp()`).

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { setAuthenticatedPartner } from '../../core/context/request-context';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import type { <PascalSingular> } from '../../database/schema';
import { <camelPlural>PartnerRoutes } from './<name>.partner.routes';
import { <camelPlural>Service } from './<name>.service';

const record: <PascalSingular> = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  partnerCode: 'acme',
  partnerReference: 'TRX-1',
  description: 'First',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'partner:acme',
  updatedBy: 'partner:acme',
  deletedAt: null,
};

const app = new Hono();
app.use('*', requestContextMiddleware());
app.use('*', async (_c, next) => {
  setAuthenticatedPartner({ code: 'acme' });
  await next();
});
app.route('/', <camelPlural>PartnerRoutes);
app.onError(globalErrorHandler);

describe('<PascalPlural>PartnerController', () => {
  const calls: unknown[][] = [];
  const spies: { mockRestore: () => void }[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(<camelPlural>Service, 'createForPartner').mockImplementation(async (partnerCode, dto) => {
        calls.push(['create', partnerCode, dto]);
        return record;
      }),
      spyOn(<camelPlural>Service, 'getForPartner').mockImplementation(async (partnerCode, reference) => {
        calls.push(['get', partnerCode, reference]);
        return record;
      }),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('creates for the verified partner, never one named in the body', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_reference: 'TRX-1', description: 'First' }),
    });

    expect(res.status).toBe(201);
    expect(calls).toContainEqual(['create', 'acme', { partnerReference: 'TRX-1', description: 'First' }]);
  });

  it('reads by reference for the verified partner', async () => {
    const res = await app.request('/TRX-1');
    const body = (await res.json()) as { data: { partner_reference: string } };

    expect(res.status).toBe(200);
    expect(body.data.partner_reference).toBe('TRX-1');
    expect(calls).toContainEqual(['get', 'acme', 'TRX-1']);
  });
});
```
