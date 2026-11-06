import { defineConfig } from 'drizzle-kit';

/** drizzle-kit commands that connect to the database; `generate` / `check` work offline. */
const CONNECTING_COMMANDS = new Set(['migrate', 'studio', 'push', 'pull', 'introspect', 'drop']);
const databaseUrl = process.env.DATABASE_URL ?? '';
const command = process.argv.find((arg) => CONNECTING_COMMANDS.has(arg));

// No silent default database: a migration must go where the chosen environment says.
if (command !== undefined && databaseUrl === '') {
  throw new Error(
    `drizzle-kit ${command}: DATABASE_URL is not set. Locally: bun run env <dev|test|…> db:${command === 'studio' ? 'studio' : 'migrate'}; ` +
      'in a container or on a server, inject the variables (docs/deployment.md).',
  );
}

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Tables live in `public` (a project owns its database); reference views are `.existing()`.
  schemaFilter: ['public'],
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
