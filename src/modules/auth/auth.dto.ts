import { z } from 'zod';
import { ROLES } from '../../core/security/roles';

/** Upper bound for passwords: hashing is deliberately slow, so huge inputs would be a DoS lever. */
const MAX_PASSWORD_LENGTH = 1024;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address format').max(255),
  // No policy hints on login: any non-empty password is checked against the stored hash.
  password: z.string().min(1, 'Password is required').max(MAX_PASSWORD_LENGTH),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email('Invalid email address format').max(255),
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(MAX_PASSWORD_LENGTH),
});

export type RegisterDto = z.infer<typeof registerSchema>;

/** The signed-in user as the client sees it (login response, `GET /me`, registration). */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(ROLES),
});

/** Also what the service returns: the role is narrowed to ROLES. */
export type AuthUser = z.infer<typeof authUserSchema>;

/** OAuth2-style token response; the refresh token travels only in the HttpOnly cookie. */
export const accessTokenSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
});

export type AccessTokenResponse = z.infer<typeof accessTokenSchema>;

export const loginResponseSchema = accessTokenSchema.extend({ user: authUserSchema });

export type LoginResponse = z.infer<typeof loginResponseSchema>;
