/**
 * `bun run help` — every command of this project, grouped, one line each (D40); only prints,
 * never runs anything. `bun run help <command>` explains one. The list is the registry of
 * scripts/lib/commands.ts filtered to the scripts `package.json` has, so a project without the
 * partner gateway never sees its commands. Colours only in a terminal without NO_COLOR.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCli } from './lib/cli-args';
import { commandHelp, commandsHelp, usageOf } from './lib/commands';

const cli = readCli(process.argv.slice(2), usageOf('help.ts'), { positionals: 1 });

const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf8')) as {
  name?: string;
  scripts?: Record<string, string>;
};
const scripts = pkg.scripts ?? {};
const name = cli.positionals.at(0);

if (name === undefined) {
  const terminal = process.stdout.isTTY;
  process.stdout.write(
    commandsHelp(pkg.name ?? 'project', scripts, {
      width: terminal ? process.stdout.columns : 100,
      color: terminal && (process.env.NO_COLOR ?? '') === '',
    }),
  );
} else {
  try {
    process.stdout.write(commandHelp(name, scripts));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
