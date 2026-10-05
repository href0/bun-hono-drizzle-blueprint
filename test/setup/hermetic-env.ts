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
} as const;

Object.assign(process.env, HERMETIC_ENV);
