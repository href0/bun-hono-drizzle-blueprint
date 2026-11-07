import { describe, expect, it } from 'bun:test';
import { toAccessTokenResponse, toAuthUserResponse, toLoginResponse } from './auth.transformer';

describe('auth transformer', () => {
  const user = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
  };
  const accessToken = { token: 'header.payload.signature', expiresIn: 900 };

  it('exposes only id, email and full name of the user (roles and permissions: /me/permissions)', () => {
    expect(toAuthUserResponse({ ...user, passwordHash: 'secret' } as typeof user)).toEqual(user);
  });

  it('shapes the OAuth2-style token response', () => {
    expect(toAccessTokenResponse(accessToken)).toEqual({
      accessToken: 'header.payload.signature',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it('never puts the refresh token in the login response', () => {
    const response = toLoginResponse({ accessToken, user, refreshToken: 'opaque' } as never);

    expect(response).toEqual({ ...toAccessTokenResponse(accessToken), user });
    expect(JSON.stringify(response)).not.toContain('opaque');
  });
});
