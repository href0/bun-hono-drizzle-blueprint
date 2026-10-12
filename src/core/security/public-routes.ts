import { matchRoutePattern } from '../../utils/route-match.util';

export interface PublicRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to the versioned API root (`<API_BASE_PATH>/v1`); `:param` and a trailing `*` allowed. */
  path: string;
}

/**
 * The only versioned routes reachable without an access token (plan D7: default-deny). Every
 * other route under `<API_BASE_PATH>/v1` requires `Authorization: Bearer <token>` — a route added
 * without an entry here is protected, never accidentally open (test/default-deny.e2e.test.ts).
 *
 * Unversioned platform routes (health probes, API docs, `/`) live outside `/v1` and are public by
 * design; that list is asserted by the same test.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: 'POST', path: '/auth/login' },
  // Cookie-authenticated (refresh token) and CSRF-protected, not bearer-authenticated:
  { method: 'POST', path: '/auth/refresh' },
  { method: 'POST', path: '/auth/logout' },
  // Routed only when AUTH_REGISTRATION_ENABLED; otherwise 404.
  { method: 'POST', path: '/auth/register' },
];

/**
 * Partner gateway routes, relative to `<API_BASE_PATH>/v1`: authenticated by a signed request
 * (`partnerAuth()`, HMAC), never by an access token. Not public — a request without valid partner
 * headers is refused there.
 */
export const PARTNER_ROUTE_PREFIX = '/partner';

/** Whether a versioned path (relative to `<API_BASE_PATH>/v1`) is a partner gateway route. */
export const isPartnerRoute = (path: string): boolean =>
  matchRoutePattern(`${PARTNER_ROUTE_PREFIX}/*`, path);

/** `HEAD` is answered by `GET` handlers, so a public `GET` is public for `HEAD` too. */
export const isPublicRoute = (
  method: string,
  path: string,
  routes: readonly PublicRoute[] = PUBLIC_ROUTES,
): boolean =>
  routes.some(
    (route) =>
      (route.method === method || (method === 'HEAD' && route.method === 'GET')) &&
      matchRoutePattern(route.path, path),
  );
