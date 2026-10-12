import { z } from 'zod';
import { appConfig, type AppConfig } from './app.config';
import { envSource } from './env-source';
import { isTestEnvironment, parseEnv, type EnvSource } from './parse-env';

/** Browsers drop cookies with a longer Max-Age; Hono refuses to set them (500 on login). */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;

const seconds = (fallback: number): z.ZodDefault<z.ZodNumber> =>
  z.coerce.number().int().positive().default(fallback);

const authSchema = z
  .object({
    /** HMAC key of the access token (HS256). Generate with `bun run setup` or any 32+ byte random string. */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters (use a random secret)'),
    /** Empty = `APP_NAME`. Tokens from another issuer or for another audience are rejected. */
    JWT_ISSUER: z.string().default(''),
    JWT_AUDIENCE: z.string().default(''),
    ACCESS_TOKEN_TTL_SECONDS: seconds(15 * 60),
    /** Lifetime of one refresh token; every rotation starts a new one (sliding). It is the cookie's
     * Max-Age, which browsers (and Hono) cap at 400 days. */
    REFRESH_TOKEN_TTL_SECONDS: seconds(7 * 24 * 60 * 60).refine(
      (value) => value <= MAX_COOKIE_AGE_SECONDS,
      { message: 'must be at most 34560000 (400 days, the browser limit for cookies)' },
    ),
    /** Hard limit for a whole rotation chain (family): after it the user signs in again. */
    REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: seconds(30 * 24 * 60 * 60),
    /** `None` only for a cross-site frontend over HTTPS (the cookie is always `Secure`). */
    AUTH_COOKIE_SAMESITE: z.enum(['Strict', 'Lax', 'None']).default('Strict'),
    AUTH_REGISTRATION_ENABLED: z.enum(['true', 'false']).default('false'),
    /** Failed logins allowed per (email, client IP) before `AUTH_LOGIN_LOCK_SECONDS` of 429. */
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_LOGIN_LOCK_SECONDS: seconds(15 * 60),
  })
  .refine(
    (config) => config.REFRESH_TOKEN_TTL_SECONDS <= config.REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS,
    {
      path: ['REFRESH_TOKEN_TTL_SECONDS'],
      message: 'must not exceed REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS',
    },
  );

/** Tests never use a real secret; outside tests a missing or short one stops the startup. */
const TEST_DEFAULTS: EnvSource = {
  JWT_SECRET: 'test-only-jwt-secret-not-for-real-use-000000',
};

export type AuthConfig = Omit<z.infer<typeof authSchema>, 'AUTH_REGISTRATION_ENABLED'> & {
  AUTH_REGISTRATION_ENABLED: boolean;
};

export const buildAuthConfig = (
  source: EnvSource,
  app: Pick<AppConfig, 'APP_NAME'>,
): AuthConfig => {
  const config = parseEnv(
    'auth',
    authSchema,
    isTestEnvironment(source) ? { ...TEST_DEFAULTS, ...source } : source,
  );
  return {
    ...config,
    JWT_ISSUER: config.JWT_ISSUER || app.APP_NAME,
    JWT_AUDIENCE: config.JWT_AUDIENCE || app.APP_NAME,
    AUTH_REGISTRATION_ENABLED: config.AUTH_REGISTRATION_ENABLED === 'true',
  };
};

export const authConfig = buildAuthConfig(envSource, appConfig);
