export const CACHE_PREFIX = {
  USER: 'user:',
  RATE_LIMIT: 'rate-limit:',
  LOGIN_ATTEMPTS: 'login-attempts:',
  PARTNER_CREDENTIAL: 'partner-credential:',
  PARTNER_NONCE: 'partner-nonce:',
} as const;

export const CACHE_TTL = {
  USER_DETAIL: 15 * 60, // 15 minutes in seconds
  /** Gateway lookup of a partner credential; changes invalidate it, the TTL bounds the rest. */
  PARTNER_CREDENTIAL: 60,
  /** An unknown API key: short, so a key issued meanwhile works almost at once. */
  PARTNER_CREDENTIAL_MISS: 15,
} as const;

export const CACHE_KEYS = {
  userDetail: (id: string): string => `${CACHE_PREFIX.USER}detail:${id}`,
  /** One fixed-window counter per limit (`scope`) and caller (`subject`, e.g. the client IP). */
  rateLimit: (scope: string, subject: string): string =>
    `${CACHE_PREFIX.RATE_LIMIT}${scope}:${subject}`,
  /** Failed-login counter per account and client: `emailHash` = sha256 of the normalized email. */
  loginAttempts: (emailHash: string, clientIp: string): string =>
    `${CACHE_PREFIX.LOGIN_ATTEMPTS}${emailHash}:${clientIp}`,
  /** Gateway view of a partner credential, by the SHA-256 of its API key. */
  partnerCredential: (apiKeyHash: string): string =>
    `${CACHE_PREFIX.PARTNER_CREDENTIAL}${apiKeyHash}`,
  /** A used signing nonce, per partner (replay protection). */
  partnerNonce: (partnerCode: string, nonce: string): string =>
    `${CACHE_PREFIX.PARTNER_NONCE}${partnerCode}:${nonce}`,
} as const;
