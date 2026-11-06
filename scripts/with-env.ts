/**
 * Runs a command against one named environment, with its own file `.env.<environment>`:
 *
 *   bun run start:dev                     # = bun run env dev start (API, restarts on change)
 *   bun run env dev db:migrate            # migrations into the development database
 *   bun run env test test:int             # integration suite with the test settings
 *   bun run env stg seed:admin --email …  # any package.json script, its arguments after it
 *
 * Containers and servers that receive their variables from the platform run `bun run start` /
 * `bun run db:migrate` without it (docs/deployment.md). An AI agent may use dev and test only.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { exitWithUsage, isHelp } from './lib/cli-args';
import { usageOf } from './lib/commands';
import { EnvPlanError, planWithEnv, type EnvPlan } from './lib/with-env';
import packageJson from '../package.json';

const usage = usageOf('with-env.ts');
const argv = process.argv.slice(2);
// Only the launcher's own --help: `bun run env dev seed:admin --help` is the command's.
if (isHelp(argv.slice(0, 1))) {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

const root = resolve(import.meta.dir, '..');
const planOrExit = (): EnvPlan => {
  try {
    return planWithEnv(argv, packageJson.scripts, (path) => existsSync(resolve(root, path)));
  } catch (error) {
    if (!(error instanceof EnvPlanError)) throw error;
    return exitWithUsage(error.message, usage);
  }
};
const plan = planOrExit();

// The target, without credentials, read by Bun from the chosen file like the command will.
const describe = Bun.spawnSync(
  [
    'bun',
    `--env-file=${plan.envFile}`,
    '-e',
    "import { describeDatabase } from './scripts/lib/with-env.ts'; console.log(describeDatabase(process.env.DATABASE_URL))",
  ],
  { cwd: root },
);
console.error(
  `[env] ${plan.environment} (${plan.envFile}) → ${new TextDecoder().decode(describe.stdout).trim()}`,
);

const child = Bun.spawn(['bun', ...plan.bunArgs], {
  cwd: root,
  stdio: ['inherit', 'inherit', 'inherit'],
});

// The launcher ends only after the command: on Ctrl+C the terminal sends SIGINT to both, and a
// launcher that died first handed the terminal back to the shell while the server was still
// shutting down and writing to it. SIGINT is the command's to handle; SIGTERM / SIGHUP reach only
// the launcher (kill, a closed terminal), so they are passed on.
process.on('SIGINT', () => undefined);
for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
process.exitCode = await child.exited;
