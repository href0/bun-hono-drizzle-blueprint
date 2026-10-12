/** Longest vendor body excerpt written to the log (characters). */
export const VENDOR_BODY_LOG_LIMIT = 2048;

const CENSOR = '[REDACTED]';
const MAX_DEPTH = 8;

/**
 * Keys that mark a secret or personal value, compared case-insensitively with `_`/`-` removed:
 * `access_token`, `X-Api-Key` and `clientSecret` all match. Vendors name fields freely, so this
 * is broader than the logger's exact `redact` paths. Short names match whole keys only, otherwise
 * `pin` would hide `shipping` and `otp` would hide `footprint`.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'token',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'creditcard',
  'cardnumber',
];
const SENSITIVE_KEYS = new Set(['cvv', 'cvc', 'pin', 'otp', 'nik']);

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_]/g, '');

export const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
};

const redactDeep = (value: unknown, depth: number): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? CENSOR : redactDeep(item, depth + 1),
    ]),
  );
};

const truncate = (text: string): string =>
  text.length <= VENDOR_BODY_LOG_LIMIT
    ? text
    : `${text.slice(0, VENDOR_BODY_LOG_LIMIT)}…[truncated, ${String(text.length)} chars]`;

/**
 * A vendor response body as it may appear in the log: secrets redacted, at most
 * `VENDOR_BODY_LOG_LIMIT` characters, binary reduced to its size. Never sent to the client.
 */
export const summarizeVendorBody = (body: unknown): string | undefined => {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'string') return truncate(body);
  if (body instanceof ArrayBuffer) return `[binary, ${String(body.byteLength)} bytes]`;
  if (ArrayBuffer.isView(body)) return `[binary, ${String(body.byteLength)} bytes]`;
  if (typeof body === 'object') return truncate(JSON.stringify(redactDeep(body, 0)));
  if (typeof body === 'number' || typeof body === 'boolean' || typeof body === 'bigint') {
    return String(body);
  }
  return `[${typeof body}]`;
};
