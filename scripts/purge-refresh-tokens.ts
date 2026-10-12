/**
 * Deletes refresh tokens that expired more than N days ago. Schedule it (cron, a CI job, a k8s
 * CronJob) — e.g. daily:
 *
 *   bun run auth:purge-tokens            # retention 7 days after expiry
 *   bun run auth:purge-tokens --days 30
 */
import { sqlClient } from '../src/database/connection';
import {
  DEFAULT_RETENTION_DAYS,
  purgeRefreshTokens,
} from '../src/database/maintenance/purge-refresh-tokens';

const parseDays = (argv: string[]): number => {
  if (argv.length === 0) return DEFAULT_RETENTION_DAYS;
  const [flag, value] = argv;
  const days = Number(value);
  if (flag !== '--days' || argv.length !== 2 || !Number.isInteger(days) || days < 0) {
    console.error('Usage: bun run auth:purge-tokens [--days <whole number ≥ 0>]');
    process.exit(1);
  }
  return days;
};

const days = parseDays(process.argv.slice(2));
try {
  const deleted = await purgeRefreshTokens(days);
  console.log(
    `Deleted ${String(deleted)} refresh token(s) expired more than ${String(days)} day(s) ago`,
  );
} finally {
  await sqlClient.end();
}
