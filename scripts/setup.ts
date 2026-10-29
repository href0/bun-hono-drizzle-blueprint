/**
 * Project initializer — turns a fresh clone of this boilerplate into a named project.
 *
 * Usage:
 *   bun run setup                                  # only create .env from .env.example
 *   bun run setup <project-name> [--title "..."] [--description "..."] [--keep-examples] [--no-partner] [--dry-run]
 *
 * In a terminal, `bun run setup` without a name opens a wizard (plan D38): it asks for the name, the
 * title, the description, whether to keep the examples and the partner gateway, shows the plan (a
 * dry run), asks before
 * changing anything, and prints the equivalent command (scripts/lib/setup-wizard.ts). Without a
 * terminal it never asks — unless SETUP_WIZARD_STDIN=1, set only by `bun run acceptance`.
 *
 * IDENTITY_RULES is the single registry of every place that carries the project identity.
 * When you add a new file/setting that hardcodes the project name, register it here.
 * Every required rule must match; a rule that matches nothing aborts the run (drift guard).
 *
 * EXAMPLE_MODULES lists the example code a new project starts without (default): its files and
 * registrations are removed and the migrations are regenerated from scratch — a new project has
 * no database yet, so its history starts clean. `--keep-examples` keeps them. Same drift guard.
 *
 * The partner gateway is kept (only its markers go) or removed with `--no-partner`: marked regions
 * and PARTNER_ONLY files (scripts/lib/partner-prune.ts, plan D39).
 */
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { SNAPSHOT_PATH } from './lib/api-contract/document';
import { exitOnHelp } from './lib/cli-args';
import { gitHooksAdvice, readGitState } from './lib/git-hooks';
import { PARTNER_SCRIPTS, planPartner } from './lib/partner-prune';
import { CancelledError, terminalPrompter } from './lib/prompter';
import {
  completeSetup,
  needsSetupWizard,
  parseSetupArgs,
  requestOf,
  SetupArgsError,
  setupArgv,
  setupCommandOf,
  SETUP_USAGE,
  titleOf,
  type SetupRequest,
} from './lib/setup-wizard';

interface ProjectIdentity {
  /** kebab-case, e.g. `pengangkut-udara-backend` (package name, APP_NAME, container prefix) */
  name: string;
  /** snake_case, e.g. `pengangkut_udara_backend` (database identifiers) */
  snakeName: string;
  /** Title Case, e.g. `Pengangkut Udara Backend` (documentation headings) */
  title: string;
  description?: string;
}

interface IdentityRule {
  file: string;
  label: string;
  pattern: RegExp;
  replace: (id: ProjectIdentity) => string;
}

/** Lines collected for a note of the wizard; undefined = straight to the console. */
let collecting: string[] | undefined;

/** A progress line of setup: printed as is, or collected while the wizard shows a note (plan D40). */
const say = (text: string): void => {
  if (collecting === undefined) console.log(text);
  else collecting.push(text);
};

/**
 * Runs `work` and returns the lines it said, without the `[Setup] ` prefix. A failure inside it
 * exits the process (`process.exit(1)` after its error): the lines said until then are printed then.
 */
const collect = (work: () => void): string[] => {
  const lines: string[] = [];
  const flush = (): void => {
    console.log(lines.join('\n'));
  };
  collecting = lines;
  process.once('exit', flush);
  try {
    work();
  } finally {
    collecting = undefined;
    process.off('exit', flush);
  }
  return lines.map((line) => line.replace(/^\[Setup\] /, '').replace(/^\n/, ''));
};

const IDENTITY_RULES: IdentityRule[] = [
  {
    file: 'package.json',
    label: 'package name',
    pattern: /^(\s*"name":\s*")[^"]*(")/m,
    replace: (id) => `$1${id.name}$2`,
  },
  {
    file: 'bun.lock',
    label: 'lockfile root workspace name',
    pattern: /("workspaces":\s*\{\s*"":\s*\{\s*"name":\s*")[^"]*(")/,
    replace: (id) => `$1${id.name}$2`,
  },
  {
    file: '.env.example',
    label: 'APP_NAME',
    pattern: /^APP_NAME=.*$/m,
    replace: (id) => `APP_NAME=${id.name}`,
  },
  {
    file: '.env.example',
    label: 'POSTGRES_DB',
    pattern: /^POSTGRES_DB=.*$/m,
    replace: (id) => `POSTGRES_DB=${id.snakeName}_db`,
  },
  {
    file: '.env.example',
    label: 'DATABASE_URL database name',
    pattern: /^(DATABASE_URL=.*\/)[^/\s]*$/m,
    replace: (id) => `$1${id.snakeName}_db`,
  },
  {
    file: 'src/config/app.config.ts',
    label: 'APP_NAME default',
    pattern: /(APP_NAME: z\.string\(\)\.default\(')[^']*(')/,
    replace: (id) => `$1${id.name}$2`,
  },
  ...['docker-compose.yml', 'docker-compose.dev.yml'].flatMap((file): IdentityRule[] => [
    {
      file,
      label: 'APP_NAME fallback',
      pattern: /\$\{APP_NAME:-[^}]*\}/g,
      replace: (id) => `\${APP_NAME:-${id.name}}`,
    },
    {
      file,
      label: 'POSTGRES_DB fallback',
      pattern: /\$\{POSTGRES_DB:-[^}]*\}/g,
      replace: (id) => `\${POSTGRES_DB:-${id.snakeName}_db}`,
    },
  ]),
  {
    file: 'README.md',
    label: 'title',
    pattern: /^# .*$/m,
    replace: (id) => `# ${id.title}`,
  },
  {
    file: 'docs-site/astro.config.mjs',
    label: 'docs portal title',
    pattern: /(title:\s*')[^']*(')/,
    replace: (id) => `$1${id.title}$2`,
  },
  {
    file: 'docs-site/src/content/docs/index.mdx',
    label: 'docs portal home title',
    pattern: /^( +title: ).*$/m,
    replace: (id) => `$1${id.title}`,
  },
];

interface ExampleModule {
  label: string;
  /** Files and directories that belong only to the example. */
  paths: string[];
  /**
   * Registrations in shared files (exact text, any line ending): `line` is one line or a block of
   * consecutive lines joined with `\n`; it is removed, or replaced by `replaceWith`.
   */
  lines: { file: string; line: string; replaceWith?: string }[];
}

const EXAMPLE_MODULES: ExampleModule[] = [
  {
    label: 'orders + order_items (header + detail example)',
    paths: [
      'src/modules/orders',
      'src/database/schema/domain/orders.schema.ts',
      'test/orders.e2e.test.ts',
    ],
    lines: [
      { file: 'src/database/schema/domain/index.ts', line: "export * from './orders.schema';" },
      {
        file: 'src/app.ts',
        line: '// Example module (header + detail): removed by `bun run setup <name>` unless --keep-examples.',
      },
      {
        file: 'src/app.ts',
        line: "import { ordersRouter } from './modules/orders/orders.routes';",
      },
      { file: 'src/app.ts', line: "  v1.route('/orders', ordersRouter);" },
      {
        file: 'docs/standards/structure.md',
        line: '│   ├── orders/                  # Example header + detail module (removed by `bun run setup` unless --keep-examples)',
      },
    ],
  },
  {
    label: 'projects + project-tasks (1:N) + project-budgets (1:1) (dependent modules example)',
    paths: [
      'src/modules/projects',
      'src/database/schema/domain/projects.schema.ts',
      'src/database/schema/domain/project-tasks.schema.ts',
      'src/database/schema/domain/project-budgets.schema.ts',
      'test/projects.e2e.test.ts',
    ],
    lines: [
      { file: 'src/database/schema/domain/index.ts', line: "export * from './projects.schema';" },
      {
        file: 'src/database/schema/domain/index.ts',
        line: "export * from './project-tasks.schema';",
      },
      {
        file: 'src/database/schema/domain/index.ts',
        line: "export * from './project-budgets.schema';",
      },
      {
        file: 'src/app.ts',
        line: '// Example modules (parent + dependents 1:N / 1:1): removed by `bun run setup <name>` unless --keep-examples.',
      },
      {
        file: 'src/app.ts',
        line: "import { projectsRouter } from './modules/projects/projects.routes';",
      },
      {
        file: 'src/app.ts',
        line: "import {\n  projectTasksParentRouter,\n  projectTasksRouter,\n} from './modules/projects/project-tasks/project-tasks.routes';",
      },
      {
        file: 'src/app.ts',
        line: "import {\n  projectBudgetsParentRouter,\n  projectBudgetsRouter,\n} from './modules/projects/project-budgets/project-budgets.routes';",
      },
      { file: 'src/app.ts', line: "  v1.route('/projects', projectsRouter);" },
      {
        file: 'src/app.ts',
        line: "  v1.route('/projects/:projectId/tasks', projectTasksParentRouter);",
      },
      { file: 'src/app.ts', line: "  v1.route('/project-tasks', projectTasksRouter);" },
      {
        file: 'src/app.ts',
        line: "  v1.route('/projects/:projectId/budget', projectBudgetsParentRouter);",
      },
      { file: 'src/app.ts', line: "  v1.route('/project-budgets', projectBudgetsRouter);" },
      {
        file: 'docs/standards/structure.md',
        line: '│   ├── projects/                # Example parent of dependent modules (removed by `bun run setup` unless --keep-examples)',
      },
      {
        file: 'docs/standards/structure.md',
        line: '│   │   ├── project-tasks/       # Example dependent 1:N (/api/v1/projects/:projectId/tasks, /api/v1/project-tasks/:id)',
      },
      {
        file: 'docs/standards/structure.md',
        line: '│   │   ├── project-budgets/     # Example dependent 1:1 (/api/v1/projects/:projectId/budget, /api/v1/project-budgets/:id)',
      },
    ],
  },
  {
    label: 'demo-pay + payment-notifications (vendor webhook example)',
    paths: [
      'src/integrations/demo-pay',
      'src/modules/payment-notifications',
      'src/config/demo-pay.config.ts',
      'src/config/demo-pay.config.test.ts',
      'test/vendor-webhooks.e2e.test.ts',
    ],
    lines: [
      {
        file: 'src/app.ts',
        line: [
          '// Example vendor webhook (Demo Pay → payment-notifications): removed by `bun run setup <name>` unless --keep-examples.',
          "import { demoPayWebhook } from './integrations/demo-pay/demo-pay.webhook';",
          "import { paymentNotificationWebhookRoutes } from './modules/payment-notifications/payment-notifications.webhook.routes';",
        ].join('\n'),
      },
      {
        file: 'src/app.ts',
        line: 'export const WEBHOOK_VENDORS: readonly WebhookVendor[] = [demoPayWebhook];',
        replaceWith: 'export const WEBHOOK_VENDORS: readonly WebhookVendor[] = [];',
      },
      {
        file: 'src/app.ts',
        line: '  app.route(`${webhooksPath}/${demoPayWebhook.vendor}`, paymentNotificationWebhookRoutes);',
      },
      { file: 'src/config/index.ts', line: "export * from './demo-pay.config';" },
      {
        file: 'src/integrations/registry.ts',
        line: [
          '  /** Example webhook vendor (inbound only): `src/integrations/demo-pay/`. */',
          "  DEMO_PAY: { code: 'DEMO_PAY', vendorName: 'Demo Pay (example)' },",
        ].join('\n'),
      },
      {
        file: 'test/setup/hermetic-env.ts',
        line: [
          '  // The example webhook vendor is enabled in tests with a test-only secret, never a real one.',
          "  DEMO_PAY_WEBHOOK_SECRET: 'test-only-demo-pay-webhook-secret',",
        ].join('\n'),
      },
      {
        file: '.env.example',
        line: [
          '',
          '# --- demo-pay (src/config/demo-pay.config.ts) — example webhook vendor (POST /api/webhooks/demo-pay) ---',
          '# The signing secret from the vendor dashboard. Empty = Demo Pay webhooks are disabled (all 401).',
          'DEMO_PAY_WEBHOOK_SECRET=',
          '# Signed timestamps older (or newer) than this are refused as replays.',
          'DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS=300',
        ].join('\n'),
      },
      {
        file: 'docs/standards/structure.md',
        line: '│   ├── demo-pay/                # Example webhook vendor: demo-pay.webhook.ts (verifier) + demo-pay.webhook.dto.ts',
      },
      {
        file: 'docs/standards/structure.md',
        line: '│   ├── payment-notifications/   # Example vendor webhook receiver (POST /api/webhooks/demo-pay, idempotent)',
      },
      {
        file: 'docs/standards/testing.md',
        line: '- `test/vendor-webhooks.e2e.test.ts` — signed Demo Pay webhooks through `createApp()` (service spied): accepted as `webhook:demo-pay`; forged, tampered, stale or unsigned → 401.',
      },
    ],
  },
  {
    label: 'jsonplaceholder + user-posts (outbound adapter example)',
    paths: [
      'src/integrations/jsonplaceholder',
      'src/modules/user-posts',
      'src/config/jsonplaceholder.config.ts',
      'test/user-posts.e2e.test.ts',
      'test/outbound.e2e.test.ts',
    ],
    lines: [
      {
        file: 'src/app.ts',
        line: [
          '// Example outbound module (JSONPlaceholder → /users/:id/external-posts): removed by `bun run setup <name>` unless --keep-examples.',
          "import { userPostRoutes } from './modules/user-posts/user-posts.routes';",
        ].join('\n'),
      },
      { file: 'src/app.ts', line: "  v1.route('/users', userPostRoutes);" },
      { file: 'src/config/index.ts', line: "export * from './jsonplaceholder.config';" },
      {
        file: 'src/config/config.test.ts',
        line: "import { buildJsonPlaceholderConfig } from './jsonplaceholder.config';",
      },
      {
        file: 'src/config/config.test.ts',
        line: [
          "  it('jsonplaceholder: should reject an invalid base URL', () => {",
          '    expect(buildJsonPlaceholderConfig({}).JSONPLACEHOLDER_TIMEOUT_MS).toBe(10000);',
          "    expect(() => buildJsonPlaceholderConfig({ JSONPLACEHOLDER_BASE_URL: 'not-a-url' })).toThrow(",
          "      'JSONPLACEHOLDER_BASE_URL',",
          '    );',
          '  });',
          '',
        ].join('\n'),
      },
      {
        file: 'src/integrations/registry.ts',
        line: "  JSONPLACEHOLDER: { code: 'JSONPLACEHOLDER', vendorName: 'JSONPlaceholder' },",
      },
      {
        file: '.env.example',
        line: [
          '',
          '# --- jsonplaceholder (src/config/jsonplaceholder.config.ts) — one group per vendor ---',
          'JSONPLACEHOLDER_BASE_URL=https://jsonplaceholder.typicode.com',
          'JSONPLACEHOLDER_TIMEOUT_MS=10000',
        ].join('\n'),
      },
      {
        file: 'docs/standards/structure.md',
        line: '│   └── jsonplaceholder/         # Example keyless outbound adapter: dto, service on HttpClientService, test against a fake vendor, index.ts (removed by `bun run setup` unless --keep-examples)',
      },
      {
        file: 'docs/standards/structure.md',
        line: '│   ├── user-posts/              # Example module consuming an outbound adapter (/api/v1/users/:id/external-posts) (removed by `bun run setup` unless --keep-examples)',
      },
      {
        file: 'docs/standards/testing.md',
        line: "- `test/outbound.e2e.test.ts` (example, removed by `bun run setup` unless --keep-examples) — the outbound contract end to end: a vendor 401 becomes 502 without the vendor's body, and the inbound `X-Request-ID` reaches the vendor. Adapter tests run against a local fake vendor (`Bun.serve`); see [integrations.md](integrations.md).",
      },
    ],
  },
];

/**
 * Removes (or replaces) one whole line or block of consecutive lines, keeping the file's line
 * endings (`core.autocrlf` checkouts use CRLF). `null` when the block is not there.
 */
const withoutLines = (content: string, block: string, replaceWith?: string): string | null => {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(eol);
  const wanted = block.split('\n');
  const index = lines.findIndex((_, start) =>
    wanted.every((line, offset) => lines[start + offset] === line),
  );
  if (index < 0) return null;
  lines.splice(index, wanted.length, ...(replaceWith === undefined ? [] : [replaceWith]));
  return lines.join(eol);
};

/**
 * After `setup <name>` the examples are the project's own business: removed, or kept and changed
 * around (a scaffolded webhook extends `WEBHOOK_VENDORS = [demoPayWebhook]`). `lint:setup` then
 * checks IDENTITY_RULES only — EXAMPLE_MODULES guards the boilerplate, not a project — so a
 * module named like an example (its own `orders`) or an edited registration is never drift.
 */
function stopGuardingExamples(rootDir: string): void {
  const packagePath = resolve(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
    scripts?: Record<string, string>;
  };
  const lintSetup = packageJson.scripts?.['lint:setup'];
  if (packageJson.scripts && lintSetup && !lintSetup.includes('--keep-examples')) {
    packageJson.scripts['lint:setup'] = `${lintSetup} --keep-examples`;
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8');
  }
}

/**
 * Removes the example modules; true when any was removed (the migrations then need a new
 * baseline). An example whose files and registrations are all gone was removed by an earlier run
 * (an initialized project): it is skipped, and when every example is gone nothing is touched — the
 * migrations of a real project are never regenerated. A partly present example is drift and aborts
 * before writing anything.
 */
function removeExamples(rootDir: string, dryRun: boolean): boolean {
  const pending = new Map<string, string>();
  const failures: string[] = [];
  const present: ExampleModule[] = [];

  for (const example of EXAMPLE_MODULES) {
    const found: string[] = [];
    const missing: string[] = [];
    const edits = new Map<string, string>();
    for (const path of example.paths) {
      if (existsSync(resolve(rootDir, path))) found.push(path);
      else missing.push(`${path}: not found`);
    }
    for (const { file, line, replaceWith } of example.lines) {
      const path = resolve(rootDir, file);
      if (!existsSync(path)) {
        missing.push(`${file}: file not found`);
        continue;
      }
      const current = edits.get(file) ?? pending.get(file) ?? readFileSync(path, 'utf-8');
      const next = withoutLines(current, line, replaceWith);
      if (next === null) {
        missing.push(`${file}: line not found: ${line.split('\n').join(' ⏎ ')}`);
      } else {
        found.push(file);
        edits.set(file, next);
      }
    }

    if (found.length === 0) {
      say(`[Setup] Example already removed: ${example.label}`);
      continue;
    }
    if (missing.length > 0) {
      failures.push(...missing.map((problem) => `${problem} (${example.label})`));
      continue;
    }
    present.push(example);
    for (const [file, content] of edits) pending.set(file, content);
  }

  if (failures.length > 0) {
    console.error('[Setup] Error: example modules out of sync with the codebase:');
    failures.forEach((failure) => {
      console.error(`  - ${failure}`);
    });
    console.error(
      '[Setup] Fix EXAMPLE_MODULES in scripts/setup.ts (or use --keep-examples). No files were changed.',
    );
    process.exit(1);
  }

  if (present.length === 0) return false;
  for (const example of present) {
    say(`[Setup] ${dryRun ? 'Would remove' : 'Remove'} example: ${example.label}`);
  }
  if (dryRun) return true;

  for (const example of present) {
    for (const path of example.paths)
      rmSync(resolve(rootDir, path), { recursive: true, force: true });
  }
  for (const [file, content] of pending) writeFileSync(resolve(rootDir, file), content, 'utf-8');
  stopGuardingExamples(rootDir);
  return true;
}

const printPartnerProblems = (problems: readonly string[]): never => {
  console.error('[Setup] Error: the partner gateway markers are out of sync with the codebase:');
  problems.forEach((problem) => {
    console.error(`  - ${problem}`);
  });
  console.error(
    '[Setup] Mark the partner lines (// partner:start … // partner:end; scripts/lib/partner-prune.ts) or fix PARTNER_ONLY. No files were changed.',
  );
  process.exit(1);
};

/**
 * Keeps the partner gateway (only its markers go) or removes it (`--no-partner`, plan D39). True
 * when the gateway was removed, so the migrations and the contract need a new baseline.
 */
function applyPartner(rootDir: string, keepPartner: boolean, dryRun: boolean): boolean {
  const plan = planPartner(rootDir, keepPartner);
  if (plan.problems.length > 0) printPartnerProblems(plan.problems);
  if (plan.regions === 0 && plan.remove.length === 0) return false;
  if (keepPartner) {
    say(
      `[Setup] ${dryRun ? 'Would keep' : 'Keep'} the partner gateway (${plan.regions} marked regions: markers removed)`,
    );
  } else {
    say(
      `[Setup] ${dryRun ? 'Would remove' : 'Remove'} the partner gateway (--no-partner): ${plan.remove.length} files / folders, ${plan.regions} marked regions, scripts ${PARTNER_SCRIPTS.join(', ')}`,
    );
  }
  if (dryRun) return !keepPartner;
  for (const path of plan.remove) rmSync(resolve(rootDir, path), { recursive: true, force: true });
  for (const [file, content] of plan.edits) {
    writeFileSync(resolve(rootDir, file), content, 'utf-8');
  }
  // A dropped region can leave code Prettier would join (a one-element array, a short union).
  const code = [...plan.edits.keys()].filter((file) => file.endsWith('.ts'));
  if (code.length > 0) {
    const format = Bun.spawnSync(['bunx', 'prettier', '--write', ...code], {
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (format.exitCode !== 0) {
      console.warn(
        `[Setup] WARNING: prettier failed (${format.stderr.toString().trim()}); run "bun run format".`,
      );
    }
  }
  return !keepPartner;
}

/**
 * Notes in package.json which boilerplate version and commit the project started from, and whether
 * it kept the partner gateway — what a future `partner:enable` needs to fetch the same code.
 */
function recordBoilerplateOrigin(rootDir: string, keepPartner: boolean, dryRun: boolean): void {
  const packagePath = resolve(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as Record<string, unknown>;
  if (packageJson.boilerplate !== undefined) return;
  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: rootDir, stderr: 'pipe' });
  const commit = head.exitCode === 0 ? head.stdout.toString().trim() : undefined;
  say(
    `[Setup] ${dryRun ? 'Would record' : 'Record'} the boilerplate origin in package.json (version, commit, partner)`,
  );
  if (dryRun) return;
  packageJson.boilerplate = { version: packageJson.version, commit, partner: keepPartner };
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8');
}

/**
 * A new project's first migration and contract, after examples or the partner gateway left:
 * migrations regenerated from scratch (no database exists yet) and the contract snapshot rewritten.
 */
function regenerateBaseline(rootDir: string, dryRun: boolean): void {
  say(
    `[Setup] ${dryRun ? 'Would regenerate' : 'Regenerate'} database migrations from scratch (drizzle/)`,
  );
  // The one machine that writes the contract snapshot: a new project's baseline, not a change.
  say(
    `[Setup] ${dryRun ? 'Would regenerate' : 'Regenerate'} the API contract baseline (${SNAPSHOT_PATH} + docs/api/*.md)`,
  );
  if (dryRun) return;

  const migrations = resolve(rootDir, 'drizzle');
  for (const entry of existsSync(migrations) ? readdirSync(migrations) : []) {
    rmSync(resolve(migrations, entry), { recursive: true, force: true });
  }
  const generate = Bun.spawnSync(['bunx', 'drizzle-kit', 'generate'], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (generate.exitCode !== 0) {
    console.error(generate.stdout.toString(), generate.stderr.toString());
    console.error(
      '[Setup] Error: drizzle-kit generate failed; run "bun run db:generate" after fixing it.',
    );
    process.exit(1);
  }

  // Removing the examples removes their operations (BREAKING by definition): a baseline, so allowed.
  const contract = Bun.spawnSync(['bun', 'scripts/openapi.ts', 'update', '--allow-breaking'], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (contract.exitCode !== 0) {
    console.error(contract.stdout.toString(), contract.stderr.toString());
    console.error(
      '[Setup] Error: the API contract baseline failed; run "bun run openapi:update --allow-breaking" after fixing it.',
    );
    process.exit(1);
  }
}

function toIdentity(request: SetupRequest): ProjectIdentity {
  return {
    name: request.name,
    snakeName: request.name.replace(/-/g, '_'),
    title: request.title ?? titleOf(request.name),
    description: request.description,
  };
}

function applyIdentity(rootDir: string, id: ProjectIdentity, dryRun: boolean): void {
  const pending = new Map<string, string>();
  const failures: string[] = [];
  const changes: string[] = [];

  for (const rule of IDENTITY_RULES) {
    const path = resolve(rootDir, rule.file);
    if (!existsSync(path)) {
      failures.push(`${rule.file}: file not found (${rule.label})`);
      continue;
    }
    const before = pending.get(rule.file) ?? readFileSync(path, 'utf-8');
    if (before.search(rule.pattern) < 0) {
      failures.push(`${rule.file}: no match for ${rule.label}`);
      continue;
    }
    pending.set(rule.file, before.replace(rule.pattern, rule.replace(id)));
    changes.push(`${rule.file} → ${rule.label}`);
  }

  if (failures.length > 0) {
    console.error('[Setup] Error: identity rules out of sync with the codebase:');
    failures.forEach((failure) => {
      console.error(`  - ${failure}`);
    });
    console.error('[Setup] Fix IDENTITY_RULES in scripts/setup.ts. No files were changed.');
    process.exit(1);
  }

  if (id.description) {
    const pkg = pending.get('package.json') ?? '{}';
    const parsed = JSON.parse(pkg) as Record<string, unknown>;
    parsed.description = id.description;
    pending.set('package.json', JSON.stringify(parsed, null, 2) + '\n');
    changes.push('package.json → description');
  }

  changes.forEach((change) => {
    say(`[Setup] ${dryRun ? 'Would update' : 'Update'} ${change}`);
  });
  if (dryRun) return;
  for (const [file, content] of pending) {
    writeFileSync(resolve(rootDir, file), content, 'utf-8');
  }
}

/**
 * Values the app refuses to start without, generated for a local .env: the JWT secret (32+
 * characters) and the keyring that encrypts partner secrets (one 32-byte key, `k1`). Only those
 * `.env.example` declares: a project without the partner gateway has no keyring.
 */
const GENERATED_SECRETS: readonly { name: string; generate: () => string }[] = [
  { name: 'JWT_SECRET', generate: () => randomBytes(48).toString('base64url') },
  { name: 'PARTNER_SECRET_KEYS', generate: () => `k1:${randomBytes(32).toString('hex')}` },
  { name: 'PARTNER_SECRET_ACTIVE_KEY_ID', generate: () => 'k1' },
];

/**
 * Fills each GENERATED_SECRETS variable the .env does not set (empty or missing line). An existing
 * value is never replaced or printed.
 */
function ensureGeneratedSecrets(envPath: string, template: string, dryRun: boolean): void {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const generated: string[] = [];

  for (const { name, generate } of GENERATED_SECRETS) {
    if (!new RegExp(`^${name}=`, 'm').test(template)) continue;
    if (new RegExp(`^${name}=\\S`, 'm').test(content)) continue;
    const emptyLine = new RegExp(`^${name}=[ \\t]*$`, 'm');
    const line = `${name}=${generate()}`;
    content = emptyLine.test(content)
      ? content.replace(emptyLine, () => line)
      : `${content.replace(/\n?$/, '\n')}${line}\n`;
    generated.push(name);
  }

  if (generated.length === 0) return;
  if (!dryRun) writeFileSync(envPath, content, 'utf-8');
  say(`[Setup] ${dryRun ? 'Would generate' : 'Generated'} ${generated.join(', ')} in .env`);
}

/** `template`: the `.env.example` a dry run would leave (the file itself is not changed yet). */
function ensureEnvFile(
  rootDir: string,
  id: ProjectIdentity | undefined,
  dryRun: boolean,
  template?: string,
): void {
  const envPath = resolve(rootDir, '.env');
  const envExamplePath = resolve(rootDir, '.env.example');

  if (!existsSync(envExamplePath)) {
    console.error('[Setup] Error: .env.example not found');
    process.exit(1);
  }
  template ??= readFileSync(envExamplePath, 'utf-8');
  if (!existsSync(envPath)) {
    if (!dryRun) copyFileSync(envExamplePath, envPath);
    say(`[Setup] ${dryRun ? 'Would create' : 'Created'} .env from .env.example`);
    ensureGeneratedSecrets(envPath, template, dryRun);
    return;
  }

  // Existing .env holds local secrets: only APP_NAME and missing GENERATED_SECRETS are touched,
  // and no value is ever printed.
  ensureGeneratedSecrets(envPath, template, dryRun);
  if (id) {
    if (!dryRun) {
      const content = readFileSync(envPath, 'utf-8');
      writeFileSync(envPath, content.replace(/^APP_NAME=.*$/m, `APP_NAME=${id.name}`), 'utf-8');
    }
    say(
      `[Setup] Existing .env detected: ${dryRun ? 'would update' : 'updated'} APP_NAME only. ` +
        'Review POSTGRES_DB / DATABASE_URL manually.',
    );
  } else {
    say('[Setup] Existing .env detected, leaving existing values intact');
  }
}

/**
 * Renames, removes or keeps the examples and the partner gateway, and prepares the env file;
 * `dryRun` only prints.
 */
function initialize(rootDir: string, request: SetupRequest | undefined, dryRun: boolean): void {
  let identity: ProjectIdentity | undefined;
  let template: string | undefined;
  if (request) {
    identity = toIdentity(request);
    say(`[Setup] name=${identity.name} db=${identity.snakeName}_db title="${identity.title}"`);
    // Checked before anything is written: the partner markers fail like a drifted identity rule.
    const partnerPlan = planPartner(rootDir, request.partner);
    if (partnerPlan.problems.length > 0) printPartnerProblems(partnerPlan.problems);
    // Rename first so a freshly created .env inherits the new identity from .env.example.
    applyIdentity(rootDir, identity, dryRun);
    let newBaseline = false;
    if (request.keepExamples) {
      say('[Setup] Keeping the example modules (--keep-examples)');
      if (!dryRun) stopGuardingExamples(rootDir);
    } else {
      newBaseline = removeExamples(rootDir, dryRun);
    }
    newBaseline = applyPartner(rootDir, request.partner, dryRun) || newBaseline;
    if (dryRun) template = partnerPlan.edits.get('.env.example');
    recordBoilerplateOrigin(rootDir, request.partner, dryRun);
    if (newBaseline) regenerateBaseline(rootDir, dryRun);
  }
  ensureEnvFile(rootDir, identity, dryRun, template);
}

const NEXT_STEPS = [
  '1. Make sure PostgreSQL and Redis are running (or: docker compose up -d)',
  '2. Apply database migrations: bun run db:migrate',
  '3. Create the first admin:     bun run seed:admin --email <email>',
  '4. Start development server:  bun run dev',
];

const printNextSteps = (dryRun: boolean): void => {
  say('----------------------------------------------------');
  say(
    dryRun
      ? '[Setup] Project initialization preview finished — nothing was changed'
      : '[Setup] Project initialization completed successfully',
  );
  // Husky's hooks live in .git/config: a fresh git init loses them silently.
  const hooksAdvice = gitHooksAdvice(readGitState(process.cwd()));
  if (hooksAdvice) say(`[Setup] WARNING: ${hooksAdvice}`);
  say('Next steps:');
  for (const step of NEXT_STEPS) say(`  ${step}`);
  say('----------------------------------------------------');
};

async function runSetup(): Promise<void> {
  const rootDir = process.cwd();
  exitOnHelp(process.argv.slice(2), SETUP_USAGE);
  const args = parseSetupArgs(process.argv.slice(2));
  // SETUP_WIZARD_STDIN=1: `bun run acceptance` answers the wizard through a pipe; never set by hand.
  const driven = process.env.SETUP_WIZARD_STDIN === '1';
  const interactive =
    needsSetupWizard(args) && (driven || (process.stdin.isTTY && process.stdout.isTTY));

  if (!interactive) {
    const request = args.name === undefined ? undefined : requestOf({ ...args, name: args.name });
    say(`[Setup] Starting project initialization${args.dryRun ? ' (dry run)' : ''}...`);
    initialize(rootDir, request, args.dryRun);
    printNextSteps(args.dryRun);
    return;
  }

  // The wizard (plan D40): the answers become the same arguments as a typed command, parsed like one.
  const prompter = terminalPrompter;
  prompter.intro('bun run setup');
  const answers = await completeSetup(args, prompter, (text) => {
    prompter.note(text, 'Partner gateway');
  });
  const request = requestOf({ ...parseSetupArgs(setupArgv(answers)), name: answers.name });
  prompter.note(
    collect(() => {
      initialize(rootDir, request, true);
    }).join('\n'),
    'Plan — nothing is changed yet',
  );
  const equivalent = setupCommandOf(request);
  if (args.dryRun) {
    prompter.note(equivalent, 'Same result without the wizard');
    prompter.outro('Dry run: nothing was changed');
    return;
  }
  if (!(await prompter.confirm('Apply these changes?'))) throw new CancelledError();
  const line = prompter.spinner();
  line.start('Initializing the project: identity, examples, migrations, API contract, formatting');
  // initialize() runs its tools synchronously: let the spinner draw its first frame before.
  await Bun.sleep(100);
  const changes = collect(() => {
    initialize(rootDir, request, false);
  });
  line.stop('Project initialization completed successfully');
  prompter.note(changes.join('\n'), 'Changes');
  // Husky's hooks live in .git/config: a fresh git init loses them silently.
  const hooksAdvice = gitHooksAdvice(readGitState(process.cwd()));
  prompter.note(
    [...(hooksAdvice ? [`WARNING: ${hooksAdvice}`, ''] : []), ...NEXT_STEPS].join('\n'),
    'Next steps',
  );
  prompter.note(equivalent, 'Same result without the wizard');
  prompter.outro('Project initialization completed successfully');
}

try {
  await runSetup();
} catch (error) {
  if (error instanceof SetupArgsError || error instanceof CancelledError) {
    console.error(`[Setup] ${error.message}`);
    process.exit(1);
  }
  throw error;
}
