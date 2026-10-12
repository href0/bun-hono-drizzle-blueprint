import type { SignedAccessToken } from '../../core/security/jwt';
import type { AccessTokenResponse, AuthUser, LoginResponse } from './auth.dto';

export const toAuthUserResponse = (user: AuthUser): AuthUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
});

export const toAccessTokenResponse = (token: SignedAccessToken): AccessTokenResponse => ({
  accessToken: token.token,
  tokenType: 'Bearer',
  expiresIn: token.expiresIn,
});

/** The refresh token is deliberately absent: it is set as an HttpOnly cookie. */
export const toLoginResponse = (session: {
  accessToken: SignedAccessToken;
  user: AuthUser;
}): LoginResponse => ({
  ...toAccessTokenResponse(session.accessToken),
  user: toAuthUserResponse(session.user),
});
