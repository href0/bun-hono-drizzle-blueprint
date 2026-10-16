import { Hono } from 'hono';
import { z } from 'zod';
import { authConfig, httpConfig } from '../../config';
import { csrfProtection, validate } from '../../core/middlewares';
import { APP_ERROR_CODES } from '../../core/errors';
import { describeEndpoint } from '../../core/openapi';
import { authController } from './auth.controller';
import { AUTH_MESSAGES } from './auth.messages';
import {
  accessTokenSchema,
  authUserSchema,
  changePasswordSchema,
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
      response: {
        status: 200,
        description: 'Logged in',
        message: AUTH_MESSAGES.LOGGED_IN,
        data: loginResponseSchema,
      },
      errors: [
        { status: 401, codes: [APP_ERROR_CODES.AUTH_INVALID_CREDENTIALS] },
        { status: 429, codes: [APP_ERROR_CODES.AUTH_LOGIN_LOCKED] },
      ],
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
      response: {
        status: 200,
        description: 'New access token',
        message: AUTH_MESSAGES.REFRESHED,
        data: accessTokenSchema,
      },
      errors: [
        {
          status: 401,
          codes: [APP_ERROR_CODES.AUTH_REFRESH_INVALID, APP_ERROR_CODES.AUTH_REFRESH_REUSED],
        },
      ],
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
      response: {
        status: 200,
        description: 'Logged out',
        message: AUTH_MESSAGES.LOGGED_OUT,
        data: z.null(),
      },
    }),
    csrf,
    authController.logout,
  );
  routes.post(
    '/logout-all',
    describeEndpoint({
      tags,
      summary: 'Log out of every session on every device',
      response: {
        status: 200,
        description: 'All sessions ended',
        message: AUTH_MESSAGES.LOGGED_OUT_ALL,
        data: z.null(),
      },
    }),
    authController.logoutAll,
  );
  routes.post(
    '/change-password',
    describeEndpoint({
      tags,
      summary: 'Change your own password (ends every other session)',
      description:
        'Requires the current password (attempts count like logins → 429). Returns a new access ' +
        'token and sets a new refresh cookie for this device; every other session ends.',
      response: {
        status: 200,
        description: 'Password changed',
        message: AUTH_MESSAGES.PASSWORD_CHANGED,
        data: accessTokenSchema,
      },
      errors: [{ status: 429, codes: [APP_ERROR_CODES.AUTH_LOGIN_LOCKED] }],
    }),
    validate({ body: changePasswordSchema }),
    authController.changePassword,
  );
  routes.get(
    '/me',
    describeEndpoint({
      tags,
      summary: 'The signed-in user',
      response: {
        status: 200,
        description: 'Profile',
        message: AUTH_MESSAGES.PROFILE_RETRIEVED,
        data: authUserSchema,
      },
    }),
    authController.me,
  );

  if (options.registrationEnabled) {
    routes.post(
      '/register',
      describeEndpoint({
        tags,
        summary: 'Create an account (public registration)',
        response: {
          status: 201,
          description: 'Account created',
          message: AUTH_MESSAGES.REGISTERED,
          data: authUserSchema,
        },
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
