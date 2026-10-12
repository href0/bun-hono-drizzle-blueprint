import type { Hono } from 'hono';
import { signAccessToken } from '../../src/core/security/jwt';
import type { Role } from '../../src/core/security/roles';

/** The user behind `authorize()` — a fixed id so tests can assert actor stamps (`user:<id>`). */
export const TEST_PRINCIPAL_ID = '0192f1d0-0000-7000-8000-00000000a11c';

/**
 * Every versioned route requires an access token (default-deny). For tests of a module's own
 * contract this makes `app.request()` send `Authorization: Bearer <token of a <role>>` unless the
 * request sets its own header. Returns the same app instance.
 */
export const authorize = async (
  app: Hono,
  role: Role = 'admin',
  userId: string = TEST_PRINCIPAL_ID,
): Promise<Hono> => {
  const { token } = await signAccessToken({ userId, role });
  const request = app.request.bind(app);
  app.request = (input, init, ...rest) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('authorization')) headers.set('Authorization', `Bearer ${token}`);
    return request(input, { ...init, headers }, ...rest);
  };
  return app;
};
