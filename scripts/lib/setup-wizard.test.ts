import { describe, expect, it } from 'bun:test';
import type { Prompter, TextQuestion } from './prompter';
import {
  completeSetup,
  needsSetupWizard,
  NO_PARTNER_WARNING,
  parseSetupArgs,
  requestOf,
  setupArgv,
  setupCommandOf,
  titleOf,
  titleProblem,
  type SetupRequest,
} from './setup-wizard';

const ENTER = Symbol('enter');
type Answer = string | boolean | typeof ENTER;

/** Answers in order like a person; a text answer the question rejects is recorded, the next tried. */
const scripted = (...answers: Answer[]) => {
  const asked: string[] = [];
  const rejected: string[] = [];
  const placeholders: string[] = [];
  const next = (message: string): Answer => {
    asked.push(message);
    const answer = answers.shift();
    if (answer === undefined) throw new Error(`no answer left for "${message}"`);
    return answer;
  };
  const prompter: Prompter = {
    select: () => Promise.reject(new Error('setup asks no select')),
    text: (question: TextQuestion) => {
      if (question.placeholder !== undefined) placeholders.push(question.placeholder);
      for (;;) {
        const answer = next(question.message);
        const value = answer === ENTER ? (question.initial ?? '') : String(answer);
        const problem = question.validate(value);
        if (problem === undefined) return Promise.resolve(value);
        rejected.push(problem);
      }
    },
    confirm: (message) => Promise.resolve(next(message) === true),
  };
  return { prompter, asked, rejected, placeholders, left: answers };
};

describe('parseSetupArgs', () => {
  it('no arguments: only the env file, and the wizard is wanted', () => {
    const args = parseSetupArgs([]);
    expect(args).toEqual({ keepExamples: false, noPartner: false, dryRun: false });
    expect(needsSetupWizard(args)).toBe(true);
  });

  it('reads the name and every option, in both value forms', () => {
    const args = parseSetupArgs([
      'order-service',
      '--title',
      'Order Service API',
      '--description=Orders and invoices',
      '--keep-examples',
      '--no-partner',
      '--dry-run',
    ]);
    expect(args).toEqual({
      name: 'order-service',
      title: 'Order Service API',
      description: 'Orders and invoices',
      keepExamples: true,
      noPartner: true,
      dryRun: true,
    });
    expect(needsSetupWizard(args)).toBe(false);
  });

  it('rejects a bad name, a bad title, an unknown option, a missing value, two names', () => {
    expect(() => parseSetupArgs(['Order Service'])).toThrow('must be kebab-case');
    expect(() => parseSetupArgs(['demo', '--title', "It's"])).toThrow('cannot contain quotes');
    expect(() => parseSetupArgs(['demo', '--bogus'])).toThrow('unknown option --bogus');
    expect(() => parseSetupArgs(['demo', '--title'])).toThrow('--title needs a value');
    expect(() => parseSetupArgs(['demo', '--description', '--dry-run'])).toThrow('needs a value');
    expect(() => parseSetupArgs(['one', 'two'])).toThrow('one project name only');
  });
});

describe('titleOf / titleProblem', () => {
  it('derives Title Case from the name', () => {
    expect(titleOf('api-gateway')).toBe('Api Gateway');
  });

  it('refuses what would break the README, the portal config or a String.replace', () => {
    expect(titleProblem('API Gateway')).toBeUndefined();
    expect(titleProblem('  ')).toBe('the title is required');
    expect(titleProblem('x'.repeat(81))).toBe('the title is at most 80 characters');
    for (const bad of ['a"b', 'a`b', 'a\\b', 'a$1b', 'a\nb']) {
      expect(titleProblem(bad)).toContain('cannot contain');
    }
  });
});

describe('completeSetup (the wizard)', () => {
  it('asks name, title (derived, editable), description, examples; prints only what differs', async () => {
    const session = scripted(
      'Order Service',
      'order-service',
      'Order Service API',
      ENTER,
      false,
      true,
    );
    const request = await completeSetup(parseSetupArgs([]), session.prompter);
    expect(request).toEqual({
      name: 'order-service',
      title: 'Order Service API',
      description: undefined,
      keepExamples: false,
      partner: true,
    });
    expect(session.rejected).toEqual([
      'the project name must be kebab-case (lowercase letters, digits, single hyphens; starts with a letter), got "Order Service"',
    ]);
    expect(session.asked).toEqual([
      'Project name (kebab-case: package, APP_NAME, database <name>_db)',
      'Project name (kebab-case: package, APP_NAME, database <name>_db)',
      'Title (README heading, docs portal)',
      'Description (one line for package.json; Enter to skip)',
      'Keep the example modules (orders, projects, demo-pay, user-posts) as a reference?',
      'Accept calls from partner systems (partner gateway: signed API keys, partner-credentials)?',
    ]);
    expect(session.placeholders.every((text) => text.startsWith('e.g. '))).toBe(true);
    expect(setupCommandOf(request)).toBe('bun run setup order-service --title="Order Service API"');
  });

  it('Enter keeps the derived title (not printed); a description and examples kept are', async () => {
    const session = scripted('api-gateway', ENTER, 'Routes and limits', true, true);
    const request = await completeSetup(parseSetupArgs([]), session.prompter);
    expect(request).toEqual({
      name: 'api-gateway',
      title: undefined,
      description: 'Routes and limits',
      keepExamples: true,
      partner: true,
    });
    expect(setupCommandOf(request)).toBe(
      'bun run setup api-gateway --description="Routes and limits" --keep-examples',
    );
  });

  it('values from the command line are not asked again', async () => {
    const session = scripted('demo');
    const args = {
      ...parseSetupArgs(['--title', 'Demo', '--description=x', '--keep-examples', '--no-partner']),
    };
    expect(await completeSetup(args, session.prompter)).toEqual({
      name: 'demo',
      title: undefined,
      description: 'x',
      keepExamples: true,
      partner: false,
    });
    expect(session.asked).toHaveLength(1);
  });

  it('No to partners shows the warning and needs its own Yes; a second No keeps the gateway', async () => {
    const warnings: string[] = [];
    const removed = scripted('demo', ENTER, ENTER, false, false, true);
    const request = await completeSetup(parseSetupArgs([]), removed.prompter, (text) =>
      warnings.push(text),
    );
    expect(request.partner).toBe(false);
    expect(warnings).toEqual([NO_PARTNER_WARNING]);
    expect(removed.asked.at(-1)).toBe('Remove the partner gateway from this project?');
    expect(setupCommandOf(request)).toBe('bun run setup demo --no-partner');

    const kept = scripted('demo', ENTER, ENTER, false, false, false);
    const keptRequest = await completeSetup(parseSetupArgs([]), kept.prompter, () => undefined);
    expect(keptRequest.partner).toBe(true);
    expect(setupCommandOf(keptRequest)).toBe('bun run setup demo');
  });

  it('the printed command parses back to the same request', () => {
    const request: SetupRequest = {
      name: 'demo',
      title: 'Demo & Co (beta)',
      description: 'A = b; c',
      keepExamples: false,
      partner: true,
    };
    expect(requestOf({ ...parseSetupArgs(setupArgv(request)), name: request.name })).toEqual(
      request,
    );
    expect(setupCommandOf(request)).toBe(
      'bun run setup demo --title="Demo & Co (beta)" --description="A = b; c"',
    );
  });
});
