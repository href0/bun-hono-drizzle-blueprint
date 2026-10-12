import { z } from 'zod';
import { emailField, MAX_PASSWORD_LENGTH, newPasswordField } from '../../core/dto/common.dto';
import { ROLES } from '../../core/security/roles';

export const loginSchema = z.object({
  email: emailField,
  // No policy hints on login: any non-empty password is checked against the stored hash.
  password: z.string().min(1, 'Password is required').max(MAX_PASSWORD_LENGTH),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: emailField,
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: newPasswordField,
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(MAX_PASSWORD_LENGTH),
  newPassword: newPasswordField,
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

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
