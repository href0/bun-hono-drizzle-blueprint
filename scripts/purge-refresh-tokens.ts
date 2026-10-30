/**
 * Deletes refresh tokens that expired more than N days ago. Schedule it (cron, a CI job, a k8s
 * CronJob) — e.g. daily:
 *
 *   bun run auth:purge-tokens            # retention 7 days after expiry
 *   bun run auth:purge-tokens --days 30
 *
 * In a terminal it shows how many tokens would go and asks first (default No); without one (cron,
 * a CI job) it deletes without asking. The database is imported only after the command line is
 * read, so `--help` touches nothing.
 */
import { exitWithUsage, readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';
import { purgeAfterConfirmation } from './lib/confirmations';
import { CancelledError, terminalPrompter } from './lib/prompter';

const usage = usageOf('purge-refresh-tokens.ts');
const cli = readCli(process.argv.slice(2), usage, { values: ['--days'] });
const text = cli.values.get('--days');
const days = text === undefined ? undefined : Number(text);
if (days !== undefined && (!Number.isInteger(days) || days < 0)) {
  exitWithUsage(`--days must be a whole number ≥ 0, got ${String(text)}`, usage);
}

const { sqlClient } = await import('../src/database/connection');
const maintenance = await import('../src/database/maintenance/purge-refresh-tokens');
const retention = days ?? maintenance.DEFAULT_RETENTION_DAYS;
try {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    // A person at a terminal: the count first, then a Yes (D40). Cron and CI never ask.
    terminalPrompter.intro('bun run auth:purge-tokens');
    await purgeAfterConfirmation(terminalPrompter, retention, {
      count: (retentionDays) => maintenance.countPurgeableRefreshTokens(retentionDays),
      purge: (retentionDays) => maintenance.purgeRefreshTokens(retentionDays),
    });
  } else {
    const deleted = await maintenance.purgeRefreshTokens(retention);
    console.log(
      `Deleted ${String(deleted)} refresh token(s) expired more than ${String(retention)} day(s) ago`,
    );
  }
} catch (error) {
  if (!(error instanceof CancelledError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sqlClient.end();
}
