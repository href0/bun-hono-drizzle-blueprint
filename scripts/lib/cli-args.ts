/**
 * The command line of every `scripts/*.ts` (plan D40, R83): `--help` / `-h` prints the usage on
 * stdout and exits 0 before anything is read, written or contacted; a wrong command line prints the
 * problem and the usage on stderr and exits 1. Usages live in one place: `SCRIPT_USAGE`
 * (commands.ts), which `bun run help <command>` prints too.
 */

export const isHelp = (argv: readonly string[]): boolean =>
  argv.some((arg) => arg === '--help' || arg === '-h');

/** Where the usage goes and how the script ends (the tests pass their own). */
export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
  exit: (code: number) => never;
}

const PROCESS_IO: CliIo = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  exit: (code) => process.exit(code),
};

/** `--help` / `-h` anywhere: the usage, exit 0. Call it first, before any other work. */
export const exitOnHelp = (argv: readonly string[], usage: string, io = PROCESS_IO): void => {
  if (!isHelp(argv)) return;
  io.out(`${usage}\n`);
  io.exit(0);
};

/** A wrong command line: the problem, then the usage, on stderr; exit 1. */
export const exitWithUsage = (problem: string, usage: string, io = PROCESS_IO): never => {
  io.err(`${problem}\n\n${usage}\n`);
  return io.exit(1);
};

export class CliArgsError extends Error {}

export interface CliSpec {
  /** Options without a value (`--dry-run`). */
  flags?: readonly string[];
  /** Options with a value: `--days 30` or `--days=30`. */
  values?: readonly string[];
  /** How many arguments that are not options are allowed (default 0). */
  positionals?: number;
}

export interface Cli {
  flags: ReadonlySet<string>;
  values: ReadonlyMap<string, string>;
  positionals: readonly string[];
}

/** Parses `argv` against `spec`; anything it does not name is a CliArgsError. */
export const parseCli = (argv: readonly string[], spec: CliSpec): Cli => {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];
  const rest = [...argv];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (!arg.startsWith('-')) {
      if (positionals.length >= (spec.positionals ?? 0)) {
        throw new CliArgsError(`unexpected argument ${arg}`);
      }
      positionals.push(arg);
      continue;
    }
    if (spec.flags?.includes(arg)) {
      flags.add(arg);
      continue;
    }
    const name = spec.values?.find((option) => arg === option || arg.startsWith(`${option}=`));
    if (name === undefined) throw new CliArgsError(`unknown option ${arg}`);
    const value = arg === name ? rest.shift() : arg.slice(name.length + 1);
    if (value === undefined || value.startsWith('--')) {
      throw new CliArgsError(`${name} needs a value`);
    }
    values.set(name, value);
  }
  return { flags, values, positionals };
};

/** `--help` → usage and exit 0; a wrong command line → problem + usage and exit 1; else the parse. */
export const readCli = (
  argv: readonly string[],
  usage: string,
  spec: CliSpec,
  io = PROCESS_IO,
): Cli => {
  exitOnHelp(argv, usage, io);
  try {
    return parseCli(argv, spec);
  } catch (error) {
    if (error instanceof CliArgsError) return exitWithUsage(error.message, usage, io);
    throw error;
  }
};
