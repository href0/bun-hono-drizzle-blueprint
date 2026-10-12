# Scaffold Variant — Vendor Webhook (Inbound, Vendor-Owned Contract)

Use this variant when a **vendor** (payment gateway, messaging gateway, …) calls this API to notify events. The vendor owns the contract — URL is ours, but payload, signature scheme and retries are theirs (plan D23). Read `SKILL.md` first: placeholders, naming, messages, OpenAPI and test rules are the same. Working example in this repository: `src/integrations/demo-pay/` + `src/modules/payment-notifications/`.

Two parts, two places:

| Part | Where | Why |
|---|---|---|
| Vendor knowledge: signature verifier, payload schema, secret | `src/integrations/<vendor>/<vendor>.webhook.ts`, `<vendor>.webhook.dto.ts`, `src/config/<vendor>.config.ts` | Changing vendors = a new adapter; modules never see the scheme |
| Domain handling: store the event (idempotent), process it | `src/modules/<name>/<name>.webhook.routes.ts`, `.webhook.controller.ts`, service, repository | Named after the **domain** (`payment-notifications`), never the vendor (plan D26) |

Placeholders added to `SKILL.md`'s: `<vendor>` (kebab-case URL segment, e.g. `acme-pay`), `<VENDOR>` (`ACME_PAY`), `<vendorCamel>` (`acmePay`), `<VendorPascal>` (`AcmePay`).

- **URL**: `<API_BASE_PATH>/webhooks/<vendor>` — outside `/v1` (the vendor's contract has its own version). Everything under `<API_BASE_PATH>/webhooks/*` is fail-closed: a route whose vendor has no verifier in `WEBHOOK_VENDORS` answers 401.
- **Verify exactly what the vendor documents** (usually an HMAC of the raw body plus a timestamp, compared in constant time). The scheme below is a placeholder — replace it with the vendor's, never invent one. `webhookAuth()` hands the verifier the raw bytes as received.
- **Payload casing is the vendor's**: `validate({ body, bodyKeys: 'verbatim' })` (allowed only in `*.webhook.*` files) — no snake_case check, no conversion.
- **Idempotent** (plan D28): vendors resend the same event when they do not get a 2xx in time. The service inserts into `webhook_events` (`ON CONFLICT (vendor, event_id) DO NOTHING`) and processes in **one transaction**: a failure leaves no row (the retry is processed), a duplicate is acknowledged with 200 and skipped.
- **Answer fast**: 200 as soon as the event is stored and handled. Long work belongs in a job queue (backlog).

---

### Step 1: Create the vendor config (`src/config/<vendor>.config.ts`)

```typescript
import { z } from 'zod';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

/** `<VENDOR>_*` — webhook secret from the vendor dashboard. Empty = webhooks disabled (all 401). */
const <vendorCamel>Schema = z.object({
  <VENDOR>_WEBHOOK_SECRET: z.string().default(''),
  <VENDOR>_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
});

export type <VendorPascal>Config = z.infer<typeof <vendorCamel>Schema>;

export const build<VendorPascal>Config = (source: EnvSource): <VendorPascal>Config =>
  parseEnv('<vendor>', <vendorCamel>Schema, source);

export const <vendorCamel>Config = build<VendorPascal>Config(envSource);
```

Export it from `src/config/index.ts` (`export * from './<vendor>.config';`), add both variables to `.env.example` (and plan L1), and register the vendor in `src/integrations/registry.ts`:

```text
<VENDOR>: { code: '<VENDOR>', institution: '<Vendor display name>' },
```

---

### Step 2: Describe the vendor payload (`src/integrations/<vendor>/<vendor>.webhook.dto.ts`)

```typescript
import { z } from 'zod';

/** The vendor's webhook payload, exactly as sent (its casing). Unknown fields are ignored. */
export const <vendorCamel>WebhookPayloadSchema = z.object({
  /** The vendor's event id: the deduplication key (`webhook_events.event_id`). */
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
});

export type <VendorPascal>WebhookPayload = z.infer<typeof <vendorCamel>WebhookPayloadSchema>;
```

---

### Step 3: Create the verifier (`src/integrations/<vendor>/<vendor>.webhook.ts`)

```typescript
import { createHmac } from 'node:crypto';
import { <vendorCamel>Config, type <VendorPascal>Config } from '../../config';
import type { WebhookVendor } from '../../core/middlewares/webhook-auth';
import { timingSafeEqualHex } from '../../utils/crypto.util';

// PLACEHOLDER SCHEME — replace with the vendor's documented one (header names, signed content,
// encoding). Here: timestamp header (Unix seconds) + `v1=<hex HMAC-SHA256(secret, "<ts>.<body>")>`.
const TIMESTAMP_HEADER = 'x-<vendor>-timestamp';
const SIGNATURE_HEADER = 'x-<vendor>-signature';
const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/;

const hmacHex = (secret: string, timestamp: string, body: Uint8Array): string =>
  createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(body).digest('hex');

/** The signature header value the vendor would send (tests, probes). */
export const sign<VendorPascal>Webhook = (secret: string, timestamp: string, body: string): string =>
  `v1=${hmacHex(secret, timestamp, Buffer.from(body))}`;

/** Registered once in `createApp()` (`WEBHOOK_VENDORS`). */
export const create<VendorPascal>Webhook = (
  settings: Pick<<VendorPascal>Config, '<VENDOR>_WEBHOOK_SECRET' | '<VENDOR>_WEBHOOK_TOLERANCE_SECONDS'> = <vendorCamel>Config,
): WebhookVendor => ({
  vendor: '<vendor>',
  signatureHeader: SIGNATURE_HEADER,
  verify: ({ body, header, nowMs }): boolean => {
    const secret = settings.<VENDOR>_WEBHOOK_SECRET;
    const timestamp = header(TIMESTAMP_HEADER) ?? '';
    const signature = SIGNATURE_PATTERN.exec(header(SIGNATURE_HEADER) ?? '')?.at(1);
    if (secret === '' || !TIMESTAMP_PATTERN.test(timestamp) || signature === undefined) {
      return false;
    }
    if (Math.abs(nowMs / 1000 - Number(timestamp)) > settings.<VENDOR>_WEBHOOK_TOLERANCE_SECONDS) {
      return false;
    }
    return timingSafeEqualHex(hmacHex(secret, timestamp, body), signature);
  },
});

export const <vendorCamel>Webhook = create<VendorPascal>Webhook();
```

---

### Step 4: Create the public entry point (`src/integrations/<vendor>/index.ts`)

The verifier is not exported here: only `createApp()` imports it (dependency-cruiser `webhook-verifier-only-in-app`).

```typescript
export * from './<vendor>.webhook.dto';
```

---

### Step 5: Test the verifier (`src/integrations/<vendor>/<vendor>.webhook.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { create<VendorPascal>Webhook, sign<VendorPascal>Webhook } from './<vendor>.webhook';

const SECRET = 'whsec_test';
const NOW_MS = 1_760_000_000_000;
const NOW_S = String(NOW_MS / 1000);
const BODY = '{"id":"evt_1","type":"thing.happened","data":{}}';
const verifier = create<VendorPascal>Webhook({ <VENDOR>_WEBHOOK_SECRET: SECRET, <VENDOR>_WEBHOOK_TOLERANCE_SECONDS: 300 });

const verify = (headers: Record<string, string>, body = BODY): boolean =>
  verifier.verify({
    body: new TextEncoder().encode(body),
    header: (name) => new Map(Object.entries(headers)).get(name),
    nowMs: NOW_MS,
  });

const signed = (timestamp = NOW_S, secret = SECRET): Record<string, string> => ({
  'x-<vendor>-timestamp': timestamp,
  'x-<vendor>-signature': sign<VendorPascal>Webhook(secret, timestamp, BODY),
});

describe('<VendorPascal> webhook verifier', () => {
  it('accepts a signed, fresh webhook and refuses a changed body or another secret', () => {
    expect(verify(signed())).toBe(true);
    expect(verify(signed(), BODY.replace('evt_1', 'evt_2'))).toBe(false);
    expect(verify(signed(NOW_S, 'another-secret'))).toBe(false);
  });

  it('refuses a stale timestamp and missing headers', () => {
    expect(verify(signed(String(NOW_MS / 1000 - 301)))).toBe(false);
    expect(verify({})).toBe(false);
  });

  it('refuses everything without a configured secret (fail-closed)', () => {
    const disabled = create<VendorPascal>Webhook({ <VENDOR>_WEBHOOK_SECRET: '', <VENDOR>_WEBHOOK_TOLERANCE_SECONDS: 300 });
    expect(
      disabled.verify({ body: new TextEncoder().encode(BODY), header: () => undefined, nowMs: NOW_MS }),
    ).toBe(false);
  });
});
```

---

### Step 6: Create DTOs (`src/modules/<name>/<name>.dto.ts`)

```typescript
import { z } from 'zod';
import { <vendorCamel>WebhookPayloadSchema, type <VendorPascal>WebhookPayload } from '../../integrations/<vendor>';

export const <camelSingular>Schema = <vendorCamel>WebhookPayloadSchema;

export type <PascalSingular>Dto = <VendorPascal>WebhookPayload;

export const <camelSingular>ReceiptSchema = z.object({
  received: z.literal(true),
  duplicate: z.boolean(),
});

export type <PascalSingular>Receipt = z.infer<typeof <camelSingular>ReceiptSchema>;
```

---

### Step 7: Create Messages (`src/modules/<name>/<name>.messages.ts`)

```typescript
import type { LocalizedMessage } from '../../core/i18n';

export const <UPPER_SINGULAR>_MESSAGES = {
  RECEIVED: { id: 'Notifikasi diterima', en: 'Notification received' },
  DUPLICATE: { id: 'Notifikasi ini sudah pernah diterima', en: 'This notification was already received' },
} as const satisfies Record<string, LocalizedMessage>;
```

---

### Step 8: Create Repository (`src/modules/<name>/<name>.repository.ts`)

```typescript
import { AppendOnlyRepository, defaultTxHost, type TransactionHost } from '../../database';
import { webhookEvents, type NewWebhookEvent, type WebhookEvent } from '../../database/schema';

export class <PascalPlural>Repository extends AppendOnlyRepository<typeof webhookEvents> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(webhookEvents, txHost);
  }

  /** The stored row, or `null` for a vendor retry of an event already received. */
  async appendIfNew(event: NewWebhookEvent): Promise<WebhookEvent | null> {
    const rows = await this.txHost.tx
      .insert(webhookEvents)
      .values(event)
      .onConflictDoNothing({ target: [webhookEvents.vendor, webhookEvents.eventId] })
      .returning();
    return rows.at(0) ?? null;
  }
}

export const <camelPlural>Repository = new <PascalPlural>Repository();
```

---

### Step 9: Create Service (`src/modules/<name>/<name>.service.ts`)

```typescript
import { Transactional } from '../../database/transactional.decorator';
import type { <PascalSingular>Dto, <PascalSingular>Receipt } from './<name>.dto';
import { <camelPlural>Repository, <PascalPlural>Repository } from './<name>.repository';

export class <PascalPlural>Service {
  constructor(private readonly repository: <PascalPlural>Repository = <camelPlural>Repository) {}

  /** Store + process in one transaction: a failure stores nothing, so the vendor's retry works. */
  @Transactional()
  async receive(vendor: string, event: <PascalSingular>Dto): Promise<<PascalSingular>Receipt> {
    const stored = await this.repository.appendIfNew({
      vendor,
      eventId: event.id,
      eventType: event.type,
      payload: event,
    });
    if (!stored) return { received: true, duplicate: true };
    // Domain processing goes here (through this module's repositories), in the same transaction.
    return { received: true, duplicate: false };
  }
}

export const <camelPlural>Service = new <PascalPlural>Service();
```

---

### Step 10: Create Webhook Controller (`src/modules/<name>/<name>.webhook.controller.ts`)

```typescript
import { asyncHandler, currentWebhook, getValidatedBody } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type { <PascalSingular>Dto } from './<name>.dto';
import { <UPPER_SINGULAR>_MESSAGES } from './<name>.messages';
import { <camelPlural>Service, <PascalPlural>Service } from './<name>.service';

export class <PascalPlural>WebhookController {
  constructor(private readonly service: <PascalPlural>Service = <camelPlural>Service) {}

  /** 200 for every verified, valid event — retries too — so the vendor stops resending. */
  receive = asyncHandler(async (c) => {
    const event = getValidatedBody<<PascalSingular>Dto>(c);
    const receipt = await this.service.receive(currentWebhook().vendor, event);
    return new ApiResponse(
      receipt,
      receipt.duplicate ? <UPPER_SINGULAR>_MESSAGES.DUPLICATE : <UPPER_SINGULAR>_MESSAGES.RECEIVED,
      200,
    );
  });
}

export const <camelPlural>WebhookController = new <PascalPlural>WebhookController();
```

---

### Step 11: Create Webhook Routes (`src/modules/<name>/<name>.webhook.routes.ts`)

```typescript
import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { <camelSingular>ReceiptSchema, <camelSingular>Schema } from './<name>.dto';
import { <camelPlural>WebhookController } from './<name>.webhook.controller';

export const <camelPlural>WebhookRoutes = new Hono();

<camelPlural>WebhookRoutes.post(
  '/',
  describeEndpoint({
    tags: ['Webhooks'],
    summary: '<VendorPascal> notification (vendor webhook, idempotent per event id)',
    response: { status: 200, description: 'Received (or already received)', data: <camelSingular>ReceiptSchema },
  }),
  validate({ body: <camelSingular>Schema, bodyKeys: 'verbatim' }),
  <camelPlural>WebhookController.receive,
);
```

---

### Step 12: Register in `src/app.ts`

```typescript
import { <vendorCamel>Webhook } from './integrations/<vendor>/<vendor>.webhook';
import { <camelPlural>WebhookRoutes } from './modules/<name>/<name>.webhook.routes';

// The vendor's verifier: add it to WEBHOOK_VENDORS (mounted with webhookAuth() on its prefix)
export const WEBHOOK_VENDORS: readonly WebhookVendor[] = [demoPayWebhook, <vendorCamel>Webhook];

// Inside createApp(), next to the other webhook routes — under <base>/webhooks/<vendor>, never elsewhere
app.route(`${webhooksPath}/<vendor>`, <camelPlural>WebhookRoutes);
```

---

### Step 13: Create Repository Test (`src/modules/<name>/<name>.repository.test.ts`)

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import { <PascalPlural>Repository } from './<name>.repository';

describe('<PascalPlural>Repository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new <PascalPlural>Repository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('inserts once per (vendor, event_id) and returns null for a retry', async () => {
    recorder.respondWith([]);

    expect(
      await repository.appendIfNew({ vendor: '<vendor>', eventId: 'evt_1', eventType: 'x', payload: {} }),
    ).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain(
      'on conflict ("vendor","event_id") do nothing returning',
    );
  });
});
```

---

### Step 14: Create Service Test (`src/modules/<name>/<name>.service.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import type { NewWebhookEvent } from '../../database/schema';
import type { <PascalPlural>Repository } from './<name>.repository';
import { <PascalPlural>Service } from './<name>.service';

describe('<PascalPlural>Service (Unit)', () => {
  it('stores a new event once and acknowledges the retry as a duplicate', async () => {
    const stored = new Map<string, NewWebhookEvent>();
    const repository = {
      appendIfNew: async (event: NewWebhookEvent) => {
        if (stored.has(event.eventId)) return null;
        stored.set(event.eventId, event);
        return event;
      },
    } as unknown as <PascalPlural>Repository;
    const service = new <PascalPlural>Service(repository);
    const { txHost } = createSqlRecorder();
    const event = { id: 'evt_1', type: 'thing.happened', data: {} };

    expect(await txHost.run(() => service.receive('<vendor>', event))).toEqual({ received: true, duplicate: false });
    expect(await txHost.run(() => service.receive('<vendor>', event))).toEqual({ received: true, duplicate: true });
    expect(stored.size).toBe(1);
  });
});
```

---

### Step 15: Create Webhook Controller Test (`src/modules/<name>/<name>.webhook.controller.test.ts`)

Behind a stand-in for `webhookAuth()`; the signature itself is tested in Step 5 and through `createApp()` in `test/vendor-webhooks.e2e.test.ts`.

```typescript
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { setAuthenticatedWebhook } from '../../core/context/request-context';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import { <camelPlural>Service } from './<name>.service';
import { <camelPlural>WebhookRoutes } from './<name>.webhook.routes';

const app = new Hono();
app.use('*', requestContextMiddleware());
app.use('*', async (_c, next) => {
  setAuthenticatedWebhook({ vendor: '<vendor>' });
  await next();
});
app.route('/', <camelPlural>WebhookRoutes);
app.onError(globalErrorHandler);

describe('<PascalPlural>WebhookController', () => {
  const calls: unknown[][] = [];
  let receive: ReturnType<typeof spyOn>;

  beforeAll(() => {
    receive = spyOn(<camelPlural>Service, 'receive').mockImplementation(async (vendor, event) => {
      calls.push([vendor, event]);
      return { received: true, duplicate: false };
    });
  });

  afterAll(() => {
    receive.mockRestore();
  });

  it('passes the payload in the vendor casing with the verified vendor', async () => {
    const event = { id: 'evt_1', type: 'thing.happened', data: { someField: 1 } };
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(res.status).toBe(200);
    expect(calls).toContainEqual(['<vendor>', event]);
  });
});
```
