import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { REQUEST_ID_HEADER } from './request-context';

/** Allowlist match; `*` (rejected in production by the config) reflects any origin. */
const allowOrigin = (origins: readonly string[]) => {
  const any = origins.includes('*');
  return (origin: string): string | null => {
    if (!origin) return null;
    return any || origins.includes(origin) ? origin : null;
  };
};

/**
 * Credentialed CORS for an origin allowlist (`CORS_ORIGINS`). An unlisted origin gets no
 * `Access-Control-Allow-Origin`, so the browser blocks the response. Mount it only when the list
 * is non-empty: an empty list means CORS is disabled.
 */
export const corsMiddleware = (origins: readonly string[]): MiddlewareHandler =>
  cors({
    origin: allowOrigin(origins),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept-Language', REQUEST_ID_HEADER],
    exposeHeaders: [
      REQUEST_ID_HEADER,
      'WWW-Authenticate',
      'Retry-After',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ],
    maxAge: 600,
  });
