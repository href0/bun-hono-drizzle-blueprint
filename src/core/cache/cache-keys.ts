export const CACHE_PREFIX = {
  USER: 'user:',
  HEALTH: 'health:',
} as const;

export const CACHE_TTL = {
  USER_DETAIL: 15 * 60, // 15 minutes in seconds
  SHORT: 60, // 1 minute
} as const;

export const CACHE_KEYS = {
  userDetail: (id: string): string => `${CACHE_PREFIX.USER}detail:${id}`,
  userList: (page: number, limit: number): string => `${CACHE_PREFIX.USER}list:${page}:${limit}`,
} as const;
