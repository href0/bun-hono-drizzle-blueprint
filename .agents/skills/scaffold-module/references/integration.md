# Integration Template — Login-Based Vendor (Outbound Adapter)

Use this template to add an outbound adapter for a vendor that issues an access token on login (OAuth2 client credentials, `POST /login` returning `access_token` + `expires_in`, …). A keyless vendor needs only Steps 1–3, a plain `HttpClientService` adapter and its test (reference: `src/integrations/jsonplaceholder/`, an example removed by `bun run setup` unless --keep-examples). Rules and background: `docs/standards/integrations.md`.

Placeholders (kebab-case vendor name, e.g. `acme-pay`):

| Placeholder | Example |
|---|---|
| `<name>` | `acme-pay` (folder, config group) |
| `<UPPER_SINGULAR>` | `ACME_PAY` (registry code = `error.origin`, env var prefix) |
| `<PascalSingular>` | `AcmePay` |
| `<camelSingular>` | `acmePay` |

The vendor endpoints below (`/oauth/token`, `/items/:id`) and the body encoding (JSON) are examples — replace them with the vendor's documented API. This template is generated and run through every gate by `bun run verify:scaffold`.

---

### Step 1: Register the vendor (`src/integrations/registry.ts`)

Add one entry to `INTEGRATION_REGISTRY` — the key is the code sent as `error.origin`, `vendorName` the readable name sent as `error.vendor_name`:

```typescript
  <UPPER_SINGULAR>: { code: '<UPPER_SINGULAR>', vendorName: '<Vendor display name>' },
```

### Step 2: Create the vendor config (`src/config/<name>.config.ts`)

One config group per vendor. Credentials are required outside tests (fail fast at startup); tests get harmless defaults because they never reach the real vendor. Add every variable to `.env.example`, under a section of its own.

```typescript
import { z } from 'zod';
import { envSource } from './env-source';
import { isTestEnvironment, parseEnv, type EnvSource } from './parse-env';

const <camelSingular>Schema = z.object({
  <UPPER_SINGULAR>_BASE_URL: z.string().url(),
  <UPPER_SINGULAR>_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  <UPPER_SINGULAR>_CLIENT_ID: z.string().min(1),
  <UPPER_SINGULAR>_CLIENT_SECRET: z.string().min(1),
});

/** Tests inject their own client and never call the vendor; elsewhere every value is required. */
const TEST_DEFAULTS: EnvSource = {
  <UPPER_SINGULAR>_BASE_URL: 'http://127.0.0.1:1',
  <UPPER_SINGULAR>_CLIENT_ID: 'test-client-id',
  <UPPER_SINGULAR>_CLIENT_SECRET: 'test-client-secret',
};

export type <PascalSingular>Config = z.infer<typeof <camelSingular>Schema>;

export const build<PascalSingular>Config = (source: EnvSource): <PascalSingular>Config =>
  parseEnv(
    '<name>',
    <camelSingular>Schema,
    isTestEnvironment(source) ? { ...TEST_DEFAULTS, ...source } : source,
  );

export const <camelSingular>Config = build<PascalSingular>Config(envSource);
```

### Step 3: Export the config (`src/config/index.ts`)

```typescript
export * from './<name>.config';
```

### Step 4: Describe the vendor payloads (`src/integrations/<name>/<name>.dto.ts`)

Schemas are camelCase: `HttpClientService.parse()` converts the vendor's keys first (`access_token` → `accessToken`). Describe only the fields this application uses.

```typescript
import { z } from 'zod';

/** Login response, e.g. `{ "access_token": "…", "expires_in": 3600 }`. */
export const <camelSingular>TokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
});

export const <camelSingular>ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type <PascalSingular>Item = z.infer<typeof <camelSingular>ItemSchema>;
```

### Step 5: Create the adapter (`src/integrations/<name>/<name>.service.ts`)

- `AccessTokenCache` keeps the token until `expires_in − 60 s` and lets concurrent requests share one login (single-flight); `withToken()` logs in again and retries once when the vendor answers 401.
- Every vendor body goes through `this.http.parse(schema, body)`: a body that does not match is a 502 `ERR_EXT_ERROR`, never a crash deeper in the domain.
- Credentials are sent in the body, never logged (`HttpClientService` logs neither request bodies nor headers).

```typescript
import { <camelSingular>Config } from '../../config';
import { AccessTokenCache, HttpClientService, type IssuedAccessToken } from '../../core/http';
import { camelToSnakeCase } from '../../utils/case-converter.util';
import { INTEGRATION_REGISTRY } from '../registry';
import {
  <camelSingular>ItemSchema,
  <camelSingular>TokenSchema,
  type <PascalSingular>Item,
} from './<name>.dto';

export interface <PascalSingular>Credentials {
  clientId: string;
  clientSecret: string;
}

export const default<PascalSingular>HttpClient = new HttpClientService({
  integration: INTEGRATION_REGISTRY.<UPPER_SINGULAR>,
  baseURL: <camelSingular>Config.<UPPER_SINGULAR>_BASE_URL,
  timeoutMs: <camelSingular>Config.<UPPER_SINGULAR>_TIMEOUT_MS,
});

const defaultCredentials: <PascalSingular>Credentials = {
  clientId: <camelSingular>Config.<UPPER_SINGULAR>_CLIENT_ID,
  clientSecret: <camelSingular>Config.<UPPER_SINGULAR>_CLIENT_SECRET,
};

/**
 * Outbound adapter for <name>. Consumed by domain services (`src/modules/<module>/*.service.ts`),
 * never by controllers.
 */
export class <PascalSingular>Service {
  private readonly tokens = new AccessTokenCache({
    login: (): Promise<IssuedAccessToken> => this.login(),
  });

  constructor(
    private readonly http: HttpClientService = default<PascalSingular>HttpClient,
    private readonly credentials: <PascalSingular>Credentials = defaultCredentials,
  ) {}

  async getItem(id: string): Promise<<PascalSingular>Item> {
    const body = await this.tokens.withToken((token) =>
      this.http.get<unknown>(`/items/${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${token}` }, // header names are case-insensitive
      }),
    );
    return this.http.parse(<camelSingular>ItemSchema, body);
  }

  private async login(): Promise<IssuedAccessToken> {
    const body = await this.http.post<unknown>(
      '/oauth/token',
      camelToSnakeCase({
        grantType: 'client_credentials',
        clientId: this.credentials.clientId,
        clientSecret: this.credentials.clientSecret,
      }),
    );
    const token = this.http.parse(<camelSingular>TokenSchema, body);
    return { accessToken: token.accessToken, expiresInSeconds: token.expiresIn };
  }
}

export const <camelSingular>Service = new <PascalSingular>Service();
```

### Step 6: Create the public entry point (`src/integrations/<name>/index.ts`)

Domain services import the adapter from here (`../../integrations/<name>`).

```typescript
export * from './<name>.dto';
export * from './<name>.service';
```

### Step 7: Test against a fake vendor (`src/integrations/<name>/<name>.service.test.ts`)

A local `Bun.serve` plays the vendor: real HTTP, no network, no `mock.module()`.

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { ExternalServiceError } from '../../core/errors';
import { HttpClientService } from '../../core/http';
import { INTEGRATION_REGISTRY } from '../registry';
import { build<PascalSingular>Config } from '../../config/<name>.config';
import { <camelSingular>Service, <PascalSingular>Service } from '.';

const CREDENTIALS = { clientId: 'client-1', clientSecret: 'secret-1' };

describe('<PascalSingular>Service (fake vendor)', () => {
  let vendor: ReturnType<typeof Bun.serve>;
  const state = { logins: 0, validToken: '', loginBodies: [] as unknown[] };

  beforeAll(() => {
    vendor = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === '/oauth/token') {
          state.logins += 1;
          state.loginBodies.push(await req.json());
          state.validToken = `token-${String(state.logins)}`;
          await Bun.sleep(20); // slow enough for parallel callers to overlap
          return Response.json({ access_token: state.validToken, expires_in: 3600 });
        }
        if (req.headers.get('Authorization') !== `Bearer ${state.validToken}`) {
          return Response.json({ error: 'invalid_token' }, { status: 401 });
        }
        if (url.pathname === '/items/broken') return Response.json({ id: 1 });
        return Response.json({ id: url.pathname.split('/').at(-1), name: 'Item' });
      },
    });
  });

  afterAll(async () => {
    await vendor.stop(true);
  });

  beforeEach(() => {
    state.logins = 0;
    state.validToken = '';
    state.loginBodies = [];
  });

  const createService = (): <PascalSingular>Service =>
    new <PascalSingular>Service(
      new HttpClientService({
        integration: INTEGRATION_REGISTRY.<UPPER_SINGULAR>,
        baseURL: `http://localhost:${String(vendor.port)}`,
        timeoutMs: 2000,
      }),
      CREDENTIALS,
    );

  it('logs in once for 10 parallel requests with an empty token cache', async () => {
    const service = createService();

    const items = await Promise.all(
      Array.from({ length: 10 }, (_, index) => service.getItem(`item-${String(index)}`)),
    );

    expect(state.logins).toBe(1);
    expect(items.at(9)).toEqual({ id: 'item-9', name: 'Item' });
    expect(state.loginBodies).toEqual([
      { grant_type: 'client_credentials', client_id: 'client-1', client_secret: 'secret-1' },
    ]);
  });

  it('logs in again and retries once when the vendor revokes the token', async () => {
    const service = createService();
    await service.getItem('a');
    state.validToken = 'rotated-by-vendor';

    const item = await service.getItem('b');

    expect(item.id).toBe('b');
    expect(state.logins).toBe(2);
  });

  it('turns a body that does not match the schema into a 502', async () => {
    let error: unknown;
    try {
      await createService().getItem('broken');
    } catch (err: unknown) {
      error = err;
    }

    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as ExternalServiceError).statusCode).toBe(502);
  });

  it('wires the default instance to the configured vendor (a closed port in tests)', async () => {
    let error: unknown;
    try {
      await <camelSingular>Service.getItem('x');
    } catch (err: unknown) {
      error = err;
    }

    expect(error).toBeInstanceOf(ExternalServiceError);
    expect([(error as ExternalServiceError).errorCode, (error as ExternalServiceError).origin]).toEqual(
      ['ERR_EXT_UNREACHABLE', '<UPPER_SINGULAR>'],
    );
  });

  it('requires the credentials outside tests', () => {
    expect(() => build<PascalSingular>Config({ NODE_ENV: 'production' })).toThrow();
    expect(build<PascalSingular>Config({ NODE_ENV: 'test' }).<UPPER_SINGULAR>_TIMEOUT_MS).toBe(10000);
  });
});
```

### Step 8: Consume it from a domain service and verify

Inject the adapter into the domain service with a constructor default (`private readonly <camelSingular>: <PascalSingular>Service = <camelSingular>Service`), test the domain service with a fake adapter, and document the route's 502/504 with `describeEndpoint({ errors: [502, 504] })`. Then:

```bash
bun run format
bun run validate:full
```
