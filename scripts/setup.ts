/**
 * Project initializer — turns a fresh clone of this boilerplate into a named project.
 *
 * Usage:
 *   bun run setup                                  # only create .env from .env.example
 *   bun run setup <project-name> [--description "..."] [--keep-examples] [--dry-run]
 *
 * IDENTITY_RULES is the single registry of every place that carries the project identity.
 * When you add a new file/setting that hardcodes the project name, register it here.
 * Every required rule must match; a rule that matches nothing aborts the run (drift guard).
 *
 * EXAMPLE_MODULES lists the example code a new project starts without (default): its files and
 * registrations are removed and the migrations are regenerated from scratch — a new project has
 * no database yet, so its history starts clean. `--keep-examples` keeps them. Same drift guard.
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
import { gitHooksAdvice, readGitState } from './lib/git-hooks';

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

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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
          "  DEMO_PAY: { code: 'DEMO_PAY', institution: 'Demo Pay (example)' },",
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
 * Removes the example modules, then regenerates the migrations from scratch. An example whose
 * files and registrations are all gone was removed by an earlier run (an initialized project): it
 * is skipped, and when every example is gone nothing is touched — the migrations of a real project
 * are never regenerated. A partly present example is drift and aborts before writing anything.
 */
function removeExamples(rootDir: string, dryRun: boolean): void {
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
      console.log(`[Setup] Example already removed: ${example.label}`);
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

  if (present.length === 0) return;
  for (const example of present) {
    console.log(`[Setup] ${dryRun ? 'Would remove' : 'Remove'} example: ${example.label}`);
  }
  console.log(
    `[Setup] ${dryRun ? 'Would regenerate' : 'Regenerate'} database migrations from scratch (drizzle/)`,
  );
  // The one machine that writes the contract snapshot: a new project's baseline, not a change.
  console.log(
    `[Setup] ${dryRun ? 'Would regenerate' : 'Regenerate'} the API contract baseline (${SNAPSHOT_PATH} + docs/api/*.md) without the examples`,
  );
  if (dryRun) return;

  for (const example of present) {
    for (const path of example.paths)
      rmSync(resolve(rootDir, path), { recursive: true, force: true });
  }
  for (const [file, content] of pending) writeFileSync(resolve(rootDir, file), content, 'utf-8');
  stopGuardingExamples(rootDir);

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

function toIdentity(name: string, description?: string): ProjectIdentity {
  return {
    name,
    snakeName: name.replace(/-/g, '_'),
    title: name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
    description,
  };
}

function parseArgs(argv: string[]): {
  name?: string;
  description?: string;
  dryRun: boolean;
  keepExamples: boolean;
} {
  const dryRun = argv.includes('--dry-run');
  const keepExamples = argv.includes('--keep-examples');
  const descIndex = argv.indexOf('--description');
  const description = descIndex >= 0 ? argv[descIndex + 1]?.trim() : undefined;
  const name = argv.find(
    (arg, i) => !arg.startsWith('--') && (descIndex < 0 || i !== descIndex + 1),
  );
  return { name: name?.trim(), description, dryRun, keepExamples };
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
    console.log(`[Setup] ${dryRun ? 'Would update' : 'Update'} ${change}`);
  });
  if (dryRun) return;
  for (const [file, content] of pending) {
    writeFileSync(resolve(rootDir, file), content, 'utf-8');
  }
}

/**
 * Values the app refuses to start without, generated for a local .env: the JWT secret (32+
 * characters) and the keyring that encrypts partner secrets (one 32-byte key, `k1`).
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
function ensureGeneratedSecrets(envPath: string, dryRun: boolean): void {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const generated: string[] = [];

  for (const { name, generate } of GENERATED_SECRETS) {
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
  console.log(`[Setup] ${dryRun ? 'Would generate' : 'Generated'} ${generated.join(', ')} in .env`);
}

function ensureEnvFile(rootDir: string, id: ProjectIdentity | undefined, dryRun: boolean): void {
  const envPath = resolve(rootDir, '.env');
  const envExamplePath = resolve(rootDir, '.env.example');

  if (!existsSync(envPath)) {
    if (!existsSync(envExamplePath)) {
      console.error('[Setup] Error: .env.example not found');
      process.exit(1);
    }
    if (!dryRun) copyFileSync(envExamplePath, envPath);
    console.log(`[Setup] ${dryRun ? 'Would create' : 'Created'} .env from .env.example`);
    ensureGeneratedSecrets(envPath, dryRun);
    return;
  }

  // Existing .env holds local secrets: only APP_NAME and missing GENERATED_SECRETS are touched,
  // and no value is ever printed.
  ensureGeneratedSecrets(envPath, dryRun);
  if (id) {
    if (!dryRun) {
      const content = readFileSync(envPath, 'utf-8');
      writeFileSync(envPath, content.replace(/^APP_NAME=.*$/m, `APP_NAME=${id.name}`), 'utf-8');
    }
    console.log(
      `[Setup] Existing .env detected: ${dryRun ? 'would update' : 'updated'} APP_NAME only. ` +
        'Review POSTGRES_DB / DATABASE_URL manually.',
    );
  } else {
    console.log('[Setup] Existing .env detected, leaving existing values intact');
  }
}

function runSetup(): void {
  const rootDir = process.cwd();
  const { name, description, dryRun, keepExamples } = parseArgs(process.argv.slice(2));

  console.log(`[Setup] Starting project initialization${dryRun ? ' (dry run)' : ''}...`);

  let identity: ProjectIdentity | undefined;
  if (name) {
    if (!NAME_PATTERN.test(name)) {
      console.error(
        '[Setup] Error: project name must be kebab-case (lowercase letters, digits, single hyphens; starts with a letter)',
      );
      process.exit(1);
    }
    identity = toIdentity(name, description);
    console.log(
      `[Setup] name=${identity.name} db=${identity.snakeName}_db title="${identity.title}"`,
    );
    // Rename first so a freshly created .env inherits the new identity from .env.example.
    applyIdentity(rootDir, identity, dryRun);
    if (keepExamples) {
      console.log('[Setup] Keeping the example modules (--keep-examples)');
      if (!dryRun) stopGuardingExamples(rootDir);
    } else {
      removeExamples(rootDir, dryRun);
    }
  }

  ensureEnvFile(rootDir, identity, dryRun);

  console.log('----------------------------------------------------');
  console.log(`[Setup] Project initialization ${dryRun ? 'preview' : 'completed'} successfully`);
  // Husky's hooks live in .git/config: a fresh git init loses them silently.
  const hooksAdvice = gitHooksAdvice(readGitState(rootDir));
  if (hooksAdvice) console.log(`[Setup] WARNING: ${hooksAdvice}`);
  console.log('Next steps:');
  console.log('  1. Make sure PostgreSQL and Redis are running (or: docker compose up -d)');
  console.log('  2. Apply database migrations: bun run db:migrate');
  console.log('  3. Create the first admin:     bun run seed:admin --email <email>');
  console.log('  4. Start development server:  bun run dev');
  console.log('----------------------------------------------------');
}

runSetup();
