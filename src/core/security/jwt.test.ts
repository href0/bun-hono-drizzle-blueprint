import { describe, expect, it } from 'bun:test';
import { sign } from 'hono/jwt';
import { parseInstant } from '../../utils/datetime.util';
import { APP_ERROR_CODES, UnauthorizedError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenSubject,
  type JwtSettings,
} from './jwt';

const settings: JwtSettings = {
  JWT_SECRET: 'unit-test-secret-with-at-least-32-characters',
  JWT_ISSUER: 'sample-app',
  JWT_AUDIENCE: 'sample-app',
  ACCESS_TOKEN_TTL_SECONDS: 900,
};
const subject: AccessTokenSubject = {
  userId: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  role: 'admin',
};
const issuedAt = parseInstant('2026-10-12T03:00:00Z');
const epoch = issuedAt.epochMilliseconds / 1000;

const base64Url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const expectRejected = async (promise: Promise<unknown>, code: string): Promise<void> => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(UnauthorizedError);
  expect(error).toMatchObject({ statusCode: 401, errorCode: code });
};

const expectInvalid = (token: string, verifySettings: JwtSettings = settings) =>
  expectRejected(
    verifyAccessToken(token, verifySettings, issuedAt),
    APP_ERROR_CODES.AUTH_TOKEN_INVALID,
  );

describe('signAccessToken', () => {
  it('issues an HS256 token with the claims of D2', async () => {
    const { token, expiresIn } = await signAccessToken(subject, settings, issuedAt);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()) as unknown);

    expect(expiresIn).toBe(900);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({
      sub: subject.userId,
      role: 'admin',
      jti: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/),
      iat: epoch,
      exp: epoch + 900,
      iss: 'sample-app',
      aud: 'sample-app',
    });
  });

  it('gives every token its own jti', async () => {
    const first = await signAccessToken(subject, settings, issuedAt);
    const second = await signAccessToken(subject, settings, issuedAt);

    expect(first.token).not.toBe(second.token);
  });
});

describe('verifyAccessToken', () => {
  it('returns the subject of a valid token until just before it expires', async () => {
    const { token } = await signAccessToken(subject, settings, issuedAt);

    expect(await verifyAccessToken(token, settings, issuedAt)).toEqual({
      ...subject,
      jti: expect.any(String),
    });
    expect(await verifyAccessToken(token, settings, issuedAt.add({ seconds: 899 }))).toMatchObject(
      subject,
    );
  });

  it('rejects an expired token with ERR_AUTH_TOKEN_EXPIRED and its own message', async () => {
    const { token } = await signAccessToken(subject, settings, issuedAt);
    const promise = verifyAccessToken(token, settings, issuedAt.add({ seconds: 900 }));

    await expectRejected(promise, APP_ERROR_CODES.AUTH_TOKEN_EXPIRED);
    expect(await promise.catch((error: unknown) => error)).toMatchObject({
      userMessage: I18N_MESSAGES.AUTH_TOKEN_EXPIRED,
    });
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await signAccessToken(
      subject,
      {
        ...settings,
        JWT_SECRET: 'another-secret-with-at-least-32-characters!',
      },
      issuedAt,
    );

    await expectInvalid(token);
  });

  it('reports a forged token as invalid even when it is also expired', async () => {
    // Expired against the real clock too, so a library-side expiry check would fire first.
    const { token } = await signAccessToken(
      subject,
      {
        ...settings,
        JWT_SECRET: 'another-secret-with-at-least-32-characters!',
      },
      parseInstant('2020-01-01T00:00:00Z'),
    );

    await expectInvalid(token);
  });

  it('rejects a token from another issuer or for another audience', async () => {
    const otherIssuer = await signAccessToken(
      subject,
      { ...settings, JWT_ISSUER: 'other-app' },
      issuedAt,
    );
    const otherAudience = await signAccessToken(
      subject,
      { ...settings, JWT_AUDIENCE: 'other-app' },
      issuedAt,
    );

    await expectInvalid(otherIssuer.token);
    await expectInvalid(otherAudience.token);
  });

  it('rejects alg "none" and any algorithm other than HS256', async () => {
    const { token } = await signAccessToken(subject, settings, issuedAt);
    const [, payload] = token.split('.');
    const unsigned = `${base64Url({ alg: 'none', typ: 'JWT' })}.${payload}.`;
    const hs512 = await sign(
      {
        sub: subject.userId,
        role: 'admin',
        jti: Bun.randomUUIDv7(),
        iat: epoch,
        exp: epoch + 900,
        iss: 'sample-app',
        aud: 'sample-app',
      },
      settings.JWT_SECRET,
      'HS512',
    );

    await expectInvalid(unsigned);
    await expectInvalid(hs512);
  });

  it('rejects a payload edited after signing', async () => {
    const { token } = await signAccessToken({ ...subject, role: 'user' }, settings, issuedAt);
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as object;
    const tampered = `${header}.${base64Url({ ...claims, role: 'admin' })}.${signature}`;

    await expectInvalid(tampered);
  });

  it('rejects a correctly signed token missing a required claim (e.g. no exp = never expires)', async () => {
    const claims = {
      sub: subject.userId,
      role: 'admin',
      jti: Bun.randomUUIDv7(),
      iat: epoch,
      exp: epoch + 900,
      iss: 'sample-app',
      aud: 'sample-app',
    };
    for (const missing of ['exp', 'sub', 'role', 'jti', 'iss', 'aud'] as const) {
      const rest = Object.fromEntries(Object.entries(claims).filter(([key]) => key !== missing));
      await expectInvalid(await sign(rest, settings.JWT_SECRET, 'HS256'));
    }
    await expectInvalid(await sign({ ...claims, sub: 'not-a-uuid' }, settings.JWT_SECRET, 'HS256'));
  });

  it('rejects a role that is not (or no longer) one of ROLES', async () => {
    const claims = {
      sub: subject.userId,
      role: 'superuser',
      jti: Bun.randomUUIDv7(),
      iat: epoch,
      exp: epoch + 900,
      iss: 'sample-app',
      aud: 'sample-app',
    };

    await expectInvalid(await sign(claims, settings.JWT_SECRET, 'HS256'));
  });

  it('rejects malformed tokens', async () => {
    for (const token of ['', 'abc', 'a.b', 'a.b.c', 'a.b.c.d']) {
      await expectInvalid(token);
    }
  });
});
