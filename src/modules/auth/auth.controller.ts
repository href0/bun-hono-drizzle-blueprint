import type { Context } from 'hono';
import { UnauthorizedError } from '../../core/errors';
import { asyncHandler, currentUser, getValidatedBody } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './auth-cookie';
import { authService, AuthService, type ClientInfo } from './auth.service';
import { toAccessTokenResponse, toAuthUserResponse, toLoginResponse } from './auth.transformer';
import type { LoginDto, RegisterDto } from './auth.dto';
import { AUTH_MESSAGES } from './auth.messages';

const clientInfo = (c: Context): ClientInfo => ({ userAgent: c.req.header('user-agent') });

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  login = asyncHandler(async (c) => {
    const dto = getValidatedBody<LoginDto>(c);
    const session = await this.service.login(dto, clientInfo(c));
    setRefreshCookie(c, session.refreshToken, session.refreshMaxAge);

    return new ApiResponse(toLoginResponse(session), AUTH_MESSAGES.LOGGED_IN, 200);
  });

  refresh = asyncHandler(async (c) => {
    try {
      const session = await this.service.refresh(readRefreshCookie(c), clientInfo(c));
      setRefreshCookie(c, session.refreshToken, session.refreshMaxAge);

      return new ApiResponse(
        toAccessTokenResponse(session.accessToken),
        AUTH_MESSAGES.REFRESHED,
        200,
      );
    } catch (error) {
      // A rejected token is useless to the browser; keep the cookie on other failures (e.g. 500).
      if (error instanceof UnauthorizedError) clearRefreshCookie(c);
      throw error;
    }
  });

  logout = asyncHandler(async (c) => {
    await this.service.logout(readRefreshCookie(c));
    clearRefreshCookie(c);

    return new ApiResponse(null, AUTH_MESSAGES.LOGGED_OUT, 200);
  });

  logoutAll = asyncHandler(async (c) => {
    await this.service.logoutAll(currentUser().id);
    clearRefreshCookie(c);

    return new ApiResponse(null, AUTH_MESSAGES.LOGGED_OUT_ALL, 200);
  });

  me = asyncHandler(async () => {
    const profile = await this.service.getProfile(currentUser().id);

    return new ApiResponse(toAuthUserResponse(profile), AUTH_MESSAGES.PROFILE_RETRIEVED, 200);
  });

  register = asyncHandler(async (c) => {
    const dto = getValidatedBody<RegisterDto>(c);
    const user = await this.service.register(dto);

    return new ApiResponse(toAuthUserResponse(user), AUTH_MESSAGES.REGISTERED, 201);
  });
}

export const authController = new AuthController();
