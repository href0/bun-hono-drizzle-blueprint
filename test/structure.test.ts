import { describe, expect, it } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { createApp } from '../src/app';
import { appConfig } from '../src/config';

/**
 * File layout and inbound channels (adoption plan D23–D26), checked on the real tree:
 * - every file name is kebab-case per dot segment (ls-lint only checks names whose extension is
 *   exactly `.ts`, so `Users.Controller.ts` would pass it);
 * - module files are `<module>[-<qualifier>][.<channel>].<role>[.test].ts` — ESLint and
 *   dependency-cruiser find controllers, services, … by that suffix, so a near miss such as
 *   `payments.partner-routes.ts` would silently escape every architecture rule;
 * - integration files are `<vendor>.<role>[.test].ts` or `index.ts`;
 * - a module is named after its domain, never after a vendor in `src/integrations/`;
 * - routers of `*.partner.routes.ts` are mounted only under `<base>/v1/partner`, routers of
 *   `*.webhook.routes.ts` only under `<base>/webhooks`, and nothing else is mounted there.
 */

const ROOT = resolve(import.meta.dir, '..');
const MODULE_ROLES = [
  'routes',
  'controller',
  'service',
  'repository',
  'queries',
  'dto',
  'transformer',
  'messages',
  'util',
] as const;
const INTEGRATION_ROLES = ['service', 'dto', 'webhook', 'webhook\\.dto'] as const;
const CHANNELS = ['partner', 'webhook'] as const;
type Channel = (typeof CHANNELS)[number];

const KEBAB_SEGMENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `<module>[-<qualifier>][.<channel>].<role>[.test].ts` */
export const modulePattern = (module: string): RegExp =>
  new RegExp(
    `^${escape(module)}(-[a-z0-9]+)*(\\.(${CHANNELS.join('|')}))?\\.(${MODULE_ROLES.join('|')})(\\.test)?\\.ts$`,
  );

/** `<vendor>.<role>[.test].ts` or `index.ts` */
export const integrationPattern = (vendor: string): RegExp =>
  new RegExp(`^(index|${escape(vendor)}\\.(${INTEGRATION_ROLES.join('|')})(\\.test)?)\\.ts$`);

/** Problems with one file name (relative path with `/`), empty when it follows the conventions. */
export const fileNameViolations = (path: string): string[] => {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  const problems: string[] = [];
  const segments = name.replace(/\.ts$/, '').split('.');
  if (!name.endsWith('.ts') || segments.some((segment) => !KEBAB_SEGMENT.test(segment))) {
    problems.push(`${path}: every dot-separated part of the name must be kebab-case`);
  }
  if (parts[0] === 'src' && parts[1] === 'modules') {
    const module = parts[2] ?? '';
    if (parts.length !== 4 || !modulePattern(module).test(name)) {
      problems.push(
        `${path}: module files are src/modules/<module>/<module>[-<qualifier>][.partner|.webhook].<role>[.test].ts with <role> one of ${MODULE_ROLES.join(', ')}`,
      );
    }
  }
  if (parts[0] === 'src' && parts[1] === 'integrations') {
    const vendor = parts[2] ?? '';
    const atRoot = parts.length === 3 && /^registry(\.test)?\.ts$/.test(vendor);
    if (!atRoot && (parts.length !== 4 || !integrationPattern(vendor).test(name))) {
      problems.push(
        `${path}: integration files are src/integrations/<vendor>/<vendor>.<role>[.test].ts (role: service, dto, webhook, webhook.dto) or index.ts`,
      );
    }
  }
  return problems;
};

const listFiles = (dir: string): string[] =>
  readdirSync(resolve(ROOT, dir)).flatMap((entry) => {
    const path = `${dir}/${entry}`;
    return statSync(resolve(ROOT, path)).isDirectory() ? listFiles(path) : [path];
  });

const sourceFiles = ['src', 'test', 'scripts'].flatMap(listFiles).filter((p) => p.endsWith('.ts'));
const folders = (dir: string): string[] =>
  readdirSync(resolve(ROOT, dir)).filter((entry) =>
    statSync(resolve(ROOT, dir, entry)).isDirectory(),
  );

/** Handlers of every Hono router exported by the channel's route files. */
const channelHandlers = async (channel: Channel): Promise<Set<unknown>> => {
  const handlers = new Set<unknown>();
  const files = sourceFiles.filter((path) => path.endsWith(`.${channel}.routes.ts`));
  for (const file of files) {
    const exported = Object.values((await import(resolve(ROOT, file))) as Record<string, unknown>);
    const routers = exported.filter((value): value is Hono => value instanceof Hono);
    if (routers.length === 0) throw new Error(`${file}: exports no Hono router`);
    for (const router of routers) {
      for (const route of router.routes) handlers.add(route.handler);
    }
  }
  return handlers;
};

export interface MountedRoute {
  method: string;
  path: string;
  handler: unknown;
}

/** Routes mounted outside their channel's prefix, or under a channel prefix from another file. */
export const channelMountViolations = (
  routes: readonly MountedRoute[],
  channels: readonly { channel: Channel; prefix: string; handlers: Set<unknown> }[],
): string[] =>
  routes
    .filter((route) => route.method !== 'ALL')
    .flatMap((route) =>
      channels.flatMap(({ channel, prefix, handlers }) => {
        const underPrefix = route.path === prefix || route.path.startsWith(`${prefix}/`);
        const fromChannel = handlers.has(route.handler);
        if (fromChannel && !underPrefix) {
          return [
            `${route.method} ${route.path}: from a *.${channel}.routes.ts file, must be under ${prefix}`,
          ];
        }
        if (underPrefix && !fromChannel) {
          return [
            `${route.method} ${route.path}: under ${prefix}, must come from a *.${channel}.routes.ts file`,
          ];
        }
        return [];
      }),
    );

describe('file layout (src/, test/, scripts/)', () => {
  it('finds the files (guards the enumeration itself)', () => {
    expect(sourceFiles).toEqual(
      expect.arrayContaining([
        'src/modules/users/users.controller.ts',
        'src/integrations/registry.ts',
        'test/structure.test.ts',
      ]),
    );
  });

  it('every file follows the naming conventions', () => {
    expect(sourceFiles.flatMap(fileNameViolations)).toEqual([]);
  });

  it('no module is named after a vendor (modules are named by domain)', () => {
    const vendors = new Set(folders('src/integrations'));
    expect(folders('src/modules').filter((module) => vendors.has(module))).toEqual([]);
  });
});

describe('inbound channels are mounted where their name says', () => {
  it('partner routers only under <base>/v1/partner, webhook routers only under <base>/webhooks', async () => {
    const base = appConfig.API_BASE_PATH;
    const channels = [
      {
        channel: 'partner' as const,
        prefix: `${base}/v1/partner`,
        handlers: await channelHandlers('partner'),
      },
      {
        channel: 'webhook' as const,
        prefix: `${base}/webhooks`,
        handlers: await channelHandlers('webhook'),
      },
    ];
    expect(channels.at(0)?.handlers.size).toBeGreaterThan(0);

    expect(channelMountViolations(createApp().routes, channels)).toEqual([]);
  });
});

describe('the checks themselves (deliberately broken examples)', () => {
  it('reject near-miss and badly cased file names', () => {
    for (const path of [
      'src/modules/payments/payments.partner-routes.ts',
      'src/modules/payments/payments.partner.route.ts',
      'src/modules/payments/payment.service.ts',
      'src/modules/payments/payments-service.ts',
      'src/modules/payments/payments.service.spec.ts',
      'src/modules/payments/payments.public.routes.ts',
      'src/modules/payments/helpers/payments.util.ts',
      'src/modules/Users/Users.Controller.ts',
      'src/integrations/wahref/wahref-client.ts',
      'src/integrations/wahref/wahref.routes.ts',
      'src/integrations/helpers.ts',
      'src/core/http/HttpClient.ts',
    ]) {
      expect(`${path}: ${String(fileNameViolations(path).length > 0)}`).toBe(`${path}: true`);
    }
  });

  it('accept the conventional names', () => {
    for (const path of [
      'src/modules/payments/payments.partner.routes.ts',
      'src/modules/payments/payments.partner.controller.test.ts',
      'src/modules/messaging/messaging.webhook.routes.ts',
      'src/modules/auth/auth-users.repository.ts',
      'src/modules/auth/auth-cookie.util.ts',
      'src/integrations/wahref/wahref.webhook.dto.ts',
      'src/integrations/wahref/index.ts',
      'src/integrations/registry.test.ts',
      'src/core/middlewares/partner-auth.ts',
    ]) {
      expect(fileNameViolations(path)).toEqual([]);
    }
  });

  it('report a channel router mounted elsewhere and a foreign router under a channel prefix', () => {
    const partnerHandler = (): void => undefined;
    const userHandler = (): void => undefined;
    const channels = [
      {
        channel: 'partner' as const,
        prefix: '/api/v1/partner',
        handlers: new Set<unknown>([partnerHandler]),
      },
    ];

    expect(
      channelMountViolations(
        [
          { method: 'GET', path: '/api/v1/payments', handler: partnerHandler },
          { method: 'GET', path: '/api/v1/partner/users', handler: userHandler },
          { method: 'GET', path: '/api/v1/partner/ping', handler: partnerHandler },
          { method: 'ALL', path: '/api/v1/partner/*', handler: userHandler },
        ],
        channels,
      ),
    ).toEqual([
      'GET /api/v1/payments: from a *.partner.routes.ts file, must be under /api/v1/partner',
      'GET /api/v1/partner/users: under /api/v1/partner, must come from a *.partner.routes.ts file',
    ]);
  });
});
