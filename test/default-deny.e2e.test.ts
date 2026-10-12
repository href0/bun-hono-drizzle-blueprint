import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig } from '../src/config';
import { isPartnerRoute, isPublicRoute } from '../src/core/security/public-routes';
import { authorize } from './helpers/authorized-app';

/**
 * Default-deny (plan D7, L4): enumerates every route of createApp() and proves that each one is
 * either an explicitly public route or answers 401 without a token. A new route needs no test of
 * its own to be protected — forgetting to register it as public can only make it too strict.
 */

const base = appConfig.API_BASE_PATH;
const v1 = `${base}/v1`;
const SAMPLE_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';

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
/** Partner routes are guarded by partnerAuth() (signed requests), not by access tokens. */
const isPartner = (path: string): boolean => isPartnerRoute(path.slice(v1.length));

describe('default-deny authentication (every route of createApp)', () => {
  it('finds the routes (guards the enumeration itself)', () => {
    expect(versioned.length).toBeGreaterThan(10);
    expect(versioned.map(({ method, path }) => `${method} ${path}`)).toEqual(
      expect.arrayContaining([`POST ${v1}/auth/login`, `GET ${v1}/users/:id`]),
    );
  });

  it('routes outside /v1 are exactly the platform routes that are public by design', () => {
    const outside = routes
      .filter(({ path }) => !path.startsWith(`${v1}/`))
      .map(({ method, path }) => `${method} ${path}`);

    expect(outside.sort()).toEqual([...UNVERSIONED_PUBLIC].sort());
  });

  it('every versioned route not in PUBLIC_ROUTES answers 401 ERR_UNAUTHORIZED without a token', async () => {
    const open: string[] = [];
    for (const { method, path, concrete } of versioned) {
      if (isPublic(method, path) || isPartner(path)) continue;
      const res = await app.request(concrete, { method });
      const body = (await res.json()) as { error?: { code: string } };
      if (res.status !== 401 || body.error?.code !== 'ERR_UNAUTHORIZED') {
        open.push(`${method} ${path} → ${String(res.status)}`);
      }
    }

    expect(open).toEqual([]);
  });

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
