/**
 * The acceptance run of `bun run acceptance` (plan D37): for each chosen setup combination, a fresh
 * clone becomes a project (stage A), every scaffold variant is generated — three of them through
 * the real wizard, answered by the runner with keystrokes — and the gates pass (B), the project
 * runs against a real database and every new endpoint answers over HTTP (C), and the Docker images
 * build (D). Nobody has to type anything.
 *
 * The steps are data: `docs/standards/manual-acceptance.md` lists exactly their titles
 * (test/docs-sync.test.ts). Everything that touches the machine goes through `AcceptanceContext`
 * (scripts/acceptance.ts), so the order, the skips, the wizard answers and the HTTP checks are
 * unit-tested against a fake machine.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { partnerSignatureHeaders } from '../../src/utils/partner-signature.util';
import type { ComboResult, ProgressReporter, StageResult, StepLabel } from './acceptance-progress';

export type Stage = 'A' | 'B' | 'C' | 'D';

/** The setup choices a project can start from (`bun run setup`). */
export interface Combo {
  id: number;
  keepExamples: boolean;
  label: string;
}

export const COMBOS: readonly Combo[] = [
  { id: 1, keepExamples: false, label: 'new project: setup removes the examples (default)' },
  { id: 2, keepExamples: true, label: 'setup --keep-examples: generators next to the examples' },
];

export interface CommandResult {
  exitCode: number;
  output: string;
}

export interface HttpResult {
  status: number;
  json: { data?: Record<string, unknown> } & Record<string, unknown>;
  headers: Headers;
}

export interface RunOptions {
  /** `success` (default) fails the step on a non-zero exit, `failure` on a zero one. */
  expect?: 'success' | 'failure';
  /** Text piped to stdin (a password); without it stdin is empty and not a terminal. */
  stdin?: string;
}

export interface HttpOptions {
  token?: string;
  /** JSON-encoded unless `raw` is given. */
  body?: unknown;
  raw?: string;
  headers?: Record<string, string>;
}

/**
 * One answer to the wizard: the runner waits until `question` is on the screen, then answers —
 * moves to the option whose label starts with `select`, types `text` + Enter, presses Enter on the
 * pre-filled value, answers a yes / no question, or presses Ctrl+C.
 */
export type Turn = { question: string } & (
  { select: string } | { text: string } | { enter: true } | { confirm: boolean } | { cancel: true }
);

/** What the steps may do — implemented by scripts/acceptance.ts, faked in the tests. */
export interface AcceptanceContext {
  combo: Combo;
  /** Values steps hand to later steps (tokens, ids, secrets). */
  state: Map<string, string>;
  cloneRepository: () => Promise<void>;
  /** Runs a command in the project (`['bun', 'run', 'db:migrate']`). */
  run: (command: string[], options?: RunOptions) => Promise<CommandResult>;
  /** Runs the wizard and answers its questions in order, like a person at the keyboard. */
  converse: (
    command: string[],
    turns: readonly Turn[],
    options?: Pick<RunOptions, 'expect'>,
  ) => Promise<CommandResult>;
  /** A request to the project's server; `path` starts with `/api`. */
  http: (method: string, path: string, options?: HttpOptions) => Promise<HttpResult>;
  /** Why the database stage cannot run here (`--no-db`, PostgreSQL / Redis unreachable), or undefined. */
  databaseUnavailable: () => Promise<string | undefined>;
  createDatabase: () => Promise<void>;
  /** Stops the server, drops the database and deletes the Redis keys of this combination. */
  releaseDatabase: () => Promise<void>;
  /** (Re)starts the project's server and waits until readiness answers 200. */
  startServer: () => Promise<void>;
  /** A variable the developer would add to the env file (server and commands from now on). */
  setEnv: (name: string, value: string) => void;
  /** Does this file exist in the project? */
  exists: (path: string) => boolean;
  /** A hash of every file git sees in the project (tracked and untracked, ignored excluded). */
  fingerprint: () => Promise<string>;
  dockerUnavailable: () => Promise<string | undefined>;
  /** Builds an image from the project and registers its removal. */
  dockerBuild: (target?: string) => Promise<void>;
}

export interface AcceptanceStep {
  stage: Stage;
  title: string;
  /** Rough duration, for the estimate shown before the run. */
  minutes: number;
  run: (ctx: AcceptanceContext) => Promise<void>;
  /** A reason to skip the step on this machine, checked right before it runs. */
  skipWhen?: (ctx: AcceptanceContext) => Promise<string | undefined>;
}

export class StepFailure extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`expected ${expected}, got ${actual}`);
  }
}

export const check = (condition: boolean, expected: string, actual: string): void => {
  if (!condition) throw new StepFailure(expected, actual);
};

const expectStatus = (result: HttpResult, status: number, what: string): void => {
  check(
    result.status === status,
    `${what} → ${String(status)}`,
    `${String(result.status)} ${JSON.stringify(result.json).slice(0, 300)}`,
  );
};

const idOf = (result: HttpResult, what: string): string => {
  const id = result.json.data?.id;
  check(
    typeof id === 'string',
    `${what} returns data.id`,
    JSON.stringify(result.json).slice(0, 300),
  );
  return id as string;
};

const expectOutput = (result: CommandResult, text: string, what: string): void => {
  check(result.output.includes(text), `${what} prints "${text}"`, result.output.slice(-600));
};

const expectFiles = (ctx: AcceptanceContext, paths: readonly string[], what: string): void => {
  const missing = paths.filter((path) => !ctx.exists(path));
  check(
    missing.length === 0,
    `${what} writes ${paths.join(', ')}`,
    `missing ${missing.join(', ')}`,
  );
};

const scaffold = (ctx: AcceptanceContext, args: string[]): Promise<CommandResult> =>
  ctx.run(['bun', 'scripts/scaffold.ts', ...args]);

const scaffoldRefused = (ctx: AcceptanceContext, args: string[]): Promise<CommandResult> =>
  ctx.run(['bun', 'scripts/scaffold.ts', ...args], { expect: 'failure' });

const token = (ctx: AcceptanceContext): string => ctx.state.get('token') ?? '';

/** A partner request signed per spec v1 with the credential created in stage C. */
const partnerRequest = (
  ctx: AcceptanceContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResult> => {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const headers = partnerSignatureHeaders({
    apiKey: ctx.state.get('partnerKey') ?? '',
    secret: ctx.state.get('partnerSecret') ?? '',
    method,
    url: path,
    body: raw,
    timestamp: String(Date.now()),
    nonce: randomBytes(16).toString('hex'),
  });
  return ctx.http(method, path, { raw: body === undefined ? undefined : raw, headers });
};

/** The placeholder signature scheme of a generated webhook verifier (references/webhook.md). */
const webhookSignature = (secret: string, timestamp: string, body: string): string =>
  `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

const PASSWORD_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const strongPassword = (): string =>
  `Acc-${[...randomBytes(16)].map((byte) => PASSWORD_LETTERS[byte % PASSWORD_LETTERS.length]).join('')}-9`;

export const ADMIN_EMAIL = 'admin@example.com';
export const PROJECT_NAME = 'acceptance-demo';

const GATE_MINUTES = 1;
const gate = async (ctx: AcceptanceContext): Promise<void> => {
  await ctx.run(['bun', 'run', 'validate:full']);
  await ctx.run(['bun', 'run', 'build']);
};

const databaseStage = (ctx: AcceptanceContext): Promise<string | undefined> =>
  ctx.databaseUnavailable();

export const ACCEPTANCE_STEPS: readonly AcceptanceStep[] = [
  // --- A: a new project ------------------------------------------------------------------------
  {
    stage: 'A',
    title: 'Clone the commit under test into the work folder',
    minutes: 0.1,
    run: (ctx) => ctx.cloneRepository(),
  },
  {
    stage: 'A',
    title: 'bun install',
    minutes: 0.5,
    run: async (ctx) => {
      await ctx.run(['bun', 'install', '--frozen-lockfile']);
    },
  },
  {
    stage: 'A',
    title: 'bun run setup (the combination)',
    minutes: 0.1,
    run: async (ctx) => {
      const keep = ctx.combo.keepExamples ? ['--keep-examples'] : [];
      const result = await ctx.run(['bun', 'run', 'setup', PROJECT_NAME, ...keep]);
      expectOutput(result, 'Project initialization completed', 'setup');
      check(
        ctx.exists('src/modules/orders') === ctx.combo.keepExamples,
        ctx.combo.keepExamples ? 'the example modules kept' : 'the example modules removed',
        `src/modules/orders ${ctx.exists('src/modules/orders') ? 'exists' : 'is gone'}`,
      );
    },
  },
  {
    stage: 'A',
    title: 'Gates of the new project: validate:full + build',
    minutes: GATE_MINUTES,
    run: gate,
  },

  // --- B: generators ---------------------------------------------------------------------------
  {
    stage: 'B',
    title: 'Wizard (bun run scaffold): standalone module products',
    minutes: 0.15,
    run: async (ctx) => {
      await ctx.converse(
        ['bun', 'run', 'scaffold'],
        [
          { question: 'What do you want to scaffold?', select: 'Module — standalone' },
          { question: 'Module name', text: 'products' },
          { question: 'Singular of "products"', enter: true },
          { question: 'Write these files?', confirm: true },
        ],
      );
      expectFiles(ctx, ['src/modules/products/products.routes.ts'], 'the wizard');
    },
  },
  {
    stage: 'B',
    title: 'Flags: header-detail module invoices --detail=lines',
    minutes: 0.1,
    run: async (ctx) => {
      await scaffold(ctx, ['module', 'invoices', '--variant=header-detail', '--detail=lines']);
    },
  },
  {
    stage: 'B',
    title: 'Flags: record module audit-entries',
    minutes: 0.1,
    run: async (ctx) => {
      await scaffold(ctx, ['module', 'audit-entries', '--variant=record']);
    },
  },
  {
    stage: 'B',
    title: 'Wizard (bun run scaffold:module): dependent 1:N product-reviews',
    minutes: 0.15,
    run: async (ctx) => {
      await ctx.converse(
        ['bun', 'run', 'scaffold:module'],
        [
          { question: 'What do you want to scaffold?', select: 'Module — dependent 1:N' },
          { question: 'Parent module', select: 'products' },
          { question: 'Child (1:N) name', text: 'reviews' },
          { question: 'Singular of "reviews"', enter: true },
          { question: 'Write these files?', confirm: true },
        ],
      );
      expectFiles(
        ctx,
        ['src/modules/products/product-reviews/product-reviews.routes.ts'],
        'the wizard',
      );
    },
  },
  {
    stage: 'B',
    title: 'Flags: dependent 1:1 product-specs (--one)',
    minutes: 0.1,
    run: async (ctx) => {
      await scaffold(ctx, ['module', 'specs', '--parent=products', '--one']);
    },
  },
  {
    stage: 'B',
    title: 'Flags: partner endpoint shipments',
    minutes: 0.1,
    run: async (ctx) => {
      await scaffold(ctx, ['partner', 'shipments']);
    },
  },
  {
    stage: 'B',
    title: 'Wizard (bun run scaffold:webhook): refund-notifications from globex',
    minutes: 0.15,
    run: async (ctx) => {
      await ctx.converse(
        ['bun', 'run', 'scaffold:webhook'],
        [
          { question: 'Webhook module name', text: 'refund-notifications' },
          { question: 'Singular of "refund-notifications"', enter: true },
          { question: 'Vendor that sends the webhook', text: 'globex' },
          { question: 'Institution named in vendor errors', enter: true },
          { question: 'Write these files?', confirm: true },
        ],
      );
      expectFiles(
        ctx,
        ['src/integrations/globex/globex.webhook.ts', 'src/modules/refund-notifications'],
        'the wizard',
      );
      // The secret its next steps ask the developer to set (stage C signs with it).
      const secret = randomBytes(24).toString('hex');
      ctx.state.set('webhookSecret', secret);
      ctx.setEnv('GLOBEX_WEBHOOK_SECRET', secret);
    },
  },
  {
    stage: 'B',
    title: 'Flags (bun run scaffold:integration): outbound adapter acme-mail',
    minutes: 0.1,
    run: async (ctx) => {
      await ctx.run(['bun', 'run', 'scaffold:integration', 'acme-mail']);
      // The variables its next steps ask the developer to add.
      ctx.setEnv('ACME_MAIL_BASE_URL', 'http://127.0.0.1:1');
      ctx.setEnv('ACME_MAIL_CLIENT_ID', 'acceptance');
      ctx.setEnv('ACME_MAIL_CLIENT_SECRET', 'acceptance');
    },
  },
  {
    stage: 'B',
    title: 'Wizard: answering No, then Ctrl+C, writes nothing',
    minutes: 0.15,
    run: async (ctx) => {
      const before = await ctx.fingerprint();
      await ctx.converse(
        ['bun', 'run', 'scaffold:module'],
        [
          { question: 'What do you want to scaffold?', select: 'Module — standalone' },
          { question: 'Module name', text: 'drafts' },
          { question: 'Singular of "drafts"', enter: true },
          { question: 'Write these files?', confirm: false },
        ],
        { expect: 'failure' },
      );
      check((await ctx.fingerprint()) === before, 'answering No writes nothing', 'files changed');
      await ctx.converse(
        ['bun', 'run', 'scaffold'],
        [{ question: 'What do you want to scaffold?', cancel: true }],
        { expect: 'failure' },
      );
      check((await ctx.fingerprint()) === before, 'Ctrl+C writes nothing', 'files changed');
    },
  },
  {
    stage: 'B',
    title: 'Refusals: a taken name, a dependent parent, --dry-run, no terminal',
    minutes: 0.1,
    run: async (ctx) => {
      const before = await ctx.fingerprint();
      expectOutput(
        await scaffoldRefused(ctx, ['module', 'products']),
        'already',
        'a taken module name',
      );
      expectOutput(
        await scaffoldRefused(ctx, ['module', 'notes', '--parent=product-reviews']),
        'two levels at most',
        'a dependent as the parent',
      );
      expectOutput(
        await scaffold(ctx, ['module', 'drafts', '--dry-run']),
        '[dry run]',
        '--dry-run',
      );
      expectOutput(await scaffoldRefused(ctx, []), 'Usage', 'no arguments without a terminal');
      check((await ctx.fingerprint()) === before, 'no file changed', 'files changed');
    },
  },
  {
    stage: 'B',
    title: 'db:generate, then the API contract: check fails, update, check passes',
    minutes: 0.2,
    run: async (ctx) => {
      await ctx.run(['bun', 'run', 'db:generate']);
      await ctx.run(['bun', 'run', 'openapi:check'], { expect: 'failure' });
      await ctx.run(['bun', 'run', 'openapi:update']);
      await ctx.run(['bun', 'run', 'openapi:check']);
    },
  },
  {
    stage: 'B',
    title: 'Gates with every generated module: validate:full + build',
    minutes: GATE_MINUTES,
    run: gate,
  },

  // --- C: database and server ------------------------------------------------------------------
  {
    stage: 'C',
    title: 'Database: create, db:migrate, seed:admin',
    minutes: 0.1,
    skipWhen: databaseStage,
    run: async (ctx) => {
      await ctx.createDatabase();
      await ctx.run(['bun', 'run', 'db:migrate']);
      const password = strongPassword();
      ctx.state.set('password', password);
      const seeded = await ctx.run(['bun', 'run', 'seed:admin', '--email', ADMIN_EMAIL], {
        stdin: `${password}\n`,
      });
      expectOutput(seeded, `Created admin ${ADMIN_EMAIL}`, 'seed:admin');
    },
  },
  {
    stage: 'C',
    title: 'Server: health, login, refresh, users, partner ping',
    minutes: 0.1,
    skipWhen: databaseStage,
    run: async (ctx) => {
      await ctx.startServer();
      expectStatus(await ctx.http('GET', '/api/health'), 200, 'GET /api/health');
      const login = await ctx.http('POST', '/api/v1/auth/login', {
        body: { email: ADMIN_EMAIL, password: ctx.state.get('password') },
      });
      expectStatus(login, 200, 'login');
      const cookie = /refresh_token=[^;]+/.exec(login.headers.get('set-cookie') ?? '')?.at(0) ?? '';
      check(cookie !== '', 'login sets the refresh_token cookie', 'no refresh_token cookie');
      const refreshed = await ctx.http('POST', '/api/v1/auth/refresh', { headers: { cookie } });
      expectStatus(refreshed, 200, 'refresh with the cookie');
      const accessToken = refreshed.json.data?.access_token;
      check(typeof accessToken === 'string', 'refresh returns an access token', 'none');
      ctx.state.set('token', accessToken as string);
      expectStatus(
        await ctx.http('GET', '/api/v1/users', { token: token(ctx) }),
        200,
        'GET /users',
      );
      expectStatus(await ctx.http('GET', '/api/v1/users'), 401, 'GET /users without a token');
      if (ctx.combo.keepExamples) {
        expectStatus(
          await ctx.http('GET', '/api/v1/orders', { token: token(ctx) }),
          200,
          'GET /orders (a kept example)',
        );
      }

      const credential = await ctx.http('POST', '/api/v1/partner-credentials', {
        token: token(ctx),
        body: {
          partner_code: 'acceptance-partner',
          partner_name: 'Acceptance Partner',
          allowed_routes: ['/ping', '/shipments', '/shipments/*'],
        },
      });
      expectStatus(credential, 201, 'create a partner credential');
      ctx.state.set('partnerKey', String(credential.json.data?.api_key));
      ctx.state.set('partnerSecret', String(credential.json.data?.secret));
      expectStatus(await partnerRequest(ctx, 'GET', '/api/v1/partner/ping'), 200, 'signed ping');
      expectStatus(await ctx.http('GET', '/api/v1/partner/ping'), 401, 'unsigned ping');
    },
  },
  {
    stage: 'C',
    title: 'HTTP: products, invoices with lines, audit entries',
    minutes: 0.05,
    skipWhen: databaseStage,
    run: async (ctx) => {
      const product = await ctx.http('POST', '/api/v1/products', {
        token: token(ctx),
        body: { name: 'Acceptance product' },
      });
      expectStatus(product, 201, 'create a product');
      const productId = idOf(product, 'create a product');
      ctx.state.set('productId', productId);
      expectStatus(
        await ctx.http('GET', `/api/v1/products/${productId}`, { token: token(ctx) }),
        200,
        'read the product',
      );
      expectStatus(
        await ctx.http('POST', '/api/v1/products', { token: token(ctx), body: {} }),
        400,
        'create a product without a name',
      );
      expectStatus(await ctx.http('GET', '/api/v1/products'), 401, 'products without a token');

      const invoice = await ctx.http('POST', '/api/v1/invoices', {
        token: token(ctx),
        body: { code: 'INV-1' },
      });
      expectStatus(invoice, 201, 'create an invoice');
      expectStatus(
        await ctx.http('PUT', `/api/v1/invoices/${idOf(invoice, 'create an invoice')}/lines`, {
          token: token(ctx),
          body: { lines: [{ description: 'Line one', quantity: 2 }] },
        }),
        200,
        'save the invoice lines',
      );
      expectStatus(
        await ctx.http('POST', '/api/v1/invoices', { token: token(ctx), body: {} }),
        400,
        'create an invoice without a code',
      );

      expectStatus(
        await ctx.http('POST', '/api/v1/audit-entries', {
          token: token(ctx),
          body: { kind: 'login', detail: 'acceptance' },
        }),
        201,
        'append an audit entry',
      );
      expectStatus(
        await ctx.http('GET', '/api/v1/audit-entries?per_page=1000', { token: token(ctx) }),
        400,
        'audit entries with per_page above the maximum',
      );
    },
  },
  {
    stage: 'C',
    title: 'HTTP: a review and a spec under the product',
    minutes: 0.05,
    skipWhen: databaseStage,
    run: async (ctx) => {
      const productId = ctx.state.get('productId') ?? '';
      const review = await ctx.http('POST', `/api/v1/products/${productId}/reviews`, {
        token: token(ctx),
        body: { name: 'Great' },
      });
      expectStatus(review, 201, 'create a review under the product');
      expectStatus(
        await ctx.http('GET', `/api/v1/product-reviews/${idOf(review, 'create a review')}`, {
          token: token(ctx),
        }),
        200,
        'read the review on its own page',
      );
      expectStatus(
        await ctx.http('POST', `/api/v1/products/${productId}/reviews`, {
          token: token(ctx),
          body: {},
        }),
        400,
        'create a review without a name',
      );
      const spec = `/api/v1/products/${productId}/spec`;
      const saved = await ctx.http('PUT', spec, { token: token(ctx), body: { name: 'Spec' } });
      check(
        saved.status === 200 || saved.status === 201,
        `PUT ${spec} → 200 / 201`,
        String(saved.status),
      );
      expectStatus(await ctx.http('GET', spec, { token: token(ctx) }), 200, `GET ${spec}`);
      expectStatus(
        await ctx.http('PUT', spec, { token: token(ctx), body: {} }),
        400,
        `PUT ${spec} without a name`,
      );
    },
  },
  {
    stage: 'C',
    title: 'HTTP: signed partner shipments, signed globex webhook',
    minutes: 0.05,
    skipWhen: databaseStage,
    run: async (ctx) => {
      const body = { partner_reference: 'REF-0001', description: 'Acceptance shipment' };
      expectStatus(
        await partnerRequest(ctx, 'POST', '/api/v1/partner/shipments', body),
        201,
        'signed partner POST',
      );
      expectStatus(
        await partnerRequest(ctx, 'POST', '/api/v1/partner/shipments', body),
        409,
        'the same partner reference again',
      );
      expectStatus(
        await ctx.http('POST', '/api/v1/partner/shipments', { body }),
        401,
        'unsigned partner POST',
      );

      const secret = ctx.state.get('webhookSecret') ?? '';
      const raw = JSON.stringify({ id: 'evt_0001', type: 'refund.created', data: { amount: 1 } });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signed = (signature: string): Record<string, string> => ({
        'content-type': 'application/json',
        'x-globex-timestamp': timestamp,
        'x-globex-signature': signature,
      });
      const good = signed(webhookSignature(secret, timestamp, raw));
      const first = await ctx.http('POST', '/api/webhooks/globex', { raw, headers: good });
      check(
        first.status >= 200 && first.status < 300,
        'a signed event → 2xx',
        String(first.status),
      );
      const again = await ctx.http('POST', '/api/webhooks/globex', { raw, headers: good });
      check(
        again.json.data?.duplicate === true,
        'the same event again → duplicate: true',
        JSON.stringify(again.json).slice(0, 300),
      );
      expectStatus(
        await ctx.http('POST', '/api/webhooks/globex', {
          raw,
          headers: signed(webhookSignature('not-the-secret', timestamp, raw)),
        }),
        401,
        'a forged signature',
      );
    },
  },
  {
    stage: 'C',
    title: 'Stop the server, drop the database and the Redis keys',
    minutes: 0.05,
    skipWhen: databaseStage,
    run: (ctx) => ctx.releaseDatabase(),
  },

  // --- D: images -------------------------------------------------------------------------------
  {
    stage: 'D',
    title: 'Docker: the production image',
    minutes: 0.5,
    skipWhen: (ctx) => ctx.dockerUnavailable(),
    run: (ctx) => ctx.dockerBuild(),
  },
  {
    stage: 'D',
    title: 'Docker: the tools image',
    minutes: 0.3,
    skipWhen: (ctx) => ctx.dockerUnavailable(),
    run: (ctx) => ctx.dockerBuild('tools'),
  },
];

// --- the menu, the plan and the run ---------------------------------------------------------------

export interface AcceptanceArgs {
  /** `--combo 1,2`; undefined = ask in the menu. */
  combos?: Combo[];
  /** `--ref <commit|tag>`, default HEAD. */
  ref: string;
  /** False with `--no-db`: stage C is skipped on purpose. */
  db: boolean;
  /** `--keep`: keep the work folder even when everything passed. */
  keep: boolean;
  /** `--plan`: show the steps and the estimate, run nothing. */
  plan: boolean;
  /** `--clean`: remove what earlier runs left (work folders, databases), run nothing. */
  clean: boolean;
}

export const ACCEPTANCE_USAGE = `Usage:
  bun run acceptance                         menu: choose the combinations
  bun run acceptance --combo 1,2             no menu (1, 2, or a = all)
  bun run acceptance --combo 1 --plan        only show the steps and the estimate
  bun run acceptance --clean                 remove work folders and databases of earlier runs

Options:
  --ref <commit|tag>   what is tested (default HEAD: the last commit, not the working tree)
  --no-db              skip stage C (database, server, HTTP)
  --keep               keep the work folder even when everything passed`;

/** `1,2` / `a`: the combinations, or an error naming the valid ones. */
export const parseCombos = (text: string): Combo[] => {
  const wanted = text.trim().toLowerCase();
  if (wanted === 'a') return [...COMBOS];
  const ids = wanted.split(/[\s,]+/).filter(Boolean);
  const found = ids.map((id) => COMBOS.find((combo) => String(combo.id) === id));
  const combos = found.filter((combo): combo is Combo => combo !== undefined);
  if (ids.length === 0 || combos.length !== found.length) {
    throw new Error(
      `unknown combination "${text}": choose ${COMBOS.map((combo) => String(combo.id)).join(', ')} or a`,
    );
  }
  return [...new Set(combos)];
};

export const parseAcceptanceArgs = (argv: readonly string[]): AcceptanceArgs => {
  const args: AcceptanceArgs = { ref: 'HEAD', db: true, keep: false, plan: false, clean: false };
  const rest = [...argv];
  const valueOf = (flag: string): string => {
    const value = rest.shift();
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} needs a value\n${ACCEPTANCE_USAGE}`);
    }
    return value;
  };
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (arg === '--combo') args.combos = parseCombos(valueOf(arg));
    else if (arg === '--ref') args.ref = valueOf(arg);
    else if (arg === '--no-db') args.db = false;
    else if (arg === '--keep') args.keep = true;
    else if (arg === '--plan') args.plan = true;
    else if (arg === '--clean') args.clean = true;
    else throw new Error(`unknown argument ${arg}\n${ACCEPTANCE_USAGE}`);
  }
  return args;
};

/** `~12m`, rounded up to whole minutes. */
export const formatMinutes = (minutes: number): string => `~${String(Math.ceil(minutes))}m`;

const minutesOf = (steps: readonly AcceptanceStep[]): number =>
  steps.reduce((sum, step) => sum + step.minutes, 0);

const STAGES: Record<Stage, string> = {
  A: 'new project: clone, bun install, setup, gates',
  B: 'generators: 8 variants (3 through the wizard, answered by the runner), refusals, contract, gates',
  C: 'database + server: migrate, seed, every new endpoint over HTTP (skipped without PostgreSQL / Redis, or --no-db)',
  D: 'Docker images (skipped when Docker is not running)',
};

/** The menu: what each stage does, then the combinations with their estimate. */
export const menuText = (steps: readonly AcceptanceStep[]): string =>
  [
    'Each combination runs in a work folder next to this repository, stage by stage:',
    ...Object.entries(STAGES).map(([stage, text]) => `  ${stage}  ${text}`),
    '',
    ...COMBOS.map(
      (combo) => `  ${String(combo.id)}  ${combo.label}  (${formatMinutes(minutesOf(steps))})`,
    ),
    '  a  all combinations',
  ].join('\n');

/** The steps of each chosen combination and the total estimate (`--plan`, and before a run). */
export const planText = (
  combos: readonly Combo[],
  steps: readonly AcceptanceStep[],
  ref: string,
): string => {
  const width = String(steps.length).length;
  const blocks = combos.map((combo) =>
    [
      `Combination ${String(combo.id)} — ${combo.label}  (${formatMinutes(minutesOf(steps))})`,
      ...steps.map(
        (step, index) =>
          `  [${String(index + 1).padStart(width)}/${String(steps.length)}] ${step.stage}  ${step.title}`,
      ),
    ].join('\n'),
  );
  return [
    `Testing ${ref}`,
    ...blocks,
    `Estimated total: ${formatMinutes(minutesOf(steps) * combos.length)}`,
  ].join('\n\n');
};

export interface StepLog {
  /** Where the output of the step at this position goes; returns the file. */
  open: (index: number, step: AcceptanceStep) => string;
  /** The last lines of that file, for the screen when the step fails. */
  tail: (file: string) => string;
}

const describeError = (error: unknown): string => {
  if (error instanceof StepFailure) {
    return `    expected: ${error.expected}\n    actual:   ${error.actual.split('\n').join('\n              ')}`;
  }
  return `    ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
};

type StageStatus = StageResult['status'];

/** A stage is failed when one step failed, ok when one passed, skipped otherwise. */
const merge = (before: StageStatus | undefined, now: StageStatus): StageStatus => {
  if (before === 'failed' || now === 'failed') return 'failed';
  return before === 'ok' || now === 'ok' ? 'ok' : 'skipped';
};

/**
 * Runs the steps of one combination in order. A failure stops the combination (its remaining steps
 * are shown as skipped); `ctx.releaseDatabase` always runs last, so the server, the database and
 * the Redis keys never outlive the combination.
 */
export const runCombo = async (
  steps: readonly AcceptanceStep[],
  ctx: AcceptanceContext,
  reporter: Pick<ProgressReporter, 'begin' | 'end' | 'skipped' | 'line'>,
  log: StepLog,
): Promise<ComboResult> => {
  const result: ComboResult = { label: `${String(ctx.combo.id)} — ${ctx.combo.label}`, stages: {} };
  const label = (index: number, step: AcceptanceStep): StepLabel => ({
    index: index + 1,
    total: steps.length,
    stage: step.stage,
    title: step.title,
  });
  const add = (step: AcceptanceStep, status: StageStatus, ms: number): void => {
    const stage = result.stages[step.stage];
    result.stages[step.stage] = { status: merge(stage?.status, status), ms: (stage?.ms ?? 0) + ms };
  };
  reporter.line(`\nCombination ${result.label}`);
  try {
    for (const [index, step] of steps.entries()) {
      if (result.failedStep !== undefined) {
        reporter.skipped(label(index, step), 'an earlier step failed');
        continue;
      }
      const reason = await step.skipWhen?.(ctx);
      if (reason !== undefined) {
        reporter.skipped(label(index, step), reason);
        add(step, 'skipped', 0);
        continue;
      }
      const file = log.open(index, step);
      reporter.begin(label(index, step));
      try {
        await step.run(ctx);
        add(step, 'ok', reporter.end('ok'));
      } catch (error) {
        add(step, 'failed', reporter.end('failed'));
        result.failedStep = step.title;
        result.logFile = file;
        reporter.line(`${describeError(error)}\n${log.tail(file)}\n    full log: ${file}`);
      }
    }
  } finally {
    await ctx.releaseDatabase();
  }
  return result;
};

// --- the wizard driver ----------------------------------------------------------------------------

/** Colours and cursor moves (ESC [ … final byte); built from the code, as a literal needs ESC. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g');

/** The screen text without colours and cursor moves. */
export const plainText = (text: string): string => text.replace(ANSI, '');

/** The label of the option the cursor is on in the last frame of a select prompt (`● label`). */
export const activeOption = (screen: string): string | undefined => {
  const lines = plainText(screen).split(/\r?\n|\r/);
  for (const line of lines.reverse()) {
    const option = /●\s+(.+?)\s*$/.exec(line)?.at(1);
    if (option !== undefined) return option;
  }
  return undefined;
};

export const KEYS = { down: '\u001b[B', enter: '\r', ctrlC: '\u0003' } as const;

/** The keys of an answer that needs no look at the screen (everything but `select`). */
export const keysOf = (turn: Turn): string => {
  if ('text' in turn) return `${turn.text}${KEYS.enter}`;
  if ('confirm' in turn) return `${turn.confirm ? 'y' : 'n'}${KEYS.enter}`;
  if ('cancel' in turn) return KEYS.ctrlC;
  return KEYS.enter;
};
