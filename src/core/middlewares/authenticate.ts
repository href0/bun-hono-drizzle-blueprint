import type { MiddlewareHandler } from 'hono';
import {
  getAuthenticatedUser,
  setAuthenticatedUser,
  type AuthenticatedUser,
} from '../context/request-context';
import { UnauthorizedError } from '../errors';
import { verifyAccessToken, type VerifiedAccessToken } from '../security/jwt';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

/**
 * Requires `Authorization: Bearer <access token>`: verifies it (`verifyAccessToken`) and records
 * the caller in the request context — actor `user:<id>` and role. Missing or malformed header →
 * 401 `ERR_UNAUTHORIZED`; a rejected token → 401 `ERR_AUTH_TOKEN_EXPIRED` / `ERR_AUTH_TOKEN_INVALID`.
 *
 * Per route for now; plan step 3.4 applies it to every route except `PUBLIC_ROUTES` (default-deny).
 */
export const requireAuth = (
  verify: (token: string) => Promise<VerifiedAccessToken> = verifyAccessToken,
): MiddlewareHandler => {
  return async (c, next) => {
    const token = BEARER.exec(c.req.header('authorization') ?? '')?.at(1);
    if (token === undefined) {
      throw new UnauthorizedError();
    }
    const verified = await verify(token);
    setAuthenticatedUser({ id: verified.userId, role: verified.role });
    await next();
  };
};

/** The caller verified by `requireAuth()`; throws 401 when the route forgot to require it. */
export const currentUser = (): AuthenticatedUser => {
  const user = getAuthenticatedUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
};
