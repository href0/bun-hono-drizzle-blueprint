/**
 * The arguments of `bun run setup` and its wizard (plan D38). In a terminal, `bun run setup` without
 * a project name asks for it — and for the title, the description and whether to keep the examples
 * — then runs exactly what the printed equivalent command runs (`setupArgv` → `parseSetupArgs`).
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
}

export interface SetupArgs extends Partial<Omit<SetupRequest, 'keepExamples'>> {
  keepExamples: boolean;
  dryRun: boolean;
}

export class SetupArgsError extends Error {}

export const SETUP_USAGE = `Usage:
  bun run setup                                     only the local env file (in a terminal: the wizard)
  bun run setup <project-name> [--title "<Title>"] [--description "<text>"] [--keep-examples] [--dry-run]`;

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
  const args: SetupArgs = { keepExamples: false, dryRun: false };
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

/** Asks for what the command line left out; what it gave is kept and never asked again. */
export const completeSetup = async (args: SetupArgs, prompter: Prompter): Promise<SetupRequest> => {
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
  return {
    name,
    title: title === titleOf(name) ? undefined : title,
    description: description === '' ? undefined : description,
    keepExamples,
  };
};

/** The command-line arguments of a request: `parseSetupArgs(setupArgv(request))` gives it back. */
export const setupArgv = (request: SetupRequest): string[] => [
  request.name,
  ...(request.title === undefined ? [] : [`--title=${request.title}`]),
  ...(request.description === undefined ? [] : [`--description=${request.description}`]),
  ...(request.keepExamples ? ['--keep-examples'] : []),
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
