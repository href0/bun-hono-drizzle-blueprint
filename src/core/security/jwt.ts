import type { Temporal } from 'temporal-polyfill';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import { authConfig, type AuthConfig } from '../../config';
import { nowInstant } from '../../utils/datetime.util';
import { APP_ERROR_CODES, UnauthorizedError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';

/** The only algorithm issued and accepted; a token announcing any other (`none`, RS256…) is invalid. */
const ALGORITHM = 'HS256';

export type JwtSettings = Pick<
  AuthConfig,
  'JWT_SECRET' | 'JWT_ISSUER' | 'JWT_AUDIENCE' | 'ACCESS_TOKEN_TTL_SECONDS'
>;

export interface AccessTokenSubject {
  userId: string;
  role: string;
}

export interface VerifiedAccessToken extends AccessTokenSubject {
  /** Unique token id (UUID v7), for logs and a future deny-list. */
  jti: string;
}

export interface SignedAccessToken {
  token: string;
  /** Seconds until expiry — the OAuth2 `expires_in` the client schedules its refresh with. */
  expiresIn: number;
}

/**
 * Every claim we issue is required on the way back in: `hono/jwt` checks `exp`, `iss` and `aud`
 * only when present in the token, so a validly signed token without `exp` would never expire.
 */
const claimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.string().min(1),
  jti: z.string().uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

const epochSeconds = (instant: Temporal.Instant): number =>
  Math.floor(instant.epochMilliseconds / 1000);

const invalidToken = (): UnauthorizedError =>
  new UnauthorizedError(I18N_MESSAGES.AUTH_TOKEN_INVALID, {
    code: APP_ERROR_CODES.AUTH_TOKEN_INVALID,
  });

/** Issues a short-lived access token (claims: plan L3). */
export const signAccessToken = async (
  subject: AccessTokenSubject,
  settings: JwtSettings = authConfig,
  now: Temporal.Instant = nowInstant(),
): Promise<SignedAccessToken> => {
  const issuedAt = epochSeconds(now);
  const token = await sign(
    {
      sub: subject.userId,
      role: subject.role,
      jti: Bun.randomUUIDv7(),
      iat: issuedAt,
      exp: issuedAt + settings.ACCESS_TOKEN_TTL_SECONDS,
      iss: settings.JWT_ISSUER,
      aud: settings.JWT_AUDIENCE,
    },
    settings.JWT_SECRET,
    ALGORITHM,
  );
  return { token, expiresIn: settings.ACCESS_TOKEN_TTL_SECONDS };
};

/**
 * Verifies an access token: algorithm, signature, issuer and audience first, then expiry — so only a
 * genuine token is ever reported as expired (`ERR_AUTH_TOKEN_EXPIRED`, the client should refresh).
 * Anything else is `ERR_AUTH_TOKEN_INVALID`; the reason is never sent to the client.
 */
export const verifyAccessToken = async (
  token: string,
  settings: JwtSettings = authConfig,
  now: Temporal.Instant = nowInstant(),
): Promise<VerifiedAccessToken> => {
  let payload: unknown;
  try {
    payload = await verify(token, settings.JWT_SECRET, {
      alg: ALGORITHM,
      iss: settings.JWT_ISSUER,
      aud: settings.JWT_AUDIENCE,
      // Time claims are checked below against `now`, after the signature.
      exp: false,
      iat: false,
      nbf: false,
    });
  } catch {
    throw invalidToken();
  }

  const claims = claimsSchema.safeParse(payload);
  if (!claims.success) {
    throw invalidToken();
  }
  if (claims.data.exp <= epochSeconds(now)) {
    throw new UnauthorizedError(I18N_MESSAGES.AUTH_TOKEN_EXPIRED, {
      code: APP_ERROR_CODES.AUTH_TOKEN_EXPIRED,
    });
  }

  return { userId: claims.data.sub, role: claims.data.role, jti: claims.data.jti };
};
