import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { signV1 } from '../../utils/partner-signature.util';
import { createSecretCipher } from '../../utils/secret-cipher.util';
import { CacheService, type CacheClient, type CounterState } from '../cache';
import { getActor } from '../context/request-context';
import { logger } from '../logger';
import { hashPartnerApiKey } from '../security/partner-credentials';
import { globalErrorHandler } from './error-handler';
import {
  currentPartner,
  partnerAuth,
  type PartnerAuthOptions,
  type PartnerGatewayCredential,
} from './partner-auth';
import { requestContextMiddleware } from './request-context';
import { getValidatedBody, validate } from './validate';

const NOW = 1_760_000_000_000;
const TOLERANCE = 300_000;
const API_KEY = 'pk_test_key_0123456789abcdefghijklmnopqrstuvwxyz';
const SECRET = 'partner-secret-0123456789';
const cipher = createSecretCipher({ activeKeyId: 't1', keys: { t1: 'e'.repeat(64) } });

const credential = (
  overrides: Partial<PartnerGatewayCredential> = {},
): PartnerGatewayCredential => ({
  partnerCode: 'acme',
  encryptedSecret: cipher.encrypt(SECRET),
  ipWhitelist: [],
  allowedRoutes: ['/*'],
  rateLimitRpm: 100,
  isActive: true,
  ...overrides,
});

/** Nonces and counters in memory, like Redis; `down` = Redis unavailable (CacheService fails open). */
const memoryCache = () => {
  const nonces = new Set<string>();
  const counts = new Map<string, number>();
  const cache = {
    setIfAbsent: async (key: string): Promise<boolean> => {
      if (nonces.has(key)) return false;
      nonces.add(key);
      return true;
    },
    increment: async (key: string, ttlSeconds: number): Promise<CounterState | null> => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, ttlSeconds };
    },
  };
  return cache as unknown as CacheService;
};

const lookups: string[] = [];

const buildApp = (
  options: Partial<PartnerAuthOptions> & { record?: PartnerGatewayCredential | null } = {},
): Hono => {
  const record = options.record === undefined ? credential() : options.record;
  const app = new Hono();
  // One trusted proxy, so tests choose the client IP through X-Forwarded-For.
  app.use('*', requestContextMiddleware({ trustProxyHops: 1 }));
  app.use(
    '/v1/partner/*',
    partnerAuth({
      basePath: '/v1/partner',
      lookup: async (hash) => {
        lookups.push(hash);
        return hash === hashPartnerApiKey(API_KEY) ? record : null;
      },
      toleranceMs: TOLERANCE,
      cipher,
      cache: memoryCache(),
      nowMs: () => NOW,
      ...options,
    }),
  );
  app.get('/v1/partner/orders', (c) =>
    c.json({ partner: currentPartner().code, actor: getActor() }),
  );
  app.get('/v1/partner/orders/:id', (c) => c.json({ id: c.req.param('id') }));
  app.post('/v1/partner/orders', validate({ body: z.object({ amount: z.number() }) }), (c) =>
    c.json({ received: getValidatedBody<{ amount: number }>(c) }),
  );
  app.get('/v1/partner/admin', (c) => c.text('admin'));
  app.onError(globalErrorHandler);
  return app;
};

let nonceCounter = 0;
const nextNonce = (): string => `nonce_${String(++nonceCounter).padStart(12, '0')}`;

interface SignOptions {
  method?: string;
  path?: string;
  query?: string;
  body?: string;
  timestamp?: number;
  nonce?: string;
  secret?: string;
  apiKey?: string;
  ip?: string;
  /** Sign this query instead of the one sent. */
  signedQuery?: string;
}

const signed = (options: SignOptions = {}): [string, RequestInit] => {
  const method = options.method ?? 'GET';
  const path = options.path ?? '/v1/partner/orders';
  const query = options.query ?? '';
  const body = options.body ?? '';
  const timestamp = String(options.timestamp ?? NOW);
  const nonce = options.nonce ?? nextNonce();
  const signature = signV1(options.secret ?? SECRET, {
    timestamp,
    nonce,
    method,
    path,
    query: options.signedQuery ?? query,
    body,
  });
  return [
    `${path}${query}`,
    {
      method,
      body: body === '' ? undefined : body,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': options.ip ?? '203.0.113.7',
        'x-partner-key': options.apiKey ?? API_KEY,
        'x-partner-timestamp': timestamp,
        'x-partner-nonce': nonce,
        'x-partner-signature': signature,
      },
    },
  ];
};

const codeOf = async (res: Response): Promise<string> =>
  `${String(res.status)} ${((await res.json()) as { error?: { code: string } }).error?.code ?? 'ok'}`;

afterEach(() => {
  lookups.length = 0;
});

describe('partnerAuth — accepted requests', () => {
  it('lets a signed request through as partner:<code>', async () => {
    const res = await buildApp().request(...signed());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partner: 'acme', actor: 'partner:acme' });
    expect(lookups).toEqual([hashPartnerApiKey(API_KEY)]);
  });

  it('verifies the raw body and still lets the handler read the JSON body', async () => {
    const res = await buildApp().request(...signed({ method: 'POST', body: '{"amount":150000}' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: { amount: 150000 } });
  });

  it('signs the query in canonical form (order of parameters does not matter)', async () => {
    const res = await buildApp().request(
      ...signed({ query: '?status=paid&a=1', signedQuery: 'a=1&status=paid' }),
    );

    expect(res.status).toBe(200);
  });

  it('accepts a timestamp exactly at the tolerance, both ways', async () => {
    const app = buildApp();
    expect((await app.request(...signed({ timestamp: NOW - TOLERANCE }))).status).toBe(200);
    expect((await app.request(...signed({ timestamp: NOW + TOLERANCE }))).status).toBe(200);
  });

  it('matches the IP whitelist and route patterns relative to the mount path', async () => {
    const app = buildApp({
      record: credential({ ipWhitelist: ['198.51.100.0/24'], allowedRoutes: ['/orders/:id'] }),
    });

    const res = await app.request(...signed({ path: '/v1/partner/orders/42', ip: '198.51.100.9' }));
    expect(res.status).toBe(200);
  });

  it('sends the partner rate-limit headers', async () => {
    const res = await buildApp({ record: credential({ rateLimitRpm: 5 }) }).request(...signed());

    expect(res.headers.get('RateLimit-Limit')).toBe('5');
    expect(res.headers.get('RateLimit-Remaining')).toBe('4');
    expect(res.headers.get('RateLimit-Reset')).toBe('60');
  });
});

describe('partnerAuth — every refusal has its own code', () => {
  it('missing or malformed headers → 401 ERR_PARTNER_HEADERS_MISSING, before any lookup', async () => {
    const app = buildApp();
    const [url, init] = signed();
    const headers = init.headers as Record<string, string>;
    const variants: Record<string, string>[] = [
      {},
      { ...headers, 'x-partner-key': '' },
      { ...headers, 'x-partner-timestamp': 'yesterday' },
      { ...headers, 'x-partner-timestamp': '-1' },
      { ...headers, 'x-partner-nonce': 'short' },
      { ...headers, 'x-partner-nonce': 'has spaces in the nonce!' },
      { ...headers, 'x-partner-signature': 'abc' },
      { ...headers, 'x-partner-signature': 'z'.repeat(64) },
    ];

    for (const variant of variants) {
      expect(await codeOf(await app.request(url, { ...init, headers: variant }))).toBe(
        '401 ERR_PARTNER_HEADERS_MISSING',
      );
    }
    expect(lookups).toEqual([]);
  });

  it('timestamp outside the window → 401 ERR_PARTNER_REPLAY_REJECTED, before any lookup', async () => {
    const app = buildApp();
    for (const timestamp of [NOW - TOLERANCE - 1, NOW + TOLERANCE + 1, 0]) {
      expect(await codeOf(await app.request(...signed({ timestamp })))).toBe(
        '401 ERR_PARTNER_REPLAY_REJECTED',
      );
    }
    expect(lookups).toEqual([]);
  });

  it('unknown or inactive key → the same 401 ERR_PARTNER_INVALID_KEY', async () => {
    expect(await codeOf(await buildApp().request(...signed({ apiKey: 'pk_unknown' })))).toBe(
      '401 ERR_PARTNER_INVALID_KEY',
    );
    expect(await codeOf(await buildApp({ record: null }).request(...signed()))).toBe(
      '401 ERR_PARTNER_INVALID_KEY',
    );
    expect(
      await codeOf(
        await buildApp({ record: credential({ isActive: false }) }).request(...signed()),
      ),
    ).toBe('401 ERR_PARTNER_INVALID_KEY');
  });

  it('client IP outside the whitelist → 403 ERR_PARTNER_IP_FORBIDDEN', async () => {
    const app = buildApp({ record: credential({ ipWhitelist: ['198.51.100.0/24'] }) });

    expect(await codeOf(await app.request(...signed({ ip: '203.0.113.7' })))).toBe(
      '403 ERR_PARTNER_IP_FORBIDDEN',
    );
  });

  it('route not allowed → 403 ERR_PARTNER_ROUTE_FORBIDDEN', async () => {
    const app = buildApp({ record: credential({ allowedRoutes: ['/orders', '/orders/*'] }) });

    expect((await app.request(...signed({ path: '/v1/partner/orders/7' }))).status).toBe(200);
    expect(await codeOf(await app.request(...signed({ path: '/v1/partner/admin' })))).toBe(
      '403 ERR_PARTNER_ROUTE_FORBIDDEN',
    );
  });

  it('wrong signature → 401 ERR_PARTNER_SIGNATURE_INVALID: other secret, changed query, body or method', async () => {
    const app = buildApp();
    const [bodyUrl, bodyInit] = signed({ method: 'POST', body: '{"amount":1}' });
    const tampered: [string, RequestInit][] = [
      signed({ secret: 'another-secret' }),
      signed({ query: '?status=paid', signedQuery: 'status=open' }),
      [bodyUrl, { ...bodyInit, body: '{"amount":2}' }],
      [bodyUrl, { ...bodyInit, method: 'PUT' }],
    ];

    for (const [url, init] of tampered) {
      expect(`${init.method ?? 'GET'} ${await codeOf(await app.request(url, init))}`).toBe(
        `${init.method ?? 'GET'} 401 ERR_PARTNER_SIGNATURE_INVALID`,
      );
    }
  });

  it('replay (same nonce) → 401 ERR_PARTNER_REPLAY_REJECTED', async () => {
    const app = buildApp();
    const request = signed({ nonce: 'replayed_nonce_0001' });

    expect((await app.request(...request)).status).toBe(200);
    expect(await codeOf(await app.request(...request))).toBe('401 ERR_PARTNER_REPLAY_REJECTED');
  });

  it('a request with a bad signature does not burn the nonce', async () => {
    const app = buildApp();
    const nonce = 'unburnt_nonce_00001';

    expect((await app.request(...signed({ nonce, secret: 'wrong' }))).status).toBe(401);
    expect((await app.request(...signed({ nonce }))).status).toBe(200);
  });

  it('over rate_limit_rpm → 429 ERR_RATE_LIMITED with Retry-After', async () => {
    const app = buildApp({ record: credential({ rateLimitRpm: 2 }) });

    expect((await app.request(...signed())).status).toBe(200);
    expect((await app.request(...signed())).status).toBe(200);
    const res = await app.request(...signed());
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await codeOf(res)).toBe('429 ERR_RATE_LIMITED');
  });

  it('an undecryptable secret (key gone from the keyring) is our error: 500, not a partner refusal', async () => {
    const other = createSecretCipher({ activeKeyId: 'old', keys: { old: 'f'.repeat(64) } });
    const app = buildApp({ record: credential({ encryptedSecret: other.encrypt(SECRET) }) });

    expect(await codeOf(await app.request(...signed()))).toBe('500 ERR_INTERNAL');
  });
});

describe('partnerAuth — Redis unavailable', () => {
  const downClient = { status: 'end' } as unknown as CacheClient;

  it('fails open for nonce and rate limit, with a warn log (replays inside the window pass)', async () => {
    const warn = spyOn(logger, 'warn');
    try {
      const app = buildApp({
        cache: new CacheService(downClient),
        record: credential({ rateLimitRpm: 1 }),
      });
      const request = signed({ nonce: 'redis_down_nonce_01' });

      expect((await app.request(...request)).status).toBe(200);
      expect((await app.request(...request)).status).toBe(200); // replay + over the limit
      const messages = warn.mock.calls.map((call) => String(call.at(1)));
      expect(messages).toContain('Redis not ready; setIfAbsent failing open');
      expect(messages).toContain('Redis not ready; increment failing open');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('partnerAuth — audit log', () => {
  const auditEntries = (spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] =>
    spy.mock.calls
      .map((call) => call.at(0) as Record<string, unknown>)
      .filter((entry) => entry.audit === 'partner');

  it('logs one allowed line per request, without key, nonce or signature', async () => {
    const info = spyOn(logger, 'info');
    try {
      const [url, init] = signed({ nonce: 'audit_allowed_nonce1' });
      await buildApp().request(url, init);

      const entries = auditEntries(info);
      expect(entries).toEqual([
        {
          audit: 'partner',
          outcome: 'allowed',
          reason: undefined,
          partnerCode: 'acme',
          method: 'GET',
          path: '/v1/partner/orders',
          clientIp: '203.0.113.7',
          statusCode: 200,
          durationMs: expect.any(Number),
        },
      ]);
      const text = JSON.stringify(entries);
      for (const value of Object.values(init.headers as Record<string, string>).slice(2)) {
        expect(text).not.toContain(value);
      }
    } finally {
      info.mockRestore();
    }
  });

  it('logs the handler status for an allowed request whose handler fails', async () => {
    const info = spyOn(logger, 'info');
    try {
      await buildApp().request(...signed({ method: 'POST', body: '{"amount":"x"}' }));

      expect(auditEntries(info).at(0)).toMatchObject({ outcome: 'allowed', statusCode: 400 });
    } finally {
      info.mockRestore();
    }
  });

  it('logs one rejected line with the reason and the partner when known', async () => {
    const warn = spyOn(logger, 'warn');
    try {
      const app = buildApp({ record: credential({ allowedRoutes: ['/orders'] }) });
      await app.request(...signed({ path: '/v1/partner/admin' }));
      await app.request(...signed({ apiKey: 'pk_unknown' }));

      expect(auditEntries(warn)).toEqual([
        expect.objectContaining({
          outcome: 'rejected',
          reason: 'route_forbidden',
          partnerCode: 'acme',
          statusCode: 403,
        }),
        expect.objectContaining({
          outcome: 'rejected',
          reason: 'invalid_key',
          partnerCode: undefined,
          statusCode: 401,
        }),
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('currentPartner', () => {
  it('is 401 outside partnerAuth()', async () => {
    const app = new Hono();
    app.use('*', requestContextMiddleware());
    app.get('/x', (c) => c.text(currentPartner().code));
    app.onError(globalErrorHandler);

    expect(await codeOf(await app.request('/x'))).toBe('401 ERR_UNAUTHORIZED');
  });
});
