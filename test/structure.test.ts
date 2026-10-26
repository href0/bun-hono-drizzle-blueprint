import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { createApp, WEBHOOK_VENDORS } from '../src/app';
import { appConfig } from '../src/config';

/**
 * File layout and inbound channels (adoption plan D23–D26), checked on the real tree:
 * - every file name is kebab-case per dot segment (ls-lint only checks names whose extension is
 *   exactly `.ts`, so `Users.Controller.ts` would pass it);
 * - module files are `<module>[-<qualifier>][.<channel>].<role>[.test].ts` — ESLint and
 *   dependency-cruiser find controllers, services, … by that suffix, so a near miss such as
 *   `payments.webhook-routes.ts` would silently escape every architecture rule;
 * - a dependent module (plan D33) lives in one subfolder of its parent,
 *   `src/modules/<parent>/<child>/<child>.<role>.ts`: one level only, a subfolder holds a
 *   `DependentRepository` module, and a child name is used once across `src/modules/` (it names
 *   a table and the flat routes `/<child>/:id`);
 * - integration files are `<vendor>.<role>[.test].ts` or `index.ts`;
 * - the integration suite (`bun run test:int`) is `test/integration/<area>.int.ts` plus its
 *   `setup.ts` preload — a `*.int.ts` elsewhere would never run, a `*.test.ts` there would run
 *   in the hermetic suite without services;
 * - a module is named after its domain, never after a vendor in `src/integrations/`;
 * - routers of `*.<channel>.routes.ts` are mounted only under their channel's prefix
 *   (`*.webhook.routes.ts` under `<base>/webhooks`, …), and nothing else is mounted there.
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
const CHANNELS = [
  // partner:start
  'partner',
  // partner:end
  'webhook',
] as const;
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
    // src/modules/<module>/<file>, or a dependent: src/modules/<parent>/<child>/<file>.
    const module = parts.length === 5 ? (parts[3] ?? '') : (parts[2] ?? '');
    const nestedInItself = parts.length === 5 && parts[2] === parts[3];
    if (
      (parts.length !== 4 && parts.length !== 5) ||
      nestedInItself ||
      !modulePattern(module).test(name)
    ) {
      problems.push(
        `${path}: module files are src/modules/<module>/<module>[-<qualifier>][.${CHANNELS.join('|.')}].<role>[.test].ts with <role> one of ${MODULE_ROLES.join(', ')} — a dependent module one level down: src/modules/<parent>/<child>/<child>.<role>.ts`,
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
  const inIntegrationSuite = parts[0] === 'test' && parts[1] === 'integration';
  if (name.endsWith('.int.ts') && !(inIntegrationSuite && parts.length === 3)) {
    problems.push(
      `${path}: integration tests live directly in test/integration/ (bun run test:int)`,
    );
  }
  if (inIntegrationSuite && (parts.length !== 3 || !/^(setup|[a-z0-9-]+.int).ts$/.test(name))) {
    problems.push(`${path}: test/integration/ holds only <area>.int.ts files and setup.ts`);
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

export interface ModuleFolder {
  name: string;
  /** The parent module of a dependent module (a subfolder of it), undefined at the top level. */
  parent?: string;
  /** Content of `<name>.repository.ts`, empty when the module has none. */
  repository: string;
}

/** Problems with the module folders as a whole (pure: folder names and repository sources in). */
export const moduleTreeViolations = (modules: readonly ModuleFolder[]): string[] => {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const module of modules) {
    const where = module.parent
      ? `src/modules/${module.parent}/${module.name}/`
      : `src/modules/${module.name}/`;
    const other = seen.get(module.name);
    if (other !== undefined) {
      problems.push(
        `${where}: the module name "${module.name}" is already used by ${other} (it names a table and routes)`,
      );
    }
    seen.set(module.name, where);
    if (module.parent !== undefined && !/extends DependentRepository\b/.test(module.repository)) {
      problems.push(
        `${where}: a module subfolder holds a dependent module only (its repository extends DependentRepository, plan D33)`,
      );
    }
    // A dependent is named after its parent (`order-documents`): its table and flat routes then never
    // collide with another parent's. The singular comes from the parent column its repository passes
    // to DependentRepository (`orders.id` ← `orderId`), so no dictionary is needed.
    const parentColumn = /super\(\s*\w+,\s*\w+,\s*\w+\.(\w+?)Id\b/.exec(module.repository)?.[1];
    if (module.parent !== undefined && parentColumn !== undefined) {
      const prefix = `${parentColumn.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-`;
      if (!module.name.startsWith(prefix)) {
        problems.push(
          `${where}: a dependent module is named after its parent: "${prefix}…" (its table and flat routes then never collide with another parent's, plan D33)`,
        );
      }
    }
  }
  return problems;
};

const moduleFolders = (): ModuleFolder[] =>
  folders('src/modules').flatMap((name) => {
    const repositoryOf = (dir: string, module: string): string => {
      const file = resolve(ROOT, dir, `${module}.repository.ts`);
      return existsSync(file) ? readFileSync(file, 'utf8') : '';
    };
    return [
      { name, repository: repositoryOf(`src/modules/${name}`, name) },
      ...folders(`src/modules/${name}`).map((child) => ({
        name: child,
        parent: name,
        repository: repositoryOf(`src/modules/${name}/${child}`, child),
      })),
    ];
  });

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
    expect(moduleFolders().filter((module) => vendors.has(module.name))).toEqual([]);
  });

  it('module subfolders hold dependent modules only, and every module name is used once', () => {
    expect(moduleTreeViolations(moduleFolders())).toEqual([]);
  });
});

describe('inbound channels are mounted where their name says', () => {
  it('channel routers only under their prefix (webhook: <base>/webhooks), nothing else there', async () => {
    const base = appConfig.API_BASE_PATH;
    const channels = [
      // partner:start
      {
        channel: 'partner' as const,
        prefix: `${base}/v1/partner`,
        handlers: await channelHandlers('partner'),
      },
      // partner:end
      {
        channel: 'webhook' as const,
        prefix: `${base}/webhooks`,
        handlers: await channelHandlers('webhook'),
      },
    ];
    const handlerCount = new Map<Channel, number>(
      channels.map(({ channel, handlers }) => [channel, handlers.size]),
    );
    // partner:start
    // Guards the enumeration: the partner gateway always has routes (ping / echo).
    expect(handlerCount.get('partner')).toBeGreaterThan(0);
    // partner:end
    // Webhook receivers exist only with a registered vendor (none in a fresh project after setup).
    expect((handlerCount.get('webhook') ?? 0) > 0).toBe(WEBHOOK_VENDORS.length > 0);

    expect(channelMountViolations(createApp().routes, channels)).toEqual([]);
  });
});

describe('the checks themselves (deliberately broken examples)', () => {
  it('reject near-miss and badly cased file names', () => {
    for (const path of [
      'src/modules/payments/payments.webhook-routes.ts',
      'src/modules/payments/payments.webhook.route.ts',
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
      'test/data-layer.int.ts',
      'src/modules/users/users.int.ts',
      'test/integration/users.test.ts',
      'test/integration/helpers/db.ts',
      'test/integration/nested/users.int.ts',
      // Dependent modules: one level, files named after the subfolder, never a module in itself.
      'src/modules/projects/tasks/projects.service.ts',
      'src/modules/projects/tasks/subtasks/subtasks.service.ts',
      'src/modules/projects/projects/projects.service.ts',
    ]) {
      expect(`${path}: ${String(fileNameViolations(path).length > 0)}`).toBe(`${path}: true`);
    }
  });

  it('accept the conventional names', () => {
    for (const path of [
      // partner:start
      'src/modules/payments/payments.partner.routes.ts',
      'src/modules/payments/payments.partner.controller.test.ts',
      // partner:end
      'src/modules/messaging/messaging.webhook.routes.ts',
      'src/modules/messaging/messaging.webhook.controller.test.ts',
      'src/modules/auth/auth-users.repository.ts',
      'src/modules/auth/auth-cookie.util.ts',
      'src/integrations/wahref/wahref.webhook.dto.ts',
      'src/integrations/wahref/index.ts',
      'src/integrations/registry.test.ts',
      'src/core/middlewares/webhook-auth.ts',
      'test/integration/data-layer.int.ts',
      'test/integration/setup.ts',
      'src/modules/projects/tasks/tasks.service.ts',
      'src/modules/projects/tasks/tasks.controller.test.ts',
    ]) {
      expect(fileNameViolations(path)).toEqual([]);
    }
  });

  it('report a non-dependent module in a subfolder and a module name used twice', () => {
    expect(
      moduleTreeViolations([
        { name: 'projects', repository: 'class P extends BaseRepository {}' },
        { name: 'tasks', parent: 'projects', repository: 'class T extends DependentRepository {}' },
        { name: 'notes', parent: 'projects', repository: 'class N extends BaseRepository {}' },
        { name: 'tasks', repository: 'class T extends BaseRepository {}' },
      ]),
    ).toEqual([
      'src/modules/projects/notes/: a module subfolder holds a dependent module only (its repository extends DependentRepository, plan D33)',
      'src/modules/tasks/: the module name "tasks" is already used by src/modules/projects/tasks/ (it names a table and routes)',
    ]);
  });

  it('report a dependent module that is not named after its parent', () => {
    const repository = (table: string, parent: string, column: string): string =>
      `class R extends DependentRepository<typeof ${table}, typeof ${parent}> {\n  constructor() {\n    super(\n      ${table},\n      ${parent},\n      ${table}.${column},\n      txHost,\n    );\n  }\n}`;
    expect(
      moduleTreeViolations([
        { name: 'projects', repository: 'class P extends BaseRepository {}' },
        {
          name: 'project-tasks',
          parent: 'projects',
          repository: repository('projectTasks', 'projects', 'projectId'),
        },
        {
          name: 'budgets',
          parent: 'projects',
          repository: repository('budgets', 'projects', 'projectId'),
        },
        {
          name: 'order-lines',
          parent: 'purchase-orders',
          repository: repository('orderLines', 'purchaseOrders', 'purchaseOrderId'),
        },
        // A repository of another shape cannot be read: left to the CLI (and review).
        { name: 'notes', parent: 'projects', repository: 'class N extends DependentRepository {}' },
      ]),
    ).toEqual([
      'src/modules/projects/budgets/: a dependent module is named after its parent: "project-…" (its table and flat routes then never collide with another parent\'s, plan D33)',
      'src/modules/purchase-orders/order-lines/: a dependent module is named after its parent: "purchase-order-…" (its table and flat routes then never collide with another parent\'s, plan D33)',
    ]);
  });

  it('report a channel router mounted elsewhere and a foreign router under a channel prefix', () => {
    const webhookHandler = (): void => undefined;
    const userHandler = (): void => undefined;
    const channels = [
      {
        channel: 'webhook' as const,
        prefix: '/api/webhooks',
        handlers: new Set<unknown>([webhookHandler]),
      },
    ];

    expect(
      channelMountViolations(
        [
          { method: 'POST', path: '/api/v1/payments', handler: webhookHandler },
          { method: 'POST', path: '/api/webhooks/users', handler: userHandler },
          { method: 'POST', path: '/api/webhooks/acme', handler: webhookHandler },
          { method: 'ALL', path: '/api/webhooks/*', handler: userHandler },
        ],
        channels,
      ),
    ).toEqual([
      'POST /api/v1/payments: from a *.webhook.routes.ts file, must be under /api/webhooks',
      'POST /api/webhooks/users: under /api/webhooks, must come from a *.webhook.routes.ts file',
    ]);
  });
});
