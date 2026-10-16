import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The committed contract snapshot (plan D34). */
export const SNAPSHOT_PATH = 'docs/api/openapi.json';

/**
 * The configuration the contract is generated with — never the developer's local env file, so the
 * snapshot is the same on every machine and in CI. Defaults apply to everything else; the
 * service addresses are closed local ports (nothing is ever connected).
 */
const CONTRACT_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  TZ: 'UTC',
  API_BASE_PATH: '/api',
  API_DOCS_ENABLED: 'true',
  DATABASE_URL: 'postgresql://contract:contract@127.0.0.1:1/contract',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '1',
  PARTNER_SECRET_KEYS: `contract:${'0'.repeat(64)}`,
  PARTNER_SECRET_ACTIVE_KEY_ID: 'contract',
  DEMO_PAY_WEBHOOK_SECRET: 'contract-only-webhook-secret',
};

/** Identity values that are not part of the contract (`APP_NAME`, version bump, description). */
const FIXED_INFO = { title: 'API contract', version: '0.0.0', description: '' };

/** Every variable the configuration knows: the keys of `.env.example`, commented ones included. */
const configurationKeys = (rootDir: string): string[] =>
  [
    ...readFileSync(resolve(rootDir, '.env.example'), 'utf-8').matchAll(
      /^#?\s*([A-Z][A-Z0-9_]*)=/gm,
    ),
  ].map((match) => match[1]);

/** Keys sorted at every level, so the snapshot only changes when the contract does. */
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
};

/** The canonical form written to (and expected in) the snapshot file. */
export const serializeDocument = (document: unknown): string =>
  `${JSON.stringify(sortKeys(document), null, 2)}\n`;

/**
 * The OpenAPI document of `createApp()` exactly as `<API_BASE_PATH>/docs/openapi.json` serves it,
 * built with CONTRACT_ENV. Must run before anything else imports `src/` in this process: the
 * configuration is read once, when its modules load.
 */
export const buildContractDocument = async (rootDir: string): Promise<Record<string, unknown>> => {
  const { RENAMED_ENV_VARS } = await import('../../../src/config/parse-env');
  for (const key of [...configurationKeys(rootDir), ...Object.keys(RENAMED_ENV_VARS)]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- dropping the local values by name is the point
    delete process.env[key];
  }
  Object.assign(process.env, CONTRACT_ENV);

  const { createApp } = await import('../../../src/app');
  const response = await createApp().request('/api/docs/openapi.json');
  if (response.status !== 200) {
    throw new Error(`the app served its OpenAPI document with status ${String(response.status)}`);
  }
  const document = (await response.json()) as Record<string, unknown>;
  return { ...document, info: FIXED_INFO };
};
