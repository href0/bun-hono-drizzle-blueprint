import type { MiddlewareHandler } from 'hono';
import {
  // partner:start
  getAuthenticatedPartner,
  // partner:end
  getAuthenticatedUser,
  setAuthenticatedUser,
  type AuthenticatedUser,
} from '../context/request-context';
import { UnauthorizedError } from '../errors';
import { verifyAccessToken, type VerifiedAccessToken } from '../security/jwt';
import {
  // partner:start
  isPartnerRoute,
  // partner:end
  isPublicRoute,
} from '../security/public-routes';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

export interface AuthenticateOptions {
  /** Where the middleware is mounted (`<API_BASE_PATH>/v1`); public routes are relative to it. */
  basePath: string;
  isPublic?: (method: string, path: string) => boolean;
  verify?: (token: string) => Promise<VerifiedAccessToken>;
}

/**
 * Default-deny authentication (D7), mounted once for the whole versioned API. Routes listed
 * in `PUBLIC_ROUTES` pass through; every other request needs `Authorization: Bearer <access
 * token>`, which is verified (`verifyAccessToken`) and recorded in the request context — actor
 * `user:<id>` and role. Missing or malformed header → 401 `ERR_UNAUTHORIZED`; a rejected token →
 * 401 `ERR_AUTH_TOKEN_EXPIRED` / `ERR_AUTH_TOKEN_INVALID`.
 */
export const authenticate = ({
  basePath,
  isPublic = isPublicRoute,
  verify = verifyAccessToken,
}: AuthenticateOptions): MiddlewareHandler => {
  return async (c, next) => {
    const path = c.req.path.startsWith(basePath) ? c.req.path.slice(basePath.length) : c.req.path;
    if (isPublic(c.req.method, path || '/')) {
      await next();
      return;
    }
    // partner:start
    // Partner routes (`/partner/*`) are left to `partnerAuth()`, mounted before this middleware —
    // but only once it has verified the partner: without it a partner route needs a bearer token
    // like any other, so a missing `partnerAuth()` closes those routes instead of opening them.
    if (isPartnerRoute(path) && getAuthenticatedPartner()) {
      await next();
      return;
    }
    // partner:end

    // RFC 6750 §3: a 401 for a bearer-protected resource names the scheme (kept on the error response).
    const token = BEARER.exec(c.req.header('authorization') ?? '')?.at(1);
    if (token === undefined) {
      c.header('WWW-Authenticate', 'Bearer');
      throw new UnauthorizedError();
    }
    const verified = await verify(token).catch((error: unknown) => {
      c.header('WWW-Authenticate', 'Bearer error="invalid_token"');
      throw error;
    });
    setAuthenticatedUser({ id: verified.userId, role: verified.role });
    await next();
  };
};

/** The caller verified by `authenticate()`; 401 on a route that is not behind it. */
export const currentUser = (): AuthenticatedUser => {
  const user = getAuthenticatedUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
};
