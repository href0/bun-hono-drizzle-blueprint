import { z } from 'zod';
import { envSource } from './env-source';
import { isTestEnvironment, parseEnv, type EnvSource } from './parse-env';

/** Same rules as the payload format of `secret-cipher.util.ts` (`v1.<keyId>.…`). */
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * `k1:<64 hex>[,k0:<64 hex>…]` → `{ k1: '<hex>', k0: '<hex>' }`. Errors name the entry by key ID
 * or position, never by its value (the value is a key).
 */
const keyringField = z.string().transform((value, ctx): Record<string, string> => {
  const keys: Record<string, string> = {};
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'is required (format: k1:<64 hex>[,k0:<64 hex>])' });
    return z.NEVER;
  }
  for (const [index, entry] of entries.entries()) {
    const separator = entry.indexOf(':');
    const keyId = separator === -1 ? '' : entry.slice(0, separator);
    const hex = entry.slice(separator + 1);
    if (!KEY_ID_PATTERN.test(keyId)) {
      ctx.addIssue({
        code: 'custom',
        message: `entry ${String(index + 1)}: key ID must be 1-32 of [A-Za-z0-9_-] followed by ":"`,
      });
    } else if (keyId in keys) {
      ctx.addIssue({ code: 'custom', message: `key ID "${keyId}" appears twice` });
    } else if (!KEY_HEX_PATTERN.test(hex)) {
      ctx.addIssue({ code: 'custom', message: `key "${keyId}" must be 64 hex characters` });
    } else {
      keys[keyId] = hex.toLowerCase();
    }
  }
  return keys;
});

const partnerSchema = z
  .object({
    /** How far `x-partner-timestamp` may be from the server clock, either way. */
    PARTNER_HMAC_TOLERANCE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60 * 1000),
    /** AES-256-GCM keys for partner HMAC secrets at rest; old keys stay to decrypt until rotated. */
    PARTNER_SECRET_KEYS: keyringField,
    /** The key that encrypts new and rotated secrets; must be in PARTNER_SECRET_KEYS. */
    PARTNER_SECRET_ACTIVE_KEY_ID: z.string().min(1, 'is required'),
  })
  .refine((config) => config.PARTNER_SECRET_ACTIVE_KEY_ID in config.PARTNER_SECRET_KEYS, {
    path: ['PARTNER_SECRET_ACTIVE_KEY_ID'],
    message: 'must name a key in PARTNER_SECRET_KEYS',
  });

/** Tests never use a real key; outside tests a missing keyring stops the startup. */
const TEST_DEFAULTS: EnvSource = {
  PARTNER_SECRET_KEYS: `test:${'0'.repeat(64)}`,
  PARTNER_SECRET_ACTIVE_KEY_ID: 'test',
};

export type PartnerConfig = z.infer<typeof partnerSchema>;

export const buildPartnerConfig = (source: EnvSource): PartnerConfig =>
  parseEnv(
    'partner',
    partnerSchema,
    isTestEnvironment(source) ? { ...TEST_DEFAULTS, ...source } : source,
  );

export const partnerConfig = buildPartnerConfig(envSource);
