/**
 * The arguments of `bun run setup` and its wizard (plan D38). In a terminal, `bun run setup` without
 * a project name asks for it — and for the title, the description, whether to keep the examples and
 * the partner gateway — then runs exactly what the printed equivalent command runs (`setupArgv` →
 * `parseSetupArgs`).
 * Without a terminal nothing is asked: no name = only the local env file, as before.
 */
import type { Prompter } from './prompter';

/** kebab-case: the package, `APP_NAME`, the container prefix; the database is `<snake_case>_db`. */
export const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface SetupRequest {
  name: string;
  /** README and docs portal title; undefined = derived from the name (`api-gateway` → `Api Gateway`). */
  title?: string;
  description?: string;
  keepExamples: boolean;
  /** Keep the partner gateway; false = `--no-partner` removes it (plan D39). */
  partner: boolean;
}

export interface SetupArgs extends Partial<Omit<SetupRequest, 'keepExamples' | 'partner'>> {
  keepExamples: boolean;
  /** `--no-partner` given: the wizard does not ask about the gateway again. */
  noPartner: boolean;
  dryRun: boolean;
}

export class SetupArgsError extends Error {}

export const SETUP_USAGE = `Usage:
  bun run setup                                     only the local env file (in a terminal: the wizard)
  bun run setup <project-name> [--title "<Title>"] [--description "<text>"] [--keep-examples] [--no-partner] [--dry-run]`;

/** Shown before the wizard removes the gateway; a separate Yes is asked after it. */
export const NO_PARTNER_WARNING = [
  'WARNING — removing the partner gateway deletes from this project:',
  '  the partner-credentials and partner-gateway modules, the partner_credentials table, partnerAuth(),',
  '  the PARTNER_* settings, bun run partner:sign, bun run scaffold:partner and the partner guide.',
  '  Switching it on later is manual: docs/standards/project-setup.md (§ Partner gateway).',
].join('\n');

/** `api-gateway` → `Api Gateway`. */
export const titleOf = (name: string): string =>
  name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Why a title cannot be used, or undefined. It is written into Markdown headings and into the
 * portal's config and front matter, where quotes, backslashes and line breaks would break them.
 */
export const titleProblem = (title: string): string | undefined => {
  if (title.trim() === '') return 'the title is required';
  if (title.length > 80) return 'the title is at most 80 characters';
  // `$` too: the identity rules write the title through String.replace, where `$1` / `$&` expand.
  if (/['"`\\$\r\n]/.test(title)) {
    return 'the title cannot contain quotes, backslashes, $ or line breaks';
  }
  return undefined;
};

const nameProblem = (name: string): string | undefined =>
  NAME_PATTERN.test(name)
    ? undefined
    : `the project name must be kebab-case (lowercase letters, digits, single hyphens; starts with a letter), got "${name}"`;

/** `--flag value` or `--flag=value`. */
const VALUE_FLAGS = ['--title', '--description'] as const;

export const parseSetupArgs = (argv: readonly string[]): SetupArgs => {
  const args: SetupArgs = { keepExamples: false, noPartner: false, dryRun: false };
  const rest = [...argv];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--keep-examples') {
      args.keepExamples = true;
      continue;
    }
    if (arg === '--no-partner') {
      args.noPartner = true;
      continue;
    }
    const flag = VALUE_FLAGS.find((name) => arg === name || arg.startsWith(`${name}=`));
    if (flag !== undefined) {
      const value = arg === flag ? rest.shift() : arg.slice(flag.length + 1);
      if (value === undefined || value.startsWith('--')) {
        throw new SetupArgsError(`${flag} needs a value\n${SETUP_USAGE}`);
      }
      if (flag === '--title') args.title = value.trim();
      else args.description = value.trim();
      continue;
    }
    if (arg.startsWith('--')) throw new SetupArgsError(`unknown option ${arg}\n${SETUP_USAGE}`);
    if (args.name !== undefined) throw new SetupArgsError(`one project name only\n${SETUP_USAGE}`);
    args.name = arg.trim();
  }
  const problem =
    (args.name === undefined ? undefined : nameProblem(args.name)) ??
    (args.title === undefined ? undefined : titleProblem(args.title));
  if (problem !== undefined) throw new SetupArgsError(problem);
  return args;
};

/** True when the command line names no project: only then the wizard has something to ask. */
export const needsSetupWizard = (args: SetupArgs): boolean => args.name === undefined;

/**
 * Whether to keep the partner gateway: default Yes; a No shows what goes and needs its own Yes,
 * otherwise the gateway stays.
 */
const askPartner = async (prompter: Prompter, warn: (text: string) => void): Promise<boolean> => {
  if (
    await prompter.confirm(
      'Accept calls from partner systems (partner gateway: signed API keys, partner-credentials)?',
      true,
    )
  ) {
    return true;
  }
  warn(NO_PARTNER_WARNING);
  return !(await prompter.confirm('Remove the partner gateway from this project?'));
};

/**
 * Asks for what the command line left out; what it gave is kept and never asked again. `warn`
 * prints the no-partner warning (red in a terminal).
 */
export const completeSetup = async (
  args: SetupArgs,
  prompter: Prompter,
  warn: (text: string) => void = console.warn,
): Promise<SetupRequest> => {
  const name =
    args.name ??
    (await prompter.text({
      message: 'Project name (kebab-case: package, APP_NAME, database <name>_db)',
      placeholder: 'e.g. order-service',
      validate: nameProblem,
    }));
  const title =
    args.title ??
    (await prompter.text({
      message: 'Title (README heading, docs portal)',
      initial: titleOf(name),
      validate: titleProblem,
    }));
  const description =
    args.description ??
    (await prompter.text({
      message: 'Description (one line for package.json; Enter to skip)',
      placeholder: 'e.g. Orders and invoices API',
      validate: () => undefined,
    }));
  const keepExamples =
    args.keepExamples ||
    (await prompter.confirm(
      'Keep the example modules (orders, projects, demo-pay, user-posts) as a reference?',
    ));
  const partner = !args.noPartner && (await askPartner(prompter, warn));
  return {
    name,
    title: title === titleOf(name) ? undefined : title,
    description: description === '' ? undefined : description,
    keepExamples,
    partner,
  };
};

/** The request of parsed arguments that name a project (no questions asked). */
export const requestOf = (args: SetupArgs & { name: string }): SetupRequest => ({
  name: args.name,
  title: args.title,
  description: args.description,
  keepExamples: args.keepExamples,
  partner: !args.noPartner,
});

/** The command-line arguments of a request: `requestOf(parseSetupArgs(setupArgv(r)))` gives it back. */
export const setupArgv = (request: SetupRequest): string[] => [
  request.name,
  ...(request.title === undefined ? [] : [`--title=${request.title}`]),
  ...(request.description === undefined ? [] : [`--description=${request.description}`]),
  ...(request.keepExamples ? ['--keep-examples'] : []),
  ...(request.partner ? [] : ['--no-partner']),
];

/** The same request as one command to copy (values with spaces or shell characters quoted). */
export const setupCommandOf = (request: SetupRequest): string =>
  [
    'bun run setup',
    ...setupArgv(request).map((arg) =>
      /[\s"'$`\\]/.test(arg)
        ? arg.replace(
            /=(.*)$/s,
            (_match, value: string) => `="${value.replace(/["$`\\]/g, '\\$&')}"`,
          )
        : arg,
    ),
  ].join(' ');
