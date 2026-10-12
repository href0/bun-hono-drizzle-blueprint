import { RENAMED_ENV_VARS } from '../../src/config/parse-env';

/**
 * Preloaded before every test file (`bunfig.toml` → `[test] preload`). Bun loads the developer's
 * local env file into `bun test` too, so without this the unit and e2e suites would reach the real
 * development database and Redis. Every service address is forced to a closed local port: a
 * connection attempt fails in milliseconds and nothing outside the process is ever touched.
 *
 * Integration tests against real services (plan step 6.1) opt in with their own `TEST_*` variables.
 */
export const HERMETIC_ENV = {
  NODE_ENV: 'test',
  TZ: 'UTC',
  DATABASE_URL: 'postgresql://hermetic:hermetic@127.0.0.1:1/hermetic_test',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '1',
  REDIS_PASSWORD: '',
  // Tests never use the developer's real partner keyring (it encrypts real partner secrets).
  PARTNER_SECRET_KEYS: `test:${'0'.repeat(64)}`,
  PARTNER_SECRET_ACTIVE_KEY_ID: 'test',
} as const;

Object.assign(process.env, HERMETIC_ENV);

// A stale renamed/removed variable in the local env file must not break `bun test` — the startup
// guard (assertNoRenamedVariables) is for running the app, and is unit-tested on its own.
for (const name of Object.keys(RENAMED_ENV_VARS)) {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing stale variables by name is the point
  delete process.env[name];
}
