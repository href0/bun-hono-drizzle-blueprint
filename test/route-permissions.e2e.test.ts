import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig } from '../src/config';
import {
  // partner:start
  isPartnerRoute,
  // partner:end
  isPublicRoute,
} from '../src/core/security/public-routes';
import { PERMISSION_REGISTRY } from '../src/permissions';
import { authorize, createTestApp } from './helpers/authorized-app';

/**
 * Every route states who may call it (R89, D49; docs/standards/auth-and-inbound.md §2): each
 * operation under `/v1` falls in exactly one category — a permission guard (`requirePermission()` /
 * `requireSelfOrPermission()`), `allowAnyUser()`, `PUBLIC_ROUTES` or an inbound channel with its own
 * guard — read from the OpenAPI document the guards write (`x-allowed-callers`). A guarded route
 * refuses a token without the permission before it validates anything, and the registry and the
 * routes name the same permissions.
 */

const base = appConfig.API_BASE_PATH;
const v1 = `${base}/v1`;
/** A user id that is not the caller's: `requireSelfOrPermission()` must fall back to the permission. */
const OTHER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';

interface Operation {
  'x-allowed-callers'?: string[];
}

const app = createApp();
const document = (await (await app.request(`${base}/docs/openapi.json`)).json()) as {
  paths: Record<string, Record<string, Operation>>;
};

/** Every operation under `/v1`, with its route path (`:id`) and who it allows. */
const operations = Object.entries(document.paths)
  .filter(([path]) => path.startsWith(`${v1}/`))
  .flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => {
      const routePath = path.slice(v1.length).replace(/\{(\w+)\}/g, ':$1');
      return {
        label: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        routePath,
        concrete: path.replace(/\{\w+\}/g, OTHER_ID),
        callers: operation['x-allowed-callers'] ?? [],
      };
    }),
  );

const permissionsOf = (callers: readonly string[]): string[] =>
  callers.filter((caller) => caller.startsWith('permission:')).map((c) => c.slice(11));

/** The categories an operation falls in; exactly one is right. */
const categoriesOf = ({ method, routePath, callers }: (typeof operations)[number]): string[] =>
  [
    permissionsOf(callers).length > 0 && 'permission guard',
    callers.includes('any-user') && 'allowAnyUser()',
    isPublicRoute(method, routePath) && 'PUBLIC_ROUTES',
    // partner:start
    isPartnerRoute(routePath) && 'partner channel',
    // partner:end
  ].filter((category): category is string => category !== false);

describe('every route states who may call it (R89)', () => {
  it('finds the operations (guards the enumeration itself)', () => {
    expect(operations.length).toBeGreaterThan(10);
    expect(operations.some(({ callers }) => permissionsOf(callers).length > 0)).toBe(true);
  });

  it('every /v1 operation is in exactly one category: permission guard, allowAnyUser(), PUBLIC_ROUTES or a channel', () => {
    const wrong = operations.flatMap((operation) => {
      const categories = categoriesOf(operation);
      return categories.length === 1
        ? []
        : [`${operation.label}: ${categories.length === 0 ? 'no guard' : categories.join(' + ')}`];
    });

    expect(wrong).toEqual([]);
  });

  it('a permission-guarded route answers 403 ERR_PERMISSION_FORBIDDEN to a token without the permission — before validating anything', async () => {
    const withoutPermissions = await authorize(createTestApp(), []);
    const guarded = operations.filter(({ callers }) => permissionsOf(callers).length > 0);

    const wrong: string[] = [];
    for (const { label, method, concrete } of guarded) {
      // No body and a parameter that may not exist: a 400 or 404 here means the guard runs too late.
      const res = await withoutPermissions.request(concrete, { method });
      const body = (await res.json()) as { error?: { code: string } };
      if (res.status !== 403 || body.error?.code !== 'ERR_PERMISSION_FORBIDDEN') {
        wrong.push(`${label} → ${String(res.status)} ${body.error?.code ?? ''}`.trim());
      }
    }

    expect(wrong).toEqual([]);
  });

  it('every permission a route checks is in the registry, and every registry permission guards a route', () => {
    const registry = new Set(PERMISSION_REGISTRY.map(({ key }) => key));
    const used = new Set(operations.flatMap(({ callers }) => permissionsOf(callers)));

    expect({
      notInRegistry: [...used].filter((key) => !registry.has(key)),
      unused: [...registry].filter((key) => !used.has(key)),
    }).toEqual({ notInRegistry: [], unused: [] });
  });
});
