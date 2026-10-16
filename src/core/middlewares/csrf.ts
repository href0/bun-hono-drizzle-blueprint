import type { Context, MiddlewareHandler } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { APP_ERROR_CODES, ForbiddenError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { documentsForbidden } from './require-role';

/**
 * CSRF protection for cookie-authenticated endpoints (plan D4), on top of `SameSite` cookies:
 * `hono/csrf` rejects a state-changing request that a browser could send cross-site — a
 * form-like or body-less POST — unless `Sec-Fetch-Site` is `same-origin` or `Origin` is allowed.
 *
 * Allowed origins: `CORS_ORIGINS` (`*` = any, development only) plus the API's own origin.
 * `application/json` requests are not checked: a browser sends them cross-origin only after a
 * CORS preflight, which `corsMiddleware` answers for `CORS_ORIGINS` only. Non-browser clients
 * (mobile, server) send no `Origin`: they set `Content-Type: application/json`.
 *
 * Rejections use the standard envelope: 403 `ERR_CSRF_ORIGIN_FORBIDDEN`.
 */
export const csrfProtection = (origins: readonly string[]): MiddlewareHandler => {
  const anyOrigin = origins.includes('*');
  const check = csrf({
    origin: (origin: string, c: Context) =>
      anyOrigin || origins.includes(origin) || origin === new URL(c.req.url).origin,
  });

  return documentsForbidden(async (c, next) => {
    try {
      // Only the check runs inside `try`: errors from later handlers must pass through untouched.
      await check(c, () => Promise.resolve());
    } catch (error) {
      if (error instanceof HTTPException && error.status === 403) {
        throw new ForbiddenError(I18N_MESSAGES.CSRF_ORIGIN_FORBIDDEN, {
          code: APP_ERROR_CODES.CSRF_ORIGIN_FORBIDDEN,
        });
      }
      throw error;
    }
    await next();
  }, APP_ERROR_CODES.CSRF_ORIGIN_FORBIDDEN);
};
