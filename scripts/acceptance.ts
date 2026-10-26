/**
 * `bun run acceptance` — the pre-release run of this boilerplate (plan D37,
 * docs/standards/manual-acceptance.md): for each chosen setup combination, the commit under test
 * becomes a new project in a work folder next to this repository and goes through stages A–D (see
 * scripts/lib/acceptance.ts). The runner answers the wizard itself: nobody types anything.
 *
 *   bun run acceptance                    in a terminal: tick the combinations, see the plan, confirm
 *   bun run acceptance --combo 1,2        no questions (agents, automation)
 *   bun run acceptance --combo 1 --plan   only the steps and the estimate
 *   bun run acceptance --clean            remove work folders and databases of earlier runs
 *
 * Services of stage C: TEST_DATABASE_URL + TEST_REDIS_* (or the local development settings on a
 * developer machine only) — scripts/lib/test-services.ts. Each combination gets its own database
 * `<name>_acceptance_c<id>` (marked by a comment) and Redis prefix, dropped when it ends — also on
 * failure and on Ctrl+C. Every command's output goes to the step's log in the work folder, never to
 * the screen; a failing step shows its last lines and the log path. The work folder is removed when
 * everything passed and kept otherwise (`--keep` always keeps it).
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Subprocess } from 'bun';
import Redis from 'ioredis';
import postgres from 'postgres';
import {
  ACCEPTANCE_STEPS,
  ACCEPTANCE_USAGE,
  activeOption,
  askCombos,
  check,
  keysOf,
  KEYS,
  parseAcceptanceArgs,
  plainText,
  planText,
  PROJECT_NAME,
  runCombo,
  StepFailure,
  type AcceptanceArgs,
  type AcceptanceContext,
  type Combo,
  type CommandResult,
  type HttpOptions,
  type HttpResult,
  type RunOptions,
  type StageReadiness,
  type Turn,
} from './lib/acceptance';
import { ProgressReporter, summaryTable, type ComboResult } from './lib/acceptance-progress';
import { exitOnHelp } from './lib/cli-args';
import { terminalPrompter } from './lib/prompter';
import {
  databaseBaseOf,
  deleteRedisKeys,
  resolveServices,
  type ServiceTargets,
} from './lib/test-services';

const ROOT = resolve(import.meta.dir, '..');
const WORK_ROOT = join(dirname(ROOT), '_acceptance');
const WORK_PATTERN = /^acceptance-\d{8}-\d{4}$/;
const DISPOSABLE_MARKER = 'acceptance disposable database (scripts/acceptance.ts)';
const QUESTION_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 15 * 60_000;
const TAIL_LINES = 30;

const say = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

const tailOf = (text: string, lines = TAIL_LINES): string =>
  text
    .trimEnd()
    .split('\n')
    .slice(-lines)
    .map((line) => `    │ ${line}`)
    .join('\n');

/** Runs a command outside the steps (git, docker info); never rejects. */
const quiet = async (command: string[], cwd = ROOT): Promise<CommandResult> => {
  try {
    const child = Bun.spawn(command, { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, output: `${stdout}${stderr}` };
  } catch (error) {
    return { exitCode: 1, output: String(error) };
  }
};

// --- services -------------------------------------------------------------------------------------

/** The services of stage C, or why there are none (the run goes on without stage C). */
const servicesOf = (): ServiceTargets | string => {
  try {
    return resolveServices((message) => {
      throw new Error(message);
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const admin = (services: ServiceTargets): postgres.Sql =>
  postgres(services.adminUrl.toString(), { max: 1, onnotice: () => undefined });

/** PostgreSQL and Redis answer, or the reason they do not. */
const unreachable = async (services: ServiceTargets): Promise<string | undefined> => {
  const sql = admin(services);
  try {
    await sql`select 1`;
  } catch (error) {
    return `PostgreSQL at ${services.adminUrl.host} unreachable (${String(error)})`;
  } finally {
    await sql.end();
  }
  const redis = new Redis({
    ...services.redis,
    password: services.redis.password || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    await redis.ping();
    return undefined;
  } catch (error) {
    return `Redis at ${services.redis.host}:${String(services.redis.port)} unreachable (${String(error)})`;
  } finally {
    redis.disconnect();
  }
};

/** Drops the databases earlier runs left (only those carrying this runner's comment). */
const dropLeftoverDatabases = async (services: ServiceTargets): Promise<string[]> => {
  const sql = admin(services);
  try {
    const rows = await sql<{ datname: string }[]>`
      select datname from pg_database
      where shobj_description(oid, 'pg_database') = ${DISPOSABLE_MARKER}`;
    for (const { datname } of rows) {
      await sql.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
    return rows.map(({ datname }) => `database ${datname}`);
  } finally {
    await sql.end();
  }
};

/** Work folders and databases of earlier runs (interrupted, failed, --keep): removed. */
const cleanLeftovers = async (services: ServiceTargets | string): Promise<string[]> => {
  const folders = existsSync(WORK_ROOT)
    ? readdirSync(WORK_ROOT)
        .filter((name) => WORK_PATTERN.test(name))
        .map((name) => join(WORK_ROOT, name))
    : [];
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
  const databases =
    typeof services === 'string' || (await unreachable(services)) !== undefined
      ? []
      : await dropLeftoverDatabases(services);
  return [...folders, ...databases];
};

// --- one combination ------------------------------------------------------------------------------

interface Run {
  args: AcceptanceArgs;
  commit: string;
  workdir: string;
  services: ServiceTargets | string;
  /** Asked once per run: the machine does not change between combinations. */
  databaseReason?: Promise<string | undefined>;
  dockerReason?: Promise<string | undefined>;
}

/**
 * The project's own env file (written by `bun run setup`) is read by every command; variables of
 * this repository's configuration are not inherited from this process — they would override that
 * file — and the services of the run are set explicitly.
 */
const CONFIG_KEYS = new Set(
  readFileSync(resolve(ROOT, '.env.example'), 'utf8')
    .split(/\r?\n/)
    .map((line) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line)?.at(1))
    .filter((name): name is string => name !== undefined),
);

const freePort = (): number => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port ?? 3000;
  void probe.stop(true);
  return port;
};

type Piped = Subprocess<'pipe', 'pipe', 'pipe'>;

interface ComboRuntime {
  ctx: AcceptanceContext;
  /** Points the log at the step at `index`; returns its file. */
  openLog: (index: number, stage: string) => string;
}

const contextFor = (run: Run, combo: Combo): ComboRuntime => {
  const comboDir = join(run.workdir, `combo-${String(combo.id)}`);
  const project = join(comboDir, 'project');
  const logs = join(comboDir, 'logs');
  mkdirSync(logs, { recursive: true });
  let logFile = join(logs, '00-start.log');
  const write = (text: string): void => {
    appendFileSync(logFile, text);
  };

  const services = typeof run.services === 'string' ? undefined : run.services;
  const databaseName = services
    ? `${databaseBaseOf(services.adminUrl)}_acceptance_c${String(combo.id)}`
    : '';
  const keyPrefix = `${PROJECT_NAME}:acceptance-c${String(combo.id)}`;
  const port = freePort();
  const extraEnv: Record<string, string> = {};
  let databaseCreated = false;
  let server: Piped | undefined;

  const env = (extra: Record<string, string> = {}): Record<string, string | undefined> => {
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !CONFIG_KEYS.has(name) && !/^(TEST|INT)_/.test(name),
      ),
    );
    const database = services === undefined ? undefined : new URL(services.adminUrl);
    if (database !== undefined) database.pathname = `/${databaseName}`;
    return {
      ...inherited,
      ...(database === undefined || services === undefined
        ? {}
        : {
            DATABASE_URL: database.toString(),
            REDIS_HOST: services.redis.host,
            REDIS_PORT: String(services.redis.port),
            REDIS_PASSWORD: services.redis.password,
            REDIS_DB: String(services.redis.db),
          }),
      REDIS_KEY_PREFIX: keyPrefix,
      PORT: String(port),
      ...extraEnv,
      ...extra,
    };
  };

  const spawn = (command: string[], extra: Record<string, string> = {}): Piped =>
    Bun.spawn(command, {
      cwd: project,
      env: env(extra),
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

  /** Collects a stream into the log (and `sink`) until it ends. */
  const drain = async (stream: ReadableStream<Uint8Array>, sink: (text: string) => void) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const text = decoder.decode(chunk);
      sink(text);
      write(plainText(text));
    }
  };

  const expectExit = (command: string[], exitCode: number, expect: RunOptions['expect']): void => {
    const failure = expect === 'failure';
    check(
      failure ? exitCode !== 0 : exitCode === 0,
      `\`${command.join(' ')}\` ${failure ? 'fails' : 'succeeds'}`,
      `exit ${String(exitCode)} (the log lines below)`,
    );
  };

  const runCommand = async (
    command: string[],
    options: RunOptions = {},
  ): Promise<CommandResult> => {
    write(`$ ${command.join(' ')}\n`);
    const child = spawn(command);
    if (options.stdin !== undefined) void child.stdin.write(options.stdin);
    void child.stdin.end();
    const timeout = { hit: false };
    const timer = setTimeout(() => {
      timeout.hit = true;
      child.kill();
    }, COMMAND_TIMEOUT_MS);
    let output = '';
    await Promise.all([
      drain(child.stdout, (text) => (output += text)),
      drain(child.stderr, (text) => (output += text)),
    ]);
    const exitCode = await child.exited;
    clearTimeout(timer);
    // A killed command exits like a failing one (143): say it hung, not that it failed.
    const limit = `${String(COMMAND_TIMEOUT_MS / 60_000)} min`;
    write(`\n[exit ${String(exitCode)}${timeout.hit ? `, killed after ${limit}` : ''}]\n\n`);
    check(
      !timeout.hit,
      `\`${command.join(' ')}\` finishes within ${limit}`,
      `timed out after ${limit}, killed (the log lines below show where it stopped)`,
    );
    expectExit(command, exitCode, options.expect);
    return { exitCode, output: plainText(output) };
  };

  /** The wizard through a pipe: wait for each question on its screen, then press the keys. */
  const converse = async (
    command: string[],
    turns: readonly Turn[],
    options: Pick<RunOptions, 'expect'> = {},
  ): Promise<CommandResult> => {
    write(`$ ${command.join(' ')}   (the wizard, answered by the runner)\n`);
    // The two switches that let a program answer the wizards of scaffold and setup.
    const child = spawn(command, { SCAFFOLD_WIZARD_STDIN: '1', SETUP_WIZARD_STDIN: '1' });
    let screen = '';
    const reading = Promise.all([
      drain(child.stdout, (text) => (screen += text)),
      drain(child.stderr, (text) => (screen += text)),
    ]);
    const press = (keys: string): void => {
      void child.stdin.write(keys);
      void child.stdin.flush();
    };
    const waitFor = async (found: () => boolean, what: string): Promise<void> => {
      const deadline = Date.now() + QUESTION_TIMEOUT_MS;
      while (!found()) {
        if (child.exitCode !== null || Date.now() > deadline) {
          throw new StepFailure(what, tailOf(plainText(screen), 15));
        }
        await Bun.sleep(50);
      }
    };
    try {
      let mark = 0;
      for (const turn of turns) {
        await waitFor(
          () => plainText(screen.slice(mark)).includes(turn.question),
          `the wizard asks "${turn.question}"`,
        );
        // Let the prompt finish drawing before the first key.
        await Bun.sleep(80);
        if ('select' in turn) {
          for (let moves = 0; ; moves += 1) {
            const active = activeOption(screen.slice(mark));
            if (active?.startsWith(turn.select) === true) break;
            check(
              moves < 30,
              `"${turn.select}" among the options of "${turn.question}"`,
              active ?? 'no option on the screen',
            );
            const before = screen.length;
            press(KEYS.down);
            await waitFor(() => screen.length > before, `the cursor moves on "${turn.question}"`);
            await Bun.sleep(30);
          }
          press(KEYS.enter);
        } else {
          press(keysOf(turn));
        }
        write(`\n[the runner answered: ${JSON.stringify(turn)}]\n`);
        mark = screen.length;
      }
      void child.stdin.end();
      const exitCode = await Promise.race([
        child.exited,
        Bun.sleep(QUESTION_TIMEOUT_MS * 4).then(() => -1),
      ]);
      await reading;
      write(`\n[exit ${String(exitCode)}]\n\n`);
      expectExit(command, exitCode, options.expect);
      return { exitCode, output: plainText(screen) };
    } finally {
      if (child.exitCode === null) child.kill();
    }
  };

  const stopServer = async (): Promise<void> => {
    if (server === undefined) return;
    const child = server;
    server = undefined;
    child.kill('SIGTERM');
    const stopped = await Promise.race([child.exited, Bun.sleep(5000).then(() => 'timeout')]);
    if (stopped === 'timeout') child.kill('SIGKILL');
  };

  const http = async (
    method: string,
    path: string,
    options: HttpOptions = {},
  ): Promise<HttpResult> => {
    const body =
      options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const response = await fetch(`http://localhost:${String(port)}${path}`, {
      method,
      headers: {
        // JSON also for body-less writes (refresh): the CSRF check only exempts application/json.
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
        ...options.headers,
      },
      body,
    });
    const text = await response.text();
    write(`${method} ${path} → ${String(response.status)} ${text.slice(0, 300)}\n`);
    try {
      return {
        status: response.status,
        json: JSON.parse(text) as HttpResult['json'],
        headers: response.headers,
      };
    } catch {
      return {
        status: response.status,
        json: { raw: text.slice(0, 300) },
        headers: response.headers,
      };
    }
  };

  const ctx: AcceptanceContext = {
    combo,
    state: new Map(),

    cloneRepository: async () => {
      const cloned = await quiet(['git', 'clone', '--quiet', ROOT, project]);
      write(`$ git clone ${ROOT} ${project}\n${cloned.output}\n`);
      check(cloned.exitCode === 0, `git clone into ${project}`, cloned.output);
      // A branch name the project's own gates accept (lint:branch), at the commit under test.
      const checkout = await quiet(
        ['git', 'checkout', '--quiet', '-B', 'test/acceptance', run.commit],
        project,
      );
      write(`$ git checkout -B test/acceptance ${run.commit}\n${checkout.output}\n`);
      check(checkout.exitCode === 0, `checkout ${run.commit}`, checkout.output);
    },

    run: runCommand,
    converse,
    http,

    databaseUnavailable: () => {
      run.databaseReason ??= (async () => {
        if (!run.args.db) return '--no-db';
        if (typeof run.services === 'string') return run.services;
        return unreachable(run.services);
      })();
      return run.databaseReason;
    },

    createDatabase: async () => {
      if (services === undefined)
        throw new StepFailure(
          'services for stage C',
          typeof run.services === 'string' ? run.services : 'none',
        );
      const sql = admin(services);
      try {
        const existing = await sql`select 1 from pg_database where datname = ${databaseName}`;
        check(
          existing.length === 0,
          `no database ${databaseName} yet`,
          `it exists and is not this runner's: drop it yourself (DROP DATABASE "${databaseName}")`,
        );
        await sql.unsafe(`CREATE DATABASE "${databaseName}"`);
        await sql.unsafe(`COMMENT ON DATABASE "${databaseName}" IS '${DISPOSABLE_MARKER}'`);
        databaseCreated = true;
        write(`database ${databaseName} created\n`);
      } finally {
        await sql.end();
      }
    },

    releaseDatabase: async () => {
      await stopServer();
      if (!databaseCreated || services === undefined) return;
      databaseCreated = false;
      const sql = admin(services);
      try {
        await sql.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await sql.end();
      }
      const deleted = await deleteRedisKeys(services.redis, keyPrefix).catch(() => 0);
      write(`database ${databaseName} dropped, ${String(deleted)} Redis key(s) deleted\n`);
    },

    startServer: async () => {
      await stopServer();
      const child = spawn(['bun', 'src/index.ts']);
      void child.stdin.end();
      void drain(child.stdout, () => undefined);
      void drain(child.stderr, () => undefined);
      server = child;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline && child.exitCode === null) {
        const ready = await fetch(`http://localhost:${String(port)}/api/health/readiness`).catch(
          () => undefined,
        );
        if (ready?.status === 200) return;
        await Bun.sleep(300);
      }
      throw new StepFailure(
        `the server on port ${String(port)} ready within 30 s`,
        child.exitCode === null ? 'not ready' : `exit ${String(child.exitCode)}`,
      );
    },

    setEnv: (name, value) => {
      extraEnv[name] = value;
    },

    exists: (path) => existsSync(join(project, path)),

    readFile: (path) => readFileSync(join(project, path), 'utf8'),

    fingerprint: async () => {
      const listed = await quiet(['git', 'ls-files', '-co', '--exclude-standard', '-z'], project);
      const hasher = new Bun.CryptoHasher('sha256');
      for (const path of listed.output.split('\0').filter(Boolean).sort()) {
        const file = join(project, path);
        hasher.update(
          `${path}\0${existsSync(file) ? Bun.hash(readFileSync(file)).toString() : '-'}\0`,
        );
      }
      return hasher.digest('hex');
    },

    dockerUnavailable: () => {
      run.dockerReason ??= quiet(['docker', 'info']).then((result) =>
        result.exitCode === 0 ? undefined : 'Docker is not running',
      );
      return run.dockerReason;
    },

    dockerBuild: async (target) => {
      const suffix = target === undefined ? '' : `-${target}`;
      const tag = `${PROJECT_NAME}-acceptance${suffix}:c${String(combo.id)}`;
      try {
        await runCommand([
          'docker',
          'build',
          ...(target === undefined ? [] : ['--target', target]),
          '-t',
          tag,
          '.',
        ]);
      } finally {
        await quiet(['docker', 'rmi', '-f', tag]);
      }
    },
  };

  return {
    ctx,
    openLog: (index, stage) => {
      logFile = join(logs, `${String(index + 1).padStart(2, '0')}-${stage}.log`);
      return logFile;
    },
  };
};

// --- the run --------------------------------------------------------------------------------------

/** `acceptance-20261024-1530` (UTC, so the name does not depend on the machine's zone). */
const workdirName = (now: Date): string =>
  `acceptance-${now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`;

/** Releases the database of the running combination (Ctrl+C). */
let releaseCurrent: (() => Promise<void>) | undefined;

/** Whether stages C and D can run on this machine, and with what (shown before the menu). */
const readinessOf = async (
  args: AcceptanceArgs,
  services: ServiceTargets | string,
): Promise<Record<'C' | 'D', StageReadiness>> => {
  const docker = (await quiet(['docker', 'info'])).exitCode === 0;
  const D: StageReadiness = docker
    ? { runs: 'Docker is running' }
    : { skipped: 'Docker is not running' };
  if (!args.db) return { C: { skipped: '--no-db' }, D };
  if (typeof services === 'string') return { C: { skipped: services }, D };
  const problem = await unreachable(services);
  if (problem !== undefined) return { C: { skipped: problem }, D };
  return {
    C: {
      runs: `PostgreSQL ${services.adminUrl.host} (${services.databaseSource}), Redis ${services.redis.host}:${String(services.redis.port)} (${services.redisSource})`,
    },
    D,
  };
};

/** `--combo` as given, or the menu in a terminal: readiness, combinations, the plan. */
const chooseCombos = async (
  args: AcceptanceArgs,
  services: ServiceTargets | string,
): Promise<Combo[]> => {
  if (args.combos !== undefined) {
    say(`\n${planText(args.combos, ACCEPTANCE_STEPS, args.ref)}\n`);
    return args.combos;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Without a terminal choose the combinations with --combo (1, 2 or a).');
  }
  terminalPrompter.intro('bun run acceptance');
  const probe = terminalPrompter.spinner();
  probe.start('Checking PostgreSQL, Redis and Docker');
  const readiness = await readinessOf(args, services);
  probe.stop('Checked PostgreSQL, Redis and Docker');
  const combos = await askCombos(terminalPrompter, ACCEPTANCE_STEPS, readiness);
  terminalPrompter.note(planText(combos, ACCEPTANCE_STEPS, args.ref), 'Plan');
  return combos;
};

const main = async (): Promise<void> => {
  exitOnHelp(process.argv.slice(2), ACCEPTANCE_USAGE);
  const args = parseAcceptanceArgs(process.argv.slice(2));
  const services = servicesOf();

  if (args.clean) {
    const removed = await cleanLeftovers(services);
    say(
      removed.length > 0
        ? `Removed:\n${removed.map((item) => `  ${item}`).join('\n')}`
        : 'Nothing left by earlier runs.',
    );
    return;
  }

  const asking = args.combos === undefined;
  const combos = await chooseCombos(args, services);
  if (args.plan) {
    if (asking) terminalPrompter.outro('--plan: nothing was run');
    return;
  }

  const commit = (
    await quiet(['git', 'rev-parse', '--verify', `${args.ref}^{commit}`])
  ).output.trim();
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error(`--ref ${args.ref}: not a commit or tag here`);
  if ((await quiet(['git', 'status', '--porcelain'])).output.trim() !== '') {
    say(
      `Note: uncommitted changes are not part of the run (it tests ${args.ref} = ${commit.slice(0, 7)}).`,
    );
  }
  if (!asking) {
    say(
      typeof services === 'string'
        ? `Stage C: ${args.db ? `skipped — ${services}` : 'skipped (--no-db)'}`
        : `Stage C services: PostgreSQL ${services.adminUrl.host} (${services.databaseSource}), Redis ${services.redis.host}:${String(services.redis.port)} (${services.redisSource})`,
    );
  } else if (!(await terminalPrompter.confirm('Start the run?'))) {
    terminalPrompter.outro('Cancelled: nothing was run');
    return;
  }
  const leftovers = await cleanLeftovers(services);
  if (leftovers.length > 0) {
    say(`Removed what earlier runs left:\n${leftovers.map((item) => `  ${item}`).join('\n')}`);
  }

  const workdir = join(WORK_ROOT, workdirName(new Date()));
  mkdirSync(workdir, { recursive: true });
  say(`Work folder: ${workdir}`);
  const run: Run = { args, commit, workdir, services };
  const reporter = new ProgressReporter({
    write: (text) => {
      process.stdout.write(text);
    },
    isTTY: process.stdout.isTTY,
  });

  const results: ComboResult[] = [];
  for (const combo of combos) {
    const { ctx, openLog } = contextFor(run, combo);
    releaseCurrent = () => ctx.releaseDatabase();
    results.push(
      await runCombo(ACCEPTANCE_STEPS, ctx, reporter, {
        open: (index, step) => openLog(index, step.stage),
        tail: (file) => (existsSync(file) ? tailOf(readFileSync(file, 'utf8')) : ''),
      }),
    );
    releaseCurrent = undefined;
  }

  const stages = [...new Set(ACCEPTANCE_STEPS.map((step) => step.stage))];
  say(`\n${summaryTable(results, stages)}`);
  const failed = results.filter((result) => result.failedStep !== undefined);
  if (failed.length === 0 && !args.keep) {
    rmSync(workdir, { recursive: true, force: true, maxRetries: 5 });
    say('\nAll passed. Work folder removed.');
    return;
  }
  for (const result of failed) {
    say(
      `\nFailed: combination ${result.label} at "${result.failedStep ?? ''}" — log: ${result.logFile ?? ''}`,
    );
  }
  say(`\nWork folder kept: ${workdir} (bun run acceptance --clean removes it)`);
  if (failed.length > 0) process.exitCode = 1;
};

process.once('SIGINT', () => {
  say('\nInterrupted: stopping the server and dropping the database of the running combination...');
  void (releaseCurrent?.() ?? Promise.resolve())
    .catch((error: unknown) => {
      say(`Cleanup failed (${String(error)}); run bun run acceptance --clean.`);
    })
    .finally(() => {
      say('Work folder kept (bun run acceptance --clean removes it).');
      process.exit(130);
    });
});

try {
  await main();
} catch (error) {
  process.stderr.write(`[acceptance] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
