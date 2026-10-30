import { describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import {
  ACCEPTANCE_STEPS,
  activeOption,
  ADMIN_EMAIL,
  askCombos,
  COMBOS,
  keysOf,
  KEYS,
  parseAcceptanceArgs,
  parseCombos,
  plainText,
  planText,
  PROJECT_TITLE,
  readinessText,
  runCombo,
  StepFailure,
  type AcceptanceContext,
  type AcceptanceStep,
  interruptRun,
  WIZARD_ENV,
  type Combo,
  type HttpResult,
  type Turn,
} from './acceptance';
import type { ComboResult, StepLabel } from './acceptance-progress';
import { projectChangelog } from './project-changelog';
import { ENTER, scriptedPrompter } from './scripted-prompter';

const [NEW_PROJECT, KEEP_EXAMPLES, NO_PARTNER] = COMBOS as [Combo, Combo, Combo];

describe('arguments', () => {
  it('defaults: menu, HEAD, stage C on', () => {
    expect(parseAcceptanceArgs([])).toEqual({
      ref: 'HEAD',
      db: true,
      keep: false,
      plan: false,
      clean: false,
    });
  });

  it('reads every option', () => {
    expect(
      parseAcceptanceArgs(['--combo', '2,1', '--ref', 'v1.0.0', '--no-db', '--keep', '--plan']),
    ).toEqual({
      combos: [KEEP_EXAMPLES, NEW_PROJECT],
      ref: 'v1.0.0',
      db: false,
      keep: true,
      plan: true,
      clean: false,
    });
    expect(parseAcceptanceArgs(['--clean']).clean).toBe(true);
  });

  it('rejects an unknown argument, a missing value and an unknown combination', () => {
    expect(() => parseAcceptanceArgs(['--fast'])).toThrow('unknown argument --fast');
    expect(() => parseAcceptanceArgs(['--ref'])).toThrow('--ref needs a value');
    expect(() => parseAcceptanceArgs(['--combo', '--keep'])).toThrow('--combo needs a value');
    expect(() => parseCombos('4')).toThrow('choose 1, 2, 3 or a');
    expect(() => parseCombos(' ')).toThrow('unknown combination');
  });

  it('a = every combination, duplicates once', () => {
    expect(parseCombos('a')).toEqual([...COMBOS]);
    expect(parseCombos('1, 1')).toEqual([NEW_PROJECT]);
  });
});

describe('menu and plan', () => {
  it('the menu explains the stages, what this machine runs, and offers every combination ticked', async () => {
    const session = scriptedPrompter(['3', '1']);
    const combos = await askCombos(session.prompter, ACCEPTANCE_STEPS, {
      C: { runs: 'PostgreSQL localhost:5432 (DATABASE_URL)' },
      D: { skipped: 'Docker is not running' },
    });
    expect(combos).toEqual([NO_PARTNER, NEW_PROJECT]);
    expect(session.shown.at(0)).toContain('B  generators: 8 variants (3 through the wizard');
    expect(session.shown.at(1)).toBe(
      'note: This machine: C  PostgreSQL localhost:5432 (DATABASE_URL)\nD  skipped: Docker is not running',
    );
    expect(session.offered).toEqual([['1', '2', '3']]);
    // Enter keeps the first ticks: every combination, as a release needs.
    expect(await askCombos(scriptedPrompter(ENTER).prompter, ACCEPTANCE_STEPS, {})).toEqual([
      ...COMBOS,
    ]);
  });

  it('readiness lists only the stages it was given', () => {
    expect(readinessText({ D: { runs: 'Docker is running' } })).toBe('D  Docker is running');
  });

  it('the plan numbers every step per combination and sums the estimate', () => {
    const plan = planText([NEW_PROJECT, KEEP_EXAMPLES], ACCEPTANCE_STEPS, 'HEAD');
    const total = ACCEPTANCE_STEPS.length;
    expect(plan).toContain(`  [ 1/${String(total)}] A  Clone the commit under test`);
    expect(plan).toContain('Combination 2 — setup --keep-examples');
    expect(plan).toMatch(/Estimated total: ~\d+m$/);
  });
});

describe('Ctrl+C during a run', () => {
  const interrupt = async (release: (() => Promise<void>) | undefined) => {
    const lines: string[] = [];
    const codes: number[] = [];
    await interruptRun({
      release,
      say: (text) => lines.push(text),
      exit: (code) => codes.push(code),
    });
    return { lines, codes };
  };

  it('releases the running combination, keeps the work folder and exits 130', async () => {
    let released = 0;
    const { lines, codes } = await interrupt(async () => {
      released += 1;
    });
    expect(released).toBe(1);
    expect(lines.at(0)).toContain('Interrupted');
    expect(lines.at(-1)).toContain('Work folder kept');
    expect(lines.some((line) => line.includes('Cleanup failed'))).toBe(false);
    expect(codes).toEqual([130]);
  });

  it('says when the cleanup fails and still exits 130', async () => {
    const { lines, codes } = await interrupt(() => Promise.reject(new Error('database busy')));
    expect(lines).toContain(
      'Cleanup failed (Error: database busy); run bun run acceptance --clean.',
    );
    expect(lines.at(-1)).toContain('Work folder kept');
    expect(codes).toEqual([130]);
  });

  it('exits 130 when no combination is running', async () => {
    const { lines, codes } = await interrupt(undefined);
    expect(lines).toHaveLength(2);
    expect(codes).toEqual([130]);
  });
});

describe('the wizard driver', () => {
  const ESC = String.fromCharCode(27);

  it('reads the screen without colours and finds the option under the cursor', () => {
    const screen = `${ESC}[36m◆${ESC}[39m  What do you want to scaffold?\n│  ○ Module — standalone\n│  ${ESC}[32m●${ESC}[39m Module — header + detail ${ESC}[2m(a document)${ESC}[22m\n`;
    expect(plainText(screen)).not.toContain(ESC);
    expect(activeOption(screen)).toBe('Module — header + detail (a document)');
    expect(activeOption('nothing selectable')).toBeUndefined();
  });

  it('finds the cursor in the real wizard, whatever terminal started the run', async () => {
    // The variables clack reads on Windows to choose Unicode over its ASCII fallback (`>`).
    const terminal = ['CI', 'WT_SESSION', 'TERMINUS_SUBLIME', 'ConEmuTask', 'TERM_PROGRAM'];
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !terminal.includes(name) && name !== 'TERM'),
    );
    const child = Bun.spawn(['bun', 'scripts/scaffold.ts'], {
      env: { ...inherited, ...WIZARD_ENV },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    // No cursor found within 10 s: stop the wizard, so the stream ends and the screen is shown.
    const deadline = setTimeout(() => {
      child.kill();
    }, 10_000);
    let screen = '';
    try {
      const decoder = new TextDecoder();
      for await (const chunk of child.stdout) {
        screen += decoder.decode(chunk);
        if (activeOption(screen) !== undefined) break;
      }
    } finally {
      clearTimeout(deadline);
      child.kill();
    }
    expect({ active: activeOption(screen), screen: plainText(screen) }).toMatchObject({
      active: expect.stringMatching(/^Module — standalone/),
    });
  }, 20_000);

  it('turns an answer into keys', () => {
    const keys = (turn: Turn): string => keysOf(turn);
    expect(keys({ question: 'q', text: 'products' })).toBe(`${KEYS.clear}products${KEYS.enter}`);
    expect(keys({ question: 'q', confirm: true })).toBe(`y${KEYS.enter}`);
    expect(keys({ question: 'q', confirm: false })).toBe(`n${KEYS.enter}`);
    expect(keys({ question: 'q', cancel: true })).toBe(KEYS.ctrlC);
    expect(keys({ question: 'q', enter: true })).toBe(KEYS.enter);
  });
});

const COMMAND_OUTPUT = [
  'Project initialization completed',
  `Created admin ${ADMIN_EMAIL} (id 1)`,
  'the module name "products" is already used',
  'two levels at most',
  '[dry run] Scaffolding',
  'Usage: bun run scaffold',
  'unknown kind "partner"',
].join('\n');

const reply = (
  status: number,
  data: Record<string, unknown> = {},
  headers?: HeadersInit,
): HttpResult => ({
  status,
  json: { success: status < 400, status_code: status, data },
  headers: new Headers(headers),
});

interface FakeMachine {
  ctx: AcceptanceContext;
  /** Commands run, in order; wizard sessions as `wizard: <command>`. */
  commands: string[];
  /** The answers given to each wizard session. */
  conversations: Turn[][];
  released: () => number;
}

/**
 * A well-behaved machine and API: every command succeeds or fails as asked, each request gets what
 * the real server answers to it (no token → 401, an empty body → 400, a partner reference twice →
 * 409, a webhook signed with the secret the step configured → 2xx). Running the real steps against
 * it proves their order, the paths and bodies they send, and the answers they give the wizard.
 */
const fakeMachine = (combo: Combo, overrides: Partial<AcceptanceContext> = {}): FakeMachine => {
  const commands: string[] = [];
  const conversations: Turn[][] = [];
  const env = new Map<string, string>();
  const references = new Set<string>();
  const events = new Set<string>();
  const files = new Set<string>([
    ...(combo.keepExamples ? ['src/modules/orders', 'src/modules/user-posts'] : []),
    ...(combo.partner ? ['src/modules/partner-gateway'] : []),
  ]);
  let nextId = 0;
  let released = 0;

  const webhook = (body: string, headers: Record<string, string>): HttpResult => {
    const timestamp = headers['x-globex-timestamp'] ?? '';
    const secret = env.get('GLOBEX_WEBHOOK_SECRET') ?? '';
    const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    if (headers['x-globex-signature'] !== `v1=${digest}`) return reply(401);
    const { id } = JSON.parse(body) as { id: string };
    const duplicate = events.has(id);
    events.add(id);
    return reply(200, { received: true, duplicate });
  };

  const partner = (method: string, body: string, headers: Record<string, string>): HttpResult => {
    if (!Object.keys(headers).some((name) => name.startsWith('x-partner-'))) return reply(401);
    if (method === 'GET') return reply(200);
    const { partner_reference: reference } = JSON.parse(body) as { partner_reference: string };
    const seen = references.has(reference);
    references.add(reference);
    return reply(seen ? 409 : 201, { id: 'p1' });
  };

  const answer = (
    method: string,
    path: string,
    options: Parameters<AcceptanceContext['http']>[2] = {},
  ): HttpResult => {
    const body = options.raw ?? (options.body === undefined ? '' : JSON.stringify(options.body));
    const headers = options.headers ?? {};
    if (path === '/api/health') return reply(200);
    if (path === '/api/v1/auth/login') {
      return reply(200, { access_token: 'a1' }, { 'set-cookie': 'refresh_token=r1; HttpOnly' });
    }
    if (path === '/api/v1/auth/refresh') {
      return reply(headers.cookie === 'refresh_token=r1' ? 200 : 401, { access_token: 'a2' });
    }
    if (path === '/api/webhooks/globex') return webhook(body, headers);
    if (path.startsWith('/api/v1/partner/')) return partner(method, body, headers);
    if (options.token === undefined) return reply(401);
    if (body === '{}' || path.includes('per_page=1000')) return reply(400);
    if (method !== 'POST') return reply(200);
    nextId += 1;
    return reply(201, { id: `id-${String(nextId)}`, api_key: 'pk', secret: 's' });
  };

  /** What the wizard writes for the answers the steps give (checked by expectFiles). */
  const WIZARD_FILES: Record<string, string[]> = {
    products: ['src/modules/products/products.routes.ts'],
    reviews: ['src/modules/products/product-reviews/product-reviews.routes.ts'],
    'refund-notifications': [
      'src/integrations/globex/globex.webhook.ts',
      'src/modules/refund-notifications',
    ],
  };

  const ctx: AcceptanceContext = {
    combo,
    state: new Map(),
    cloneRepository: () => Promise.resolve(),
    run: (command, options = {}) => {
      commands.push(command.join(' '));
      // Like a real project of this combination: the partner commands only with the gateway.
      const help = command.join(' ') === 'bun run help';
      return Promise.resolve({
        exitCode: options.expect === 'failure' ? 1 : 0,
        output: help
          ? combo.partner
            ? 'partner:sign  Sign a partner request'
            : 'dev'
          : COMMAND_OUTPUT,
      });
    },
    converse: (command, turns, options = {}) => {
      commands.push(`wizard: ${command.join(' ')}`);
      conversations.push([...turns]);
      const typed = turns.flatMap((turn) => ('text' in turn ? [turn.text] : []));
      const confirmed = turns.some((turn) => 'confirm' in turn && turn.confirm);
      if (confirmed)
        for (const name of typed) for (const file of WIZARD_FILES[name] ?? []) files.add(file);
      return Promise.resolve({
        exitCode: options.expect === 'failure' ? 1 : 0,
        output: COMMAND_OUTPUT,
      });
    },
    http: (method, path, options) => Promise.resolve(answer(method, path, options)),
    databaseUnavailable: () => Promise.resolve(undefined),
    createDatabase: () => Promise.resolve(),
    releaseDatabase: () => {
      released += 1;
      return Promise.resolve();
    },
    startServer: () => Promise.resolve(),
    setEnv: (name, value) => {
      env.set(name, value);
    },
    exists: (path) => files.has(path),
    readFile: (path) =>
      ({ 'README.md': `# ${PROJECT_TITLE}\n`, 'CHANGELOG.md': projectChangelog('1.0.0') })[path] ??
      '',
    fingerprint: () => Promise.resolve('unchanged'),
    dockerUnavailable: () => Promise.resolve(undefined),
    dockerBuild: (target) => {
      commands.push(`docker build ${target ?? 'runner'}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { ctx, commands, conversations, released: () => released };
};

const silentReporter = (): {
  reporter: Parameters<typeof runCombo>[2];
  lines: string[];
} => {
  const lines: string[] = [];
  return {
    lines,
    reporter: {
      begin: () => undefined,
      end: () => 1000,
      skipped: (step: StepLabel, reason: string) => {
        lines.push(`skipped ${step.title}: ${reason}`);
      },
      line: (text: string) => {
        lines.push(text);
      },
    },
  };
};

const runAll = async (
  machine: FakeMachine,
  steps: readonly AcceptanceStep[] = ACCEPTANCE_STEPS,
): Promise<{ result: ComboResult; lines: string[] }> => {
  const { reporter, lines } = silentReporter();
  const result = await runCombo(steps, machine.ctx, reporter, {
    open: (index) => `log-${String(index + 1)}`,
    tail: (file) => `    │ last lines of ${file}`,
  });
  return { result, lines };
};

describe('the steps against a well-behaved machine', () => {
  it('a new project: every stage passes, the wizard is answered three times plus No and Ctrl+C', async () => {
    const machine = fakeMachine(NEW_PROJECT);
    const { result } = await runAll(machine);
    expect(result.failedStep).toBeUndefined();
    expect(
      Object.fromEntries(Object.entries(result.stages).map(([s, r]) => [s, r?.status])),
    ).toEqual({
      A: 'ok',
      B: 'ok',
      C: 'ok',
      D: 'ok',
    });
    expect(machine.commands.filter((c) => c.startsWith('wizard:'))).toEqual([
      'wizard: bun run setup',
      'wizard: bun run scaffold',
      'wizard: bun run scaffold:module',
      'wizard: bun run scaffold:webhook',
      'wizard: bun run scaffold:module',
      'wizard: bun run scaffold',
    ]);
    expect(machine.conversations.at(0)).toEqual([
      { question: 'Project name', text: 'acceptance-demo' },
      { question: 'Title (README heading', text: PROJECT_TITLE },
      { question: 'Description', enter: true },
      { question: 'Keep the example modules', confirm: false },
      { question: 'Accept calls from partner systems', confirm: true },
      { question: 'Apply these changes?', confirm: true },
    ]);
    expect(machine.conversations.at(2)).toEqual([
      { question: 'What do you want to scaffold?', select: 'Module — dependent 1:N' },
      { question: 'Parent module', select: 'products' },
      { question: 'Child (1:N) name', text: 'reviews' },
      { question: 'Singular of "reviews"', enter: true },
      { question: 'Write these files?', confirm: true },
    ]);
    expect(machine.conversations.at(-1)).toEqual([
      { question: 'What do you want to scaffold?', cancel: true },
    ]);
    expect(machine.commands).toContain(
      'bun scripts/scaffold.ts module specs --parent=products --one',
    );
    expect(machine.commands).toContain('bun run scaffold:integration acme-mail');
    expect(machine.commands).toContain('docker build tools');
    // Once as the last step of stage C, once more after the combination (no-op by then).
    expect(machine.released()).toBe(2);
  });

  it('--keep-examples: setup keeps them and their routes answer', async () => {
    const machine = fakeMachine(KEEP_EXAMPLES);
    const { result } = await runAll(machine);
    expect(result.failedStep).toBeUndefined();
    expect(machine.commands).toContain(
      `bun run setup acceptance-demo --title=${PROJECT_TITLE} --keep-examples`,
    );
  });

  it('--no-partner: the wizard removes the gateway, scaffold partner is refused', async () => {
    const machine = fakeMachine(NO_PARTNER);
    const { result } = await runAll(machine);
    expect(result.failedStep).toBeUndefined();
    expect(machine.conversations.at(0)).toContainEqual({
      question: 'Remove the partner gateway',
      confirm: true,
    });
    expect(machine.commands).toContain('bun scripts/scaffold.ts partner shipments');
  });

  it('setup that leaves the examples of a new project fails the step', async () => {
    const machine = fakeMachine(NEW_PROJECT, { exists: (path) => path === 'src/modules/orders' });
    const { result } = await runAll(machine);
    expect(result.failedStep).toBe(
      'bun run setup: the wizard (combinations 1, 3) or flags (combination 2)',
    );
  });

  it("setup that keeps the boilerplate's CHANGELOG.md fails the step", async () => {
    const machine = fakeMachine(NEW_PROJECT, {
      readFile: (path) =>
        path === 'CHANGELOG.md'
          ? '# Changelog\n\n## [1.0.0] - 2026-10-30\n'
          : `# ${PROJECT_TITLE}\n`,
    });
    const { result, lines } = await runAll(machine);
    expect(result.failedStep).toBe(
      'bun run setup: the wizard (combinations 1, 3) or flags (combination 2)',
    );
    expect(lines.join('\n')).toContain('## [1.0.0] - 2026-10-30');
  });

  it('skips stage C and D with the reason, and still releases the database', async () => {
    const machine = fakeMachine(NEW_PROJECT, {
      databaseUnavailable: () => Promise.resolve('--no-db'),
      dockerUnavailable: () => Promise.resolve('Docker is not running'),
    });
    const { result, lines } = await runAll(machine);
    expect(result.failedStep).toBeUndefined();
    expect(result.stages.C).toEqual({ status: 'skipped', ms: 0 });
    expect(result.stages.D).toEqual({ status: 'skipped', ms: 0 });
    expect(lines).toContain('skipped Database: create, db:migrate, seed:admin: --no-db');
    expect(lines).toContain('skipped Docker: the tools image: Docker is not running');
    expect(machine.released()).toBe(1);
  });

  it('stops at the first answer that disagrees, shows expected / actual and the log, skips the rest', async () => {
    const machine = fakeMachine(NEW_PROJECT);
    const http = machine.ctx.http;
    machine.ctx.http = (method, path, options) =>
      method === 'POST' && path === '/api/v1/products' && options?.token !== undefined
        ? Promise.resolve(reply(500))
        : http(method, path, options);
    const { result, lines } = await runAll(machine);
    expect(result.failedStep).toBe('HTTP: products, invoices with lines, audit entries');
    expect(result.stages.C?.status).toBe('failed');
    expect(result.stages.D).toBeUndefined();
    const failure = lines.find((line) => line.includes('expected:')) ?? '';
    expect(failure).toContain('expected: create a product → 201');
    expect(failure).toContain('actual:   500');
    expect(failure).toContain('full log: log-');
    expect(lines.filter((line) => line.includes('an earlier step failed'))).toHaveLength(
      ACCEPTANCE_STEPS.findIndex((s) => s.stage === 'D') +
        2 -
        ACCEPTANCE_STEPS.findIndex((s) => s.title.startsWith('HTTP: products')) -
        1,
    );
    expect(machine.released()).toBe(1);
  });

  it('a project without the gateway whose bun run help still lists partner:sign fails setup', async () => {
    // Every command succeeds; only the help still names the removed command.
    const machine = fakeMachine(NO_PARTNER, {
      run: (command) =>
        Promise.resolve({
          exitCode: 0,
          output:
            command.join(' ') === 'bun run help'
              ? 'partner:sign  Sign a partner request'
              : COMMAND_OUTPUT,
        }),
    });
    const { result, lines } = await runAll(machine);
    expect(result.failedStep).toStartWith('bun run setup');
    expect(lines.join('\n')).toContain('bun run help does not list partner:sign');
  });

  it('the wizard that wrote other files fails its step', async () => {
    const machine = fakeMachine(NEW_PROJECT, {
      converse: (command) =>
        Promise.resolve({ exitCode: 0, output: command.includes('setup') ? COMMAND_OUTPUT : '' }),
    });
    const { result, lines } = await runAll(machine);
    expect(result.failedStep).toBe('Wizard (bun run scaffold): standalone module products');
    expect(lines.join('\n')).toContain('missing src/modules/products/products.routes.ts');
  });

  it('answering No that changed a file fails the cancel step', async () => {
    let calls = 0;
    const machine = fakeMachine(NEW_PROJECT, {
      fingerprint: () => Promise.resolve((calls += 1) === 2 ? 'changed' : 'same'),
    });
    const { result } = await runAll(machine);
    expect(result.failedStep).toBe('Wizard: answering No, then Ctrl+C, writes nothing');
  });

  it('an error that is not a StepFailure is shown with its message', async () => {
    const machine = fakeMachine(NEW_PROJECT, {
      cloneRepository: () => Promise.reject(new Error('disk full')),
    });
    const { result, lines } = await runAll(machine);
    expect(result.failedStep).toBe('Clone the commit under test into the work folder');
    expect(lines.join('\n')).toContain('disk full');
  });

  it('StepFailure says what was expected and what happened', () => {
    expect(new StepFailure('201', '500').message).toBe('expected 201, got 500');
  });
});
