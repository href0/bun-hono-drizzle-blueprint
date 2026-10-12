import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { appConfig, authConfig } from '../../config';

/** Plan D3: the refresh token lives only in this cookie, never in a response body. */
export const REFRESH_COOKIE = 'refresh_token';

/** Sent by the browser only to the auth endpoints (refresh, logout), not to the rest of the API. */
export const refreshCookiePath = (): string => `${appConfig.API_BASE_PATH}/v1/auth`;

/**
 * `HttpOnly` (no script access), `Secure` (HTTPS only — `http://localhost` counts as secure for
 * browsers), `SameSite` from AUTH_COOKIE_SAMESITE (default `Strict`).
 */
const attributes = (maxAgeSeconds: number): Parameters<typeof setCookie>[3] => ({
  path: refreshCookiePath(),
  httpOnly: true,
  secure: true,
  sameSite: authConfig.AUTH_COOKIE_SAMESITE,
  maxAge: maxAgeSeconds,
});

export const setRefreshCookie = (c: Context, token: string, maxAgeSeconds: number): void => {
  setCookie(c, REFRESH_COOKIE, token, attributes(maxAgeSeconds));
};

/** Tells the browser to drop the cookie (same name and path, `Max-Age=0`). */
export const clearRefreshCookie = (c: Context): void => {
  setCookie(c, REFRESH_COOKIE, '', attributes(0));
};

export const readRefreshCookie = (c: Context): string | undefined =>
  getCookie(c, REFRESH_COOKIE) || undefined;
