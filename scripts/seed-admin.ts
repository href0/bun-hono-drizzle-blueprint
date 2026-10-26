/**
 * Creates the first administrator in the database configured by the env file.
 *
 *   bun run seed:admin                                                     # terminal: asks everything
 *   bun run seed:admin --email admin@example.com [--name "Jane Admin"]   # asks the password
 *   bun run seed:admin --email someone@example.com --promote             # existing user → admin
 *   printf '%s\n' "$ADMIN_PASSWORD" | bun run seed:admin --email …        # non-interactive (CI)
 *
 * In a terminal the questions go through the Prompter (scripts/lib/admin-questions.ts; the
 * password masked, twice); piped, `--email` is required and the password is the first line of
 * stdin — never an argument or an environment variable, which end up in shell history and process
 * listings. The database is imported only after the command line is read, so `--help` touches
 * nothing.
 */
import { askAdmin, DEFAULT_ADMIN_NAME, type AdminAnswers } from './lib/admin-questions';
import { exitWithUsage, readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';
import { CancelledError, terminalPrompter } from './lib/prompter';
import { readPipedLine } from './lib/read-secret';

const usage = usageOf('seed-admin.ts');
const cli = readCli(process.argv.slice(2), usage, {
  values: ['--email', '--name'],
  flags: ['--promote'],
});
const flags = {
  email: cli.values.get('--email')?.trim().toLowerCase(),
  name: cli.values.get('--name'),
  promote: cli.flags.has('--promote'),
};

/** Piped stdin: nothing is asked. */
const fromPipe = async (): Promise<AdminAnswers> => {
  const email = flags.email ?? exitWithUsage('--email is required without a terminal', usage);
  return {
    email,
    fullName: flags.name ?? DEFAULT_ADMIN_NAME,
    password: flags.promote ? undefined : ((await readPipedLine()) ?? ''),
  };
};

const main = async (): Promise<void> => {
  const terminal = process.stdin.isTTY;
  let answers: AdminAnswers;
  try {
    if (terminal) terminalPrompter.intro('bun run seed:admin');
    answers = terminal ? await askAdmin(flags, terminalPrompter) : await fromPipe();
  } catch (error) {
    if (!(error instanceof CancelledError)) throw error;
    console.error(error.message);
    process.exit(1);
  }

  const { CACHE_KEYS, cacheService } = await import('../src/core/cache');
  const { closeRedisClient, redisClient } = await import('../src/core/cache/redis.client');
  const { sqlClient } = await import('../src/database/connection');
  const seeds = await import('../src/database/seeds/seed-admin');
  try {
    const result = await seeds.seedAdmin(
      { ...answers, email: answers.email.trim().toLowerCase(), promote: flags.promote },
      undefined,
      undefined,
      (userId) => cacheService.del(CACHE_KEYS.userDetail(userId)),
    );
    const messages = {
      created: 'Created admin',
      promoted: 'Promoted to active admin',
      unchanged: 'Already an active admin, nothing changed:',
    };
    const done = `${messages[result.action]} ${result.user.email} (id ${result.user.id})`;
    if (terminal) terminalPrompter.outro(done);
    else console.log(done);
  } catch (error) {
    if (!(error instanceof seeds.SeedAdminError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await Promise.all([sqlClient.end(), closeRedisClient(redisClient)]);
  }
};

await main();
