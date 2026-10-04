export const CACHE_PREFIX = {
  USER: 'user:',
  RATE_LIMIT: 'rate-limit:',
} as const;

export const CACHE_TTL = {
  USER_DETAIL: 15 * 60, // 15 minutes in seconds
} as const;

export const CACHE_KEYS = {
  userDetail: (id: string): string => `${CACHE_PREFIX.USER}detail:${id}`,
  /** One fixed-window counter per limit (`scope`) and caller (`subject`, e.g. the client IP). */
  rateLimit: (scope: string, subject: string): string =>
    `${CACHE_PREFIX.RATE_LIMIT}${scope}:${subject}`,
} as const;
