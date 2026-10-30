import { describe, expect, it } from 'bun:test';
import { createApp, WEBHOOK_VENDORS } from '../src/app';
import { appConfig } from '../src/config';
import {
  // partner:start
  isPartnerRoute,
  // partner:end
  isPublicRoute,
} from '../src/core/security/public-routes';
import { authorize } from './helpers/authorized-app';

/**
 * Default-deny (D7; docs/standards/auth-and-inbound.md §2): enumerates every route of createApp() and proves that each one is
 * either an explicitly public route or answers 401 without a token. A new route needs no test of
 * its own to be protected — forgetting to register it as public can only make it too strict.
 */

const base = appConfig.API_BASE_PATH;
const v1 = `${base}/v1`;
const SAMPLE_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const webhooks = `${base}/webhooks`;

/** Platform routes outside the versioned API: public by design (probes, docs, service identity). */
const UNVERSIONED_PUBLIC = [
  'GET /',
  `GET ${base}/health`,
  `GET ${base}/health/readiness`,
  `GET ${base}/health/liveness`,
  `GET ${base}/docs`,
  `GET ${base}/docs/openapi.json`,
];

const app = createApp();
/** Handlers only: `app.use()` middlewares are registered with method ALL. */
const routes = [
  ...new Set(
    app.routes.filter((route) => route.method !== 'ALL').map((r) => `${r.method} ${r.path}`),
  ),
].map((key) => {
  const [method = '', path = ''] = key.split(' ');
  return { method, path, concrete: path.replace(/:\w+/g, SAMPLE_ID) };
});
const versioned = routes.filter(({ path }) => path.startsWith(`${v1}/`));
const isPublic = (method: string, path: string): boolean =>
  isPublicRoute(method, path.slice(v1.length));
// partner:start
/** Partner routes are guarded by partnerAuth() (signed requests), not by access tokens. */
const isPartner = (path: string): boolean => isPartnerRoute(path.slice(v1.length));
// partner:end

describe('default-deny authentication (every route of createApp)', () => {
  it('finds the routes (guards the enumeration itself)', () => {
    expect(versioned.length).toBeGreaterThan(10);
    expect(versioned.map(({ method, path }) => `${method} ${path}`)).toEqual(
      expect.arrayContaining([`POST ${v1}/auth/login`, `GET ${v1}/users/:id`]),
    );
  });

  it('routes outside /v1 are exactly the platform routes that are public by design, plus vendor webhooks', () => {
    const outside = routes
      .filter(({ path }) => !path.startsWith(`${v1}/`) && !path.startsWith(`${webhooks}/`))
      .map(({ method, path }) => `${method} ${path}`);

    expect(outside.sort()).toEqual([...UNVERSIONED_PUBLIC].sort());
  });

  it('every webhook route belongs to a registered vendor and answers 401 ERR_WEBHOOK_SIGNATURE_INVALID without its signature — also with a bearer token', async () => {
    const webhookRoutes = routes.filter(({ path }) => path.startsWith(`${webhooks}/`));
    // Guards the enumeration; no vendor (a fresh project after `bun run setup`) = no routes.
    expect(webhookRoutes.length > 0).toBe(WEBHOOK_VENDORS.length > 0);
    const vendors = new Set(WEBHOOK_VENDORS.map(({ vendor }) => vendor));
    const withToken = await authorize(createApp(), 'admin');

    const wrong: string[] = [];
    for (const { method, path, concrete } of webhookRoutes) {
      const vendor =
        path
          .slice(webhooks.length + 1)
          .split('/')
          .at(0) ?? '';
      if (!vendors.has(vendor))
        wrong.push(`${method} ${path}: vendor "${vendor}" not in WEBHOOK_VENDORS`);
      for (const [label, target] of [
        ['no credentials', app],
        ['bearer token', withToken],
      ] as const) {
        const res = await target.request(concrete, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const body = (await res.json()) as { error?: { code: string } };
        if (res.status !== 401 || body.error?.code !== 'ERR_WEBHOOK_SIGNATURE_INVALID') {
          wrong.push(`${method} ${path} (${label}) → ${String(res.status)}`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it('an unknown path under the webhook prefix is refused, not public (fail-closed)', async () => {
    const res = await app.request(`${webhooks}/unknown-vendor`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('every versioned route not in PUBLIC_ROUTES answers 401 ERR_UNAUTHORIZED without a token', async () => {
    const open: string[] = [];
    for (const { method, path, concrete } of versioned) {
      if (isPublic(method, path)) continue;
      // partner:start
      if (isPartner(path)) continue;
      // partner:end
      const res = await app.request(concrete, { method });
      const body = (await res.json()) as { error?: { code: string } };
      if (res.status !== 401 || body.error?.code !== 'ERR_UNAUTHORIZED') {
        open.push(`${method} ${path} → ${String(res.status)}`);
      }
    }

    expect(open).toEqual([]);
  });

  // partner:start
  it('every partner route answers 401 ERR_PARTNER_HEADERS_MISSING without partner headers — also with a valid access token', async () => {
    const partnerRoutes = versioned.filter(({ path }) => isPartner(path));
    expect(partnerRoutes.length).toBeGreaterThan(0);
    const withToken = await authorize(createApp(), 'admin');

    const open: string[] = [];
    for (const { method, path, concrete } of partnerRoutes) {
      for (const [label, target] of [
        ['no credentials', app],
        ['bearer token', withToken],
      ] as const) {
        const res = await target.request(concrete, { method });
        const body = (await res.json()) as { error?: { code: string } };
        if (res.status !== 401 || body.error?.code !== 'ERR_PARTNER_HEADERS_MISSING') {
          open.push(`${method} ${path} (${label}) → ${String(res.status)}`);
        }
      }
    }

    expect(open).toEqual([]);
  });
  // partner:end

  it('public routes are reachable without a token', async () => {
    for (const { method, path, concrete } of versioned.filter((r) => isPublic(r.method, r.path))) {
      const res = await app.request(concrete, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = (await res.json()) as { error?: { code: string } };
      expect(`${method} ${path} → ${body.error?.code ?? 'ok'}`).not.toEndWith('ERR_UNAUTHORIZED');
    }
  });

  it('a route added later without registering it as public is protected automatically', async () => {
    const extended = createApp();
    extended.get(`${v1}/probe/new-feature`, (c) => c.text('new feature'));

    expect((await extended.request(`${v1}/probe/new-feature`)).status).toBe(401);
    expect((await (await authorize(extended)).request(`${v1}/probe/new-feature`)).status).toBe(200);
  });

  it('unknown versioned paths do not reveal what exists: 401 before routing', async () => {
    expect((await app.request(`${v1}/does-not-exist`)).status).toBe(401);
  });
});
