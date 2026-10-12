/**
 * Creates the first administrator in the database configured by the env file.
 *
 *   bun run seed:admin --email admin@example.com [--name "Jane Admin"]   # prompts for the password
 *   bun run seed:admin --email someone@example.com --promote             # existing user → admin
 *   printf '%s\n' "$ADMIN_PASSWORD" | bun run seed:admin --email …        # non-interactive (CI)
 *
 * The password is read from the terminal (hidden, asked twice) or from stdin when piped — never
 * from arguments or environment variables, which end up in shell history and process listings.
 */
import { CACHE_KEYS, cacheService } from '../src/core/cache';
import { closeRedisClient, redisClient } from '../src/core/cache/redis.client';
import { sqlClient } from '../src/database/connection';
import { SeedAdminError, seedAdmin } from '../src/database/seeds/seed-admin';
import { readHidden, readPipedLine } from './lib/read-secret';

interface Args {
  email?: string;
  name: string;
  promote: boolean;
}

const usage = 'Usage: bun run seed:admin --email <email> [--name "<full name>"] [--promote]';

const parseArgs = (argv: string[]): Args => {
  const args: Args = { name: 'Administrator', promote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email') args.email = argv[(i += 1)];
    else if (arg === '--name') args.name = argv[(i += 1)] ?? args.name;
    else if (arg === '--promote') args.promote = true;
    else {
      console.error(`Unknown argument: ${arg}\n${usage}`);
      process.exit(1);
    }
  }
  return args;
};

const readPassword = async (): Promise<string> => {
  const piped = await readPipedLine();
  if (piped !== null) return piped;
  const password = await readHidden('Password for the new admin: ');
  const confirmation = await readHidden('Repeat the password: ');
  if (password !== confirmation) {
    console.error('The passwords do not match; nothing was written.');
    process.exit(1);
  }
  return password;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    console.error(usage);
    process.exit(1);
  }

  try {
    const result = await seedAdmin(
      {
        email: args.email.trim().toLowerCase(),
        fullName: args.name,
        promote: args.promote,
        password: args.promote ? undefined : await readPassword(),
      },
      undefined,
      undefined,
      (userId) => cacheService.del(CACHE_KEYS.userDetail(userId)),
    );
    const messages = {
      created: 'Created admin',
      promoted: 'Promoted to active admin',
      unchanged: 'Already an active admin, nothing changed:',
    };
    console.log(`${messages[result.action]} ${result.user.email} (id ${result.user.id})`);
  } catch (error) {
    if (!(error instanceof SeedAdminError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await Promise.all([sqlClient.end(), closeRedisClient(redisClient)]);
  }
};

await main();
