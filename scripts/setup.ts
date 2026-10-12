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
];

interface ExampleModule {
  label: string;
  /** Files and directories that belong only to the example. */
  paths: string[];
  /** Registrations in shared files, removed line by line (exact text, any line ending). */
  lines: { file: string; line: string }[];
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
        file: 'README.md',
        line: '│   ├── orders/                  # Modul contoh header + detail (/api/v1/orders[/:id/items]) — dihapus `bun run setup` kecuali --keep-examples',
      },
    ],
  },
];

/** Removes one whole line, keeping the file's line endings (`core.autocrlf` checkouts use CRLF). */
const withoutLine = (content: string, line: string): string | null => {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(eol);
  const index = lines.indexOf(line);
  if (index < 0) return null;
  lines.splice(index, 1);
  return lines.join(eol);
};

function removeExamples(rootDir: string, dryRun: boolean): void {
  const pending = new Map<string, string>();
  const failures: string[] = [];

  for (const example of EXAMPLE_MODULES) {
    for (const path of example.paths) {
      if (!existsSync(resolve(rootDir, path)))
        failures.push(`${path}: not found (${example.label})`);
    }
    for (const { file, line } of example.lines) {
      const path = resolve(rootDir, file);
      if (!existsSync(path)) {
        failures.push(`${file}: file not found (${example.label})`);
        continue;
      }
      const next = withoutLine(pending.get(file) ?? readFileSync(path, 'utf-8'), line);
      if (next === null) failures.push(`${file}: line not found: ${line}`);
      else pending.set(file, next);
    }
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

  for (const example of EXAMPLE_MODULES) {
    console.log(`[Setup] ${dryRun ? 'Would remove' : 'Remove'} example: ${example.label}`);
  }
  console.log(
    `[Setup] ${dryRun ? 'Would regenerate' : 'Regenerate'} database migrations from scratch (drizzle/)`,
  );
  if (dryRun) return;

  for (const example of EXAMPLE_MODULES) {
    for (const path of example.paths)
      rmSync(resolve(rootDir, path), { recursive: true, force: true });
  }
  for (const [file, content] of pending) writeFileSync(resolve(rootDir, file), content, 'utf-8');

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
 * The app refuses to start without a JWT_SECRET of 32+ characters; a local .env gets a random one
 * when it has none (empty or missing line). An existing secret is never replaced or printed.
 */
function ensureJwtSecret(envPath: string, dryRun: boolean): void {
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  if (/^JWT_SECRET=\S/m.test(content)) return;

  if (!dryRun) {
    const line = `JWT_SECRET=${randomBytes(48).toString('base64url')}`;
    const updated = /^JWT_SECRET=[ \t]*$/m.test(content)
      ? content.replace(/^JWT_SECRET=[ \t]*$/m, () => line)
      : `${content.replace(/\n?$/, '\n')}${line}\n`;
    writeFileSync(envPath, updated, 'utf-8');
  }
  console.log(`[Setup] ${dryRun ? 'Would generate' : 'Generated'} a random JWT_SECRET in .env`);
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
    ensureJwtSecret(envPath, dryRun);
    return;
  }

  // Existing .env holds local secrets: only APP_NAME and a missing JWT_SECRET are touched, and no
  // value is ever printed.
  ensureJwtSecret(envPath, dryRun);
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
    if (keepExamples) console.log('[Setup] Keeping the example modules (--keep-examples)');
    else removeExamples(rootDir, dryRun);
  }

  ensureEnvFile(rootDir, identity, dryRun);

  console.log('----------------------------------------------------');
  console.log(`[Setup] Project initialization ${dryRun ? 'preview' : 'completed'} successfully`);
  console.log('Next steps:');
  console.log('  1. Make sure PostgreSQL and Redis are running (or: docker compose up -d)');
  console.log('  2. Apply database migrations: bun run db:migrate');
  console.log('  3. Create the first admin:     bun run seed:admin --email <email>');
  console.log('  4. Start development server:  bun run dev');
  console.log('----------------------------------------------------');
}

runSetup();
