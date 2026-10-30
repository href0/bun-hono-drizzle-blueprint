/**
 * Every `package.json` script, grouped, with one line each (D40): what `bun run help` prints,
 * and the usage of every `scripts/*.ts` (`--help`, `bun run help <command>`). `commands.test.ts`
 * keeps the registry and `package.json` equal (R83); the command table of quality-gates.md §3 stays
 * the documentation of the same scripts.
 */
import { ACCEPTANCE_USAGE } from './acceptance';
import { USAGE as SCAFFOLD_USAGE } from './scaffold';
import { SETUP_USAGE } from './setup-wizard';

export interface Command {
  script: string;
  /** What it does and when to use it, in one line. */
  summary: string;
  /** Needs the developer's own database or services: a developer runs it, never an AI agent (database.md §4). */
  developer?: true;
}

export interface CommandGroup {
  title: string;
  commands: readonly Command[];
}

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  {
    title: 'Start',
    commands: [
      { script: 'dev', summary: 'Start the API and restart it on every change: while developing' },
      { script: 'start', summary: 'Start the API once, without watching files' },
      {
        script: 'build',
        summary: 'Bundle the API into dist/: proves the release bundle builds (CI runs it)',
      },
      { script: 'help', summary: 'This list; bun run help <command> explains one command' },
    ],
  },
  {
    title: 'Project setup',
    commands: [
      {
        script: 'setup',
        summary:
          'Turn a fresh clone into a named project: identity, examples removed, contract baseline (no name in a terminal: the wizard)',
      },
      {
        script: 'lint:setup',
        summary:
          'Dry run of setup: every identity rule and example registration still matches its file',
      },
      { script: 'prepare', summary: 'Run by bun install: activates the Husky git hooks' },
    ],
  },
  {
    title: 'Generate code',
    commands: [
      {
        script: 'scaffold',
        summary:
          'Generate a module, an endpoint, a webhook receiver or a vendor adapter from the templates and register it (no arguments in a terminal: the wizard)',
      },
      {
        script: 'scaffold:module',
        summary:
          'The scaffold wizard straight to a module: standalone, header-detail, record, dependent',
      },
      // partner:start
      {
        script: 'scaffold:partner',
        summary: 'The scaffold wizard straight to a signed partner endpoint',
      },
      // partner:end
      {
        script: 'scaffold:webhook',
        summary: 'The scaffold wizard straight to a vendor webhook receiver',
      },
      {
        script: 'scaffold:integration',
        summary: 'The scaffold wizard straight to an outbound vendor adapter',
      },
      {
        script: 'verify:scaffold',
        summary:
          'Generate every template variant, run every gate on them, restore the tree: after changing a template, the scaffold CLI or a core API they use (minutes)',
      },
    ],
  },
  {
    title: 'Quality gates',
    commands: [
      {
        script: 'validate',
        summary:
          'Every static gate in order (types, lint, names, format, layers, unused code, setup, API contract, branch), no tests',
      },
      {
        script: 'validate:full',
        summary:
          'validate + the tests with the coverage gate: required before a pull request (pre-push)',
      },
      { script: 'typecheck', summary: 'Strict TypeScript check of src, test and scripts' },
      { script: 'lint', summary: 'ESLint with the project rules, no warnings allowed' },
      { script: 'lint:fix', summary: 'ESLint with autofix' },
      { script: 'lint:ls', summary: 'File and folder names are kebab-case (ls-lint)' },
      {
        script: 'lint:arch',
        summary: 'Imports between layers follow the boundaries (dependency-cruiser)',
      },
      { script: 'lint:deps', summary: 'No unused files, exports or dependencies (knip)' },
      { script: 'lint:branch', summary: 'The branch name is <type>/<slug>' },
      { script: 'format', summary: 'Prettier writes src, test and scripts (*.ts only)' },
      { script: 'format:check', summary: 'Prettier checks src, test and scripts without writing' },
    ],
  },
  {
    title: 'Tests',
    commands: [
      { script: 'test', summary: 'Unit and e2e tests, hermetic: no real database or Redis' },
      { script: 'test:unit', summary: 'Only the tests next to the code in src/: fast feedback' },
      {
        script: 'test:e2e',
        summary: 'Only test/: e2e suites, architecture and documentation guards',
      },
      {
        script: 'test:cov',
        summary: 'The tests, then the coverage gate (scripts/check-coverage.ts)',
      },
      {
        script: 'test:int',
        summary:
          'Integration suite on real PostgreSQL + Redis in a disposable database: after changing repositories, migrations, auth or the cache',
        developer: true,
      },
      {
        script: 'acceptance',
        summary:
          'Pre-release run: per setup combination a fresh clone through setup, generators, gates, database, server, HTTP and Docker',
        developer: true,
      },
    ],
  },
  {
    title: 'Database',
    commands: [
      {
        script: 'db:generate',
        summary: 'Write a migration into drizzle/ from the schema change (offline; commit it)',
      },
      { script: 'db:migrate', summary: 'Apply the migrations to DATABASE_URL', developer: true },
      { script: 'db:studio', summary: 'Open Drizzle Studio on DATABASE_URL', developer: true },
    ],
  },
  {
    title: 'API contract',
    commands: [
      {
        script: 'openapi:check',
        summary:
          'Fail when the API or docs/api/*.md differ from the reviewed snapshot (each change labelled BREAKING / safe / docs)',
      },
      {
        script: 'openapi:update',
        summary:
          'Write the snapshot and docs/api/*.md after reviewing the changes; never run by a hook, CI or scaffold',
      },
    ],
  },
  {
    title: 'Auth',
    commands: [
      {
        script: 'seed:admin',
        summary:
          'Create the first administrator, or --promote an existing user; the password is never an argument',
        developer: true,
      },
      {
        script: 'auth:purge-tokens',
        summary: 'Delete refresh tokens that expired more than N days ago: schedule it daily',
        developer: true,
      },
    ],
  },
  // partner:start
  {
    title: 'Partner gateway',
    commands: [
      {
        script: 'partner:sign',
        summary:
          'Sign a partner request (signing v1) and print the headers and a curl, or --send it',
      },
    ],
  },
  // partner:end
  {
    title: 'Docs portal',
    commands: [
      {
        script: 'docs:dev',
        summary:
          'Serve the documentation portal at http://localhost:4321 with the documents synced',
      },
      {
        script: 'docs:build',
        summary: 'Build the portal and fail on a broken internal link or anchor (CI job docs)',
      },
    ],
  },
];

/** `package.json` scripts, or usages by file: a name may be missing. */
export type Scripts = Readonly<Partial<Record<string, string>>>;

/** The usage of every `scripts/*.ts` a `package.json` script runs, by file name. */
export const SCRIPT_USAGE: Scripts = {
  'help.ts': `Usage: bun run help [<command>]
  Without a command: every command of this project, grouped. With one: what it does, what it runs,
  and its usage. Every scripts/*.ts command also answers --help.`,
  'setup.ts': SETUP_USAGE,
  'scaffold.ts': SCAFFOLD_USAGE,
  'verify-scaffold.ts': `Usage: bun run verify:scaffold
  Generates every scaffold template variant, then runs prettier, tsc, ESLint, ls-lint, depcruise,
  knip, the generated tests, real requests and the coverage gate on them; restores every file
  afterwards. Takes minutes.`,
  'test-integration.ts': `Usage: bun run test:int [<filter>…] [--keep-db] [--dry-run]
  <filter>    only test/integration/*.int.ts files whose name contains it (e.g. auth)
  --keep-db   keep the disposable database afterwards (debugging)
  --dry-run   print the database, Redis and files a run would use; touch nothing
  Services: TEST_DATABASE_URL + TEST_REDIS_*, or the local development settings on this machine only.`,
  'acceptance.ts': ACCEPTANCE_USAGE,
  'check-coverage.ts': `Usage: bun scripts/check-coverage.ts
  The coverage gate of bun run test:cov: reads coverage/lcov.info (written by bun test --coverage)
  and fails below THRESHOLDS or when a src/ file is loaded by no test.`,
  'openapi.ts': `Usage:
  bun run openapi:check                       fail on any difference from docs/api/openapi.json or docs/api/*.md
  bun run openapi:update [--allow-breaking]   write both after reviewing the changes; BREAKING needs the flag
  A developer runs openapi:update, consciously: never a hook, CI or bun run scaffold. In a terminal
  it shows the changes and asks (BREAKING has its own question, default No); without one, BREAKING
  needs --allow-breaking.`,
  'seed-admin.ts': `Usage: bun run seed:admin [--email <email>] [--name "<full name>"] [--promote]
  Creates the first administrator in the database of the env file, or makes an existing user an
  active admin (--promote, no password). In a terminal a missing email and name are asked and the
  password is asked masked, twice. Without a terminal --email is required and the password is the
  first line of stdin:
    printf '%s\\n' "$ADMIN_PASSWORD" | bun run seed:admin --email admin@example.com`,
  'purge-refresh-tokens.ts': `Usage: bun run auth:purge-tokens [--days <whole number ≥ 0>]
  Deletes refresh tokens that expired more than N days ago (default 7). Schedule it daily: cron,
  a CI job, a Kubernetes CronJob — without a terminal it never asks. In a terminal it shows how many
  would go and asks first (default No).`,
  // partner:start
  'partner-sign.ts': `Usage: bun run partner:sign --key <api key> --url <absolute url> [--method GET] [--body '<raw body>' | --body-file <path>] [--send]
  Prints the four x-partner-* headers and a ready curl (single use, valid within the server's
  tolerance), or sends the request with --send. The secret is asked masked in a terminal, or is the
  first line of stdin — never an argument.`,
  // partner:end
};

/** The usage of `scripts/<file>`; a script without one is a programming error. */
export const usageOf = (file: string): string => {
  const usage = SCRIPT_USAGE[file];
  if (usage === undefined) throw new Error(`scripts/${file} has no entry in SCRIPT_USAGE`);
  return usage;
};

/** The files of `scripts/` a `package.json` command runs (`bun scripts/openapi.ts check` → `openapi.ts`). */
export const scriptFilesOf = (command: string): string[] =>
  [...command.matchAll(/\bbun scripts\/([\w-]+\.ts)\b/g)].map((match) => match[1]);

// --- bun run help ---------------------------------------------------------------------------------

export interface HelpStyle {
  /** Columns to fit (the terminal's, or a default for a pipe). */
  width: number;
  /** ANSI colours: only for a terminal without NO_COLOR. */
  color: boolean;
}

const DEVELOPER_NOTE =
  '* run by a developer on their own database / services, never by an AI agent';

const painter = (color: boolean) => {
  const wrap = (open: number, close: number) => (text: string) =>
    color ? `\u001b[${String(open)}m${text}\u001b[${String(close)}m` : text;
  return { bold: wrap(1, 22), dim: wrap(2, 22), cyan: wrap(36, 39), yellow: wrap(33, 39) };
};

/** `text` in lines of at most `width` characters (a longer word stays whole). */
const wrapText = (text: string, width: number): string[] =>
  text.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
    return lines;
  }, []);

/** The groups with only the scripts `package.json` has; groups left empty are dropped. */
const presentGroups = (scripts: Scripts): CommandGroup[] =>
  COMMAND_GROUPS.map((group) => ({
    title: group.title,
    commands: group.commands.filter((command) => command.script in scripts),
  })).filter((group) => group.commands.length > 0);

/** `bun run help`: every script of `package.json` the registry knows, grouped, aligned, wrapped. */
export const commandsHelp = (projectName: string, scripts: Scripts, style: HelpStyle): string => {
  const paint = painter(style.color);
  const groups = presentGroups(scripts);
  const nameWidth = Math.max(
    ...groups.flatMap((group) => group.commands.map((c) => c.script.length)),
  );
  // `  <name>  * <summary>`: the summary wraps under itself.
  const indent = 2 + nameWidth + 2 + 2;
  const summaryWidth = Math.max(style.width - indent, 30);
  const lines = groups.flatMap((group) => [
    '',
    paint.bold(group.title),
    ...group.commands.flatMap((command) => {
      const [first = '', ...more] = wrapText(command.summary, summaryWidth);
      const mark = command.developer === true ? paint.yellow('* ') : '  ';
      return [
        `  ${paint.cyan(command.script.padEnd(nameWidth))}  ${mark}${first}`,
        ...more.map((line) => `${' '.repeat(indent)}${line}`),
      ];
    }),
  ]);
  return [
    `${paint.bold(projectName)} — bun run <command>`,
    ...lines,
    '',
    ...[
      DEVELOPER_NOTE,
      'Details: bun run <command> --help (scripts/*.ts) · bun run help <command>',
    ].flatMap((note) => wrapText(note, style.width).map(paint.dim)),
    '',
  ].join('\n');
};

/** `bun run help <command>`: what it does, what it runs, and the usage of its script. */
export const commandHelp = (name: string, scripts: Scripts): string => {
  const command = presentGroups(scripts)
    .flatMap((group) => group.commands)
    .find((entry) => entry.script === name);
  const runs = scripts[name];
  if (command === undefined || runs === undefined) {
    throw new Error(`unknown command "${name}": bun run help lists every command`);
  }
  const usages = scriptFilesOf(runs).flatMap((file) => {
    const usage = SCRIPT_USAGE[file];
    return usage === undefined ? [] : ['', usage];
  });
  return [
    `bun run ${name} — ${command.summary}`,
    `Runs: ${runs}`,
    ...(command.developer === true ? [DEVELOPER_NOTE] : []),
    ...usages,
    '',
  ].join('\n');
};
