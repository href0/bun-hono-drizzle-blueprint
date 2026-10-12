import { Hono } from 'hono';
import { z } from 'zod';
import { authConfig, httpConfig } from '../../config';
import { csrfProtection, requireAuth, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { authController } from './auth.controller';
import {
  accessTokenSchema,
  authUserSchema,
  loginResponseSchema,
  loginSchema,
  registerSchema,
} from './auth.dto';

const tags = ['Auth'];

const COOKIE_NOTE =
  'Reads the `refresh_token` HttpOnly cookie (set by login, sent by the browser with ' +
  '`credentials: "include"`). Cross-site requests are rejected (CSRF: `Origin` must be in ' +
  'CORS_ORIGINS or the API itself; non-browser clients send `Content-Type: application/json`).';

export interface AuthRoutesOptions {
  /** `POST /register` exists only when enabled (AUTH_REGISTRATION_ENABLED); otherwise 404. */
  registrationEnabled: boolean;
  /** Origins allowed to use the cookie endpoints (CORS_ORIGINS). */
  csrfOrigins: readonly string[];
}

export const buildAuthRoutes = (options: AuthRoutesOptions): Hono => {
  const routes = new Hono();
  const csrf = csrfProtection(options.csrfOrigins);

  routes.post(
    '/login',
    describeEndpoint({
      tags,
      summary: 'Log in with email and password',
      description:
        'Returns an access token and sets the refresh token as an HttpOnly cookie. Too many ' +
        'attempts for one email from one client → 429 `ERR_AUTH_LOGIN_LOCKED`.',
      response: { status: 200, description: 'Logged in', data: loginResponseSchema },
      errors: [401, 403],
    }),
    csrf,
    validate({ body: loginSchema }),
    authController.login,
  );
  routes.post(
    '/refresh',
    describeEndpoint({
      tags,
      summary: 'Get a new access token (rotates the refresh token)',
      description: `${COOKIE_NOTE} A token used twice ends the whole session (\`ERR_AUTH_REFRESH_REUSED\`).`,
      response: { status: 200, description: 'New access token', data: accessTokenSchema },
      errors: [401, 403],
    }),
    csrf,
    authController.refresh,
  );
  routes.post(
    '/logout',
    describeEndpoint({
      tags,
      summary: 'Log out of this session (idempotent)',
      description: COOKIE_NOTE,
      response: { status: 200, description: 'Logged out', data: z.null() },
      errors: [403],
    }),
    csrf,
    authController.logout,
  );
  routes.post(
    '/logout-all',
    describeEndpoint({
      tags,
      summary: 'Log out of every session on every device',
      response: { status: 200, description: 'All sessions ended', data: z.null() },
      auth: 'bearer',
    }),
    requireAuth(),
    authController.logoutAll,
  );
  routes.get(
    '/me',
    describeEndpoint({
      tags,
      summary: 'The signed-in user',
      response: { status: 200, description: 'Profile', data: authUserSchema },
      auth: 'bearer',
    }),
    requireAuth(),
    authController.me,
  );

  if (options.registrationEnabled) {
    routes.post(
      '/register',
      describeEndpoint({
        tags,
        summary: 'Create an account (public registration)',
        response: { status: 201, description: 'Account created', data: authUserSchema },
        errors: [409],
      }),
      validate({ body: registerSchema }),
      authController.register,
    );
  }

  return routes;
};

export const authRoutes = buildAuthRoutes({
  registrationEnabled: authConfig.AUTH_REGISTRATION_ENABLED,
  csrfOrigins: httpConfig.CORS_ORIGINS,
});
