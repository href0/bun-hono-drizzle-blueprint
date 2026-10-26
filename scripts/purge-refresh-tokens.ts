/**
 * Deletes refresh tokens that expired more than N days ago. Schedule it (cron, a CI job, a k8s
 * CronJob) — e.g. daily:
 *
 *   bun run auth:purge-tokens            # retention 7 days after expiry
 *   bun run auth:purge-tokens --days 30
 *
 * The database is imported only after the command line is read, so `--help` touches nothing.
 */
import { exitWithUsage, readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';

const usage = usageOf('purge-refresh-tokens.ts');
const cli = readCli(process.argv.slice(2), usage, { values: ['--days'] });
const text = cli.values.get('--days');
const days = text === undefined ? undefined : Number(text);
if (days !== undefined && (!Number.isInteger(days) || days < 0)) {
  exitWithUsage(`--days must be a whole number ≥ 0, got ${String(text)}`, usage);
}

const { sqlClient } = await import('../src/database/connection');
const { DEFAULT_RETENTION_DAYS, purgeRefreshTokens } =
  await import('../src/database/maintenance/purge-refresh-tokens');
const retention = days ?? DEFAULT_RETENTION_DAYS;
try {
  const deleted = await purgeRefreshTokens(retention);
  console.log(
    `Deleted ${String(deleted)} refresh token(s) expired more than ${String(retention)} day(s) ago`,
  );
} finally {
  await sqlClient.end();
}
