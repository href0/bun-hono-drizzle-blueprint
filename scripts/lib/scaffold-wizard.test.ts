import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import {
  parseScaffoldArgs,
  planScaffold,
  readScaffoldArgs,
  ScaffoldError,
  USAGE,
  type ScaffoldRequest,
} from './scaffold';
import {
  commandOf,
  completeRequest,
  needsWizard,
  SHAPES,
  toArgv,
  type WizardContext,
} from './scaffold-wizard';
import { CancelledError } from './prompter';
import { CANCEL, ENTER, scriptedPrompter as scripted, type Answer } from './scripted-prompter';

const ROOT = resolve(import.meta.dir, '../..');

const CONTEXT: WizardContext = {
  modules: ['users', 'orders', 'projects', 'project-tasks', 'order-documents'],
  vendors: ['acme-pay'],
  parents: ['orders', 'projects', 'users'],
};

const complete = (draft: Partial<ScaffoldRequest>, ...answers: Answer[]) => {
  const session = scripted(...answers);
  return completeRequest(draft, CONTEXT, session.prompter).then((request) => ({
    request,
    ...session,
  }));
};

/** Splits a printed command like a POSIX shell would for these arguments (double quotes only). */
const shellWords = (command: string): string[] =>
  [...command.matchAll(/(?:[^\s"]+|"(?:\\.|[^"\\])*")+/g)].map((match) =>
    match[0].replace(/"((?:\\.|[^"\\])*)"/g, (_quoted, inner: string) =>
      inner.replace(/\\(.)/g, '$1'),
    ),
  );

/** The files the printed command would write — the proof that the wizard adds no logic of its own. */
const filesOfCommand = (request: ScaffoldRequest) => {
  const words = shellWords(commandOf(request));
  expect(words.slice(0, 3)).toEqual(['bun', 'run', 'scaffold']);
  return planScaffold(parseScaffoldArgs(words.slice(3)).request, ROOT).files;
};

describe('scaffold wizard: one path per shape', () => {
  it('offers every shape', () => {
    expect(SHAPES.map((shape) => shape.value)).toEqual([
      'standalone',
      'header-detail',
      'record',
      'dependent',
      'dependent-one',
      // partner:start
      'partner',
      // partner:end
      'webhook',
      'integration',
    ]);
  });

  const cases: [string, Answer[], ScaffoldRequest, string][] = [
    [
      'standalone',
      ['standalone', 'products', ENTER],
      { kind: 'module', name: 'products', singular: undefined, variant: undefined },
      'bun run scaffold module products',
    ],
    [
      'header-detail with the default detail',
      ['header-detail', 'invoices', ENTER, ENTER, ENTER],
      {
        kind: 'module',
        name: 'invoices',
        singular: undefined,
        variant: 'header-detail',
        detail: undefined,
        detailSingular: undefined,
      },
      'bun run scaffold module invoices --variant=header-detail',
    ],
    [
      'header-detail with its own detail',
      ['header-detail', 'teams', ENTER, 'members', ENTER],
      {
        kind: 'module',
        name: 'teams',
        singular: undefined,
        variant: 'header-detail',
        detail: 'members',
        detailSingular: undefined,
      },
      'bun run scaffold module teams --variant=header-detail --detail=members',
    ],
    [
      'record',
      ['record', 'audit-entries', ENTER],
      { kind: 'module', name: 'audit-entries', singular: undefined, variant: 'record' },
      'bun run scaffold module audit-entries --variant=record',
    ],
    [
      'dependent 1:N',
      ['dependent', 'orders', 'shipments', ENTER],
      {
        kind: 'module',
        name: 'shipments',
        singular: undefined,
        parent: 'orders',
        parentSingular: undefined,
        one: undefined,
      },
      'bun run scaffold module shipments --parent=orders',
    ],
    [
      'dependent 1:1',
      ['dependent-one', 'projects', 'charters', ENTER],
      {
        kind: 'module',
        name: 'charters',
        singular: undefined,
        parent: 'projects',
        parentSingular: undefined,
        one: true,
      },
      'bun run scaffold module charters --parent=projects --one',
    ],
    // partner:start
    [
      'partner',
      ['partner', 'shipments', ENTER],
      { kind: 'partner', name: 'shipments', singular: undefined, variant: undefined },
      'bun run scaffold partner shipments',
    ],
    // partner:end
    [
      'webhook',
      ['webhook', 'refund-notifications', ENTER, 'globex', 'Globex Payments'],
      {
        kind: 'webhook',
        name: 'refund-notifications',
        singular: undefined,
        variant: undefined,
        vendor: 'globex',
        institution: 'Globex Payments',
      },
      'bun run scaffold webhook refund-notifications --vendor=globex --institution="Globex Payments"',
    ],
    [
      'integration',
      ['integration', 'globex', ENTER],
      { kind: 'integration', name: 'globex', institution: undefined },
      'bun run scaffold integration globex',
    ],
  ];

  for (const [label, answers, expected, command] of cases) {
    it(`${label}: asks, then prints the command that writes the same files`, async () => {
      const { request, left, placeholders } = await complete({}, ...answers);
      expect(request).toEqual(expected);
      expect(left).toEqual([]);
      // Drawn like typed text with the cursor on it: a bare example is taken for an answer.
      expect(placeholders.filter((text) => !text.startsWith('e.g. '))).toEqual([]);
      expect(commandOf(request)).toBe(command);
      expect(parseScaffoldArgs(toArgv(request)).request).toEqual(request);
      expect(filesOfCommand(request)).toEqual(planScaffold(request, ROOT).files);
    });
  }
});

describe('scaffold wizard: only what is missing', () => {
  it('scaffold:module offers the module shapes only', async () => {
    const { offered } = await complete({ kind: 'module' }, 'standalone', 'products', ENTER);
    expect(offered[0]).toEqual([
      'standalone',
      'header-detail',
      'record',
      'dependent',
      'dependent-one',
    ]);
  });

  it('a kind given on the command line (scaffold:webhook, …) skips the menu', async () => {
    // partner:start
    expect((await complete({ kind: 'partner' }, 'shipments', ENTER)).offered).toEqual([]);
    // partner:end
    expect((await complete({ kind: 'integration' }, 'globex', ENTER)).offered).toEqual([]);
    const webhook = await complete({ kind: 'webhook' }, 'payouts', ENTER, 'globex', ENTER);
    expect(webhook.offered).toEqual([]);
    expect(webhook.request.vendor).toBe('globex');
  });

  it('a webhook with its name asks only for the vendor and the institution', async () => {
    const { request, asked } = await complete(
      { kind: 'webhook', name: 'payouts', singular: 'payout' },
      'globex',
      ENTER,
    );
    expect(asked).toHaveLength(2);
    expect(request).toMatchObject({ name: 'payouts', singular: 'payout', vendor: 'globex' });
    expect(request.institution).toBeUndefined();
  });

  it('a parent given on the command line is not asked again', async () => {
    const { request, asked } = await complete(
      { kind: 'module', parent: 'orders', one: true },
      'notes',
      ENTER,
    );
    expect(asked).toEqual([
      'Section (1:1) name, plural — created as order-<name>',
      'Singular of "notes"',
    ]);
    expect(request).toMatchObject({ name: 'notes', parent: 'orders', one: true });
  });

  it('a corrected singular is kept and printed', async () => {
    const { request } = await complete({}, 'standalone', 'news', 'news-item');
    expect(request.singular).toBe('news-item');
    expect(commandOf(request)).toBe('bun run scaffold module news --singular=news-item');
  });

  it('a name that does not look plural: use the suggestion, or keep it with a typed singular', async () => {
    const renamed = await complete({}, 'standalone', 'product', 'rename', ENTER);
    expect(renamed.request).toMatchObject({ name: 'products', singular: undefined });
    const kept = await complete({}, 'standalone', 'people', 'keep', 'person');
    expect(kept.request).toMatchObject({ name: 'people', singular: 'person' });
    expect(commandOf(kept.request)).toBe('bun run scaffold module people --singular=person');
  });

  it('an irregular parent plural asks for the parent singular', async () => {
    const session = scripted('dependent', 'people', 'person', 'notes', ENTER);
    const dependent = await completeRequest(
      {},
      { ...CONTEXT, parents: ['people'] },
      session.prompter,
    );
    expect(session.asked[2]).toBe('Singular of the parent "people"');
    expect(session.asked[3]).toBe('Child (1:N) name, plural — created as person-<name>');
    expect(dependent).toMatchObject({ parent: 'people', parentSingular: 'person', name: 'notes' });
    expect(commandOf(dependent)).toBe(
      'bun run scaffold module notes --parent=people --parent-singular=person',
    );
  });
});

describe('scaffold wizard: answers are checked before anything is planned', () => {
  it('rejects names that are not kebab-case, taken by a module, or a vendor', async () => {
    const { request, rejected } = await complete(
      {},
      'standalone',
      'Products',
      'orders',
      'acme-pay',
      'products',
      ENTER,
    );
    expect(request.name).toBe('products');
    expect(rejected).toHaveLength(3);
    expect(rejected[0]).toContain('kebab-case');
    expect(rejected[1]).toContain('"orders" is already used');
    expect(rejected[2]).toContain('is a vendor in src/integrations/');
  });

  it('rejects a dependent whose prefixed name is taken', async () => {
    const { rejected, request } = await complete(
      {},
      'dependent',
      'orders',
      'documents',
      'notes',
      ENTER,
    );
    expect(rejected).toEqual(['the module name "order-documents" is already used']);
    expect(request.name).toBe('notes');
  });

  it('rejects a singular equal to the name, and an existing vendor adapter', async () => {
    const singular = await complete({}, 'standalone', 'products', 'products', 'product');
    expect(singular.rejected).toEqual(['the singular must differ from "products"']);
    const vendor = await complete({}, 'integration', 'acme-pay', 'users', 'globex', ENTER);
    expect(vendor.rejected).toEqual([
      'src/integrations/acme-pay/ already exists',
      '"users" is a module: a vendor adapter cannot share its name',
    ]);
  });

  it('rejects an empty institution and a detail named like its header', async () => {
    const institution = await complete({}, 'integration', 'globex', '', 'Globex');
    expect(institution.rejected).toEqual(['the institution is required']);
    const detail = await complete({}, 'header-detail', 'invoices', ENTER, 'invoices', ENTER, ENTER);
    expect(detail.rejected).toEqual(['the detail must differ from the header']);
  });

  it('refuses a dependent when no module can be a parent', async () => {
    const error = await completeRequest(
      {},
      { ...CONTEXT, parents: [] },
      scripted('dependent').prompter,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ScaffoldError);
    expect((error as Error).message).toContain('no module can be a parent yet');
  });

  it('a suggested plural that is taken stops with the reason', async () => {
    const error = await complete({}, 'standalone', 'order', 'rename').catch(
      (caught: unknown) => caught,
    );
    expect((error as Error).message).toBe('the module name "orders" is already used');
  });
});

describe('when the wizard opens', () => {
  it('only when <kind>, <name> or a webhook vendor is missing', () => {
    expect(needsWizard({})).toBe(true);
    expect(needsWizard({ kind: 'module' })).toBe(true);
    expect(needsWizard({ kind: 'webhook', name: 'payouts' })).toBe(true);
    expect(needsWizard({ kind: 'module', name: 'products' })).toBe(false);
    expect(needsWizard({ kind: 'webhook', name: 'payouts', vendor: 'globex' })).toBe(false);
    expect(needsWizard({ kind: 'integration', name: 'globex' })).toBe(false);
  });

  it('readScaffoldArgs lets <kind> / <name> be missing but still checks every option', () => {
    expect(readScaffoldArgs([]).request.kind).toBeUndefined();
    expect(readScaffoldArgs(['module', '--parent=orders']).request).toMatchObject({
      kind: 'module',
      name: undefined,
      parent: 'orders',
    });
    expect(readScaffoldArgs(['webhook', '--dry-run']).dryRun).toBe(true);
    expect(() => readScaffoldArgs(['module', '--colour=red'])).toThrow(
      'unknown option --colour=red',
    );
    // partner:start
    expect(() => readScaffoldArgs(['partner', '--parent=orders'])).toThrow('--parent is only for');
    // partner:end
    expect(() => readScaffoldArgs(['gadget'])).toThrow('unknown kind "gadget"');
  });

  it('without the wizard a missing argument is still the usage error', () => {
    expect(() => parseScaffoldArgs([])).toThrow(USAGE);
    expect(() => parseScaffoldArgs(['module'])).toThrow(USAGE);
  });

  it('never asks without a terminal: the CLI prints the usage and exits 1', () => {
    const run = Bun.spawnSync(['bun', 'scripts/scaffold.ts', 'module'], {
      cwd: ROOT,
      // A prompt waiting for input would hang here: the timeout turns it into a failure.
      timeout: 15_000,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain('Usage: bun run scaffold');
  });
});

describe('terminal answers', () => {
  it('Ctrl+C / Esc in any question stops the run before anything is planned or written', async () => {
    const error = await complete({}, 'standalone', CANCEL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CancelledError);
    expect((error as Error).message).toBe('cancelled: nothing was written');
  });
});

describe('commandOf', () => {
  it('quotes values a shell would split or expand', () => {
    const request: ScaffoldRequest = {
      kind: 'integration',
      name: 'globex',
      institution: 'Globex "GX" $Corp',
    };
    expect(commandOf(request)).toBe(
      'bun run scaffold integration globex --institution="Globex \\"GX\\" \\$Corp"',
    );
    expect(shellWords(commandOf(request)).at(-1)).toBe('--institution=Globex "GX" $Corp');
  });
});
