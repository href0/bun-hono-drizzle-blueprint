import { Temporal } from 'temporal-polyfill';
import { authConfig, type AuthConfig } from '../../config';
import { CacheService, cacheService, CACHE_KEYS } from '../../core/cache';
import { getClientIp } from '../../core/context/request-context';
import {
  APP_ERROR_CODES,
  ConflictError,
  InternalServerError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../core/errors';
import { I18N_MESSAGES } from '../../core/i18n';
import { logger } from '../../core/logger';
import { signAccessToken, type SignedAccessToken } from '../../core/security/jwt';
import { isRole } from '../../core/security/roles';
import { Transactional } from '../../database/transactional.decorator';
import { isUniqueViolation } from '../../database/unique-violation';
import type { User } from '../../database/schema';
import { generateOpaqueToken, sha256Hex } from '../../utils/crypto.util';
import { nowInstant } from '../../utils/datetime.util';
import { AuthRepository, authRepository } from './auth.repository';
import { AuthUsersRepository, authUsersRepository } from './auth-users.repository';
import type { AuthUser, LoginDto, RegisterDto } from './auth.dto';
import { AUTH_MESSAGES } from './auth.messages';

export type AuthSettings = Pick<
  AuthConfig,
  | 'REFRESH_TOKEN_TTL_SECONDS'
  | 'REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS'
  | 'AUTH_LOGIN_MAX_ATTEMPTS'
  | 'AUTH_LOGIN_LOCK_SECONDS'
>;

/** Request details stored with a refresh token (the client IP comes from the request context). */
export interface ClientInfo {
  userAgent?: string;
}

/** What a successful login or refresh hands to the controller. */
export interface IssuedSession {
  user: AuthUser;
  accessToken: SignedAccessToken;
  /** Opaque value for the HttpOnly cookie; only its SHA-256 is stored. */
  refreshToken: string;
  /** Seconds until the refresh token expires — the cookie's `Max-Age`. */
  refreshMaxAge: number;
}

type RotationOutcome =
  | { kind: 'rotated'; session: IssuedSession }
  | { kind: 'invalid' }
  | { kind: 'reused'; userId: string; familyId: string };

interface Family {
  familyId: string;
  familyStartedAt: Temporal.Instant;
}

const USER_AGENT_MAX_LENGTH = 255;

/**
 * Verified against when the email is unknown, so a failed login takes as long as a wrong password
 * and the response time does not reveal which emails exist. Created once, on first use.
 */
let dummyPasswordHash: Promise<string> | undefined;
const getDummyPasswordHash = (): Promise<string> =>
  (dummyPasswordHash ??= Bun.password.hash('constant-time-dummy-password'));

const earliest = (a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant =>
  Temporal.Instant.compare(a, b) <= 0 ? a : b;

const secondsUntil = (from: Temporal.Instant, to: Temporal.Instant): number =>
  Math.max(0, Math.floor((to.epochMilliseconds - from.epochMilliseconds) / 1000));

const invalidCredentials = (): UnauthorizedError =>
  new UnauthorizedError(AUTH_MESSAGES.INVALID_CREDENTIALS, {
    code: APP_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
  });

const refreshInvalid = (): UnauthorizedError =>
  new UnauthorizedError(AUTH_MESSAGES.REFRESH_INVALID, {
    code: APP_ERROR_CODES.AUTH_REFRESH_INVALID,
  });

const emailTaken = (): ConflictError =>
  new ConflictError(AUTH_MESSAGES.EMAIL_TAKEN, {
    details: [{ field: 'email', message: AUTH_MESSAGES.EMAIL_ALREADY_REGISTERED }],
  });

/** `users.role` is a plain varchar; a value outside ROLES is a broken invariant, not a login. */
const toAuthUser = (user: User): AuthUser => {
  if (!isRole(user.role)) {
    throw new InternalServerError(`users.role of ${user.id} is not one of ROLES: ${user.role}`);
  }
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
};

/**
 * Login, refresh-token rotation with reuse detection, logout (plan D1, L3).
 *
 * A login starts a token family (one session). Every refresh revokes the presented token and
 * issues its successor in the same family; presenting an already revoked token means it was
 * copied, so the whole family is revoked. Deactivated or deleted users cannot refresh: their family
 * is revoked on the next attempt, and their access token expires within ACCESS_TOKEN_TTL_SECONDS.
 */
export class AuthService {
  constructor(
    private readonly tokens: AuthRepository = authRepository,
    private readonly users: AuthUsersRepository = authUsersRepository,
    private readonly cache: CacheService = cacheService,
    private readonly settings: AuthSettings = authConfig,
  ) {}

  /**
   * Email + password. Every attempt counts towards a per-(email, client IP) limit that a
   * successful login resets; past it → 429 `ERR_AUTH_LOGIN_LOCKED` (fails open without Redis).
   * Unknown email, wrong password and inactive account all give the same 401.
   */
  async login(dto: LoginDto, client: ClientInfo = {}): Promise<IssuedSession> {
    const attemptsKey = CACHE_KEYS.loginAttempts(
      sha256Hex(dto.email.trim().toLowerCase()),
      getClientIp() ?? 'unknown',
    );
    const attempts = await this.cache.increment(attemptsKey, this.settings.AUTH_LOGIN_LOCK_SECONDS);
    if (attempts && attempts.count > this.settings.AUTH_LOGIN_MAX_ATTEMPTS) {
      throw new TooManyRequestsError(AUTH_MESSAGES.LOGIN_LOCKED, {
        code: APP_ERROR_CODES.AUTH_LOGIN_LOCKED,
        retryAfterSeconds: attempts.ttlSeconds,
      });
    }

    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = await Bun.password.verify(
      dto.password,
      user?.passwordHash ?? (await getDummyPasswordHash()),
    );
    if (!user || !passwordMatches || !user.isActive) {
      throw invalidCredentials();
    }

    await this.cache.del(attemptsKey);
    const now = nowInstant();
    const family = { familyId: Bun.randomUUIDv7(), familyStartedAt: now };
    return (await this.issue(user, family, now, client)).session;
  }

  /** Rotates the refresh token from the cookie: 401 `ERR_AUTH_REFRESH_INVALID` / `…_REUSED`. */
  async refresh(refreshToken: string | undefined, client: ClientInfo = {}): Promise<IssuedSession> {
    if (!refreshToken) throw refreshInvalid();

    // The transaction commits before the error is thrown: a revoked family must stay revoked.
    const outcome = await this.rotate(refreshToken, client);
    if (outcome.kind === 'reused') {
      logger.warn(
        { userId: outcome.userId, familyId: outcome.familyId },
        'Refresh token reused: session revoked',
      );
      throw new UnauthorizedError(AUTH_MESSAGES.REFRESH_REUSED, {
        code: APP_ERROR_CODES.AUTH_REFRESH_REUSED,
      });
    }
    if (outcome.kind === 'invalid') throw refreshInvalid();
    return outcome.session;
  }

  /** Ends the session of the cookie's token. Idempotent: no, unknown or revoked token is fine. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const token = await this.tokens.findByHash(sha256Hex(refreshToken));
    if (token) await this.tokens.revokeFamily(token.familyId);
  }

  /** Ends every session of the user, on every device. */
  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }

  /** The caller's profile; a user deleted or deactivated since the token was issued gets 401. */
  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user?.isActive) {
      throw new UnauthorizedError(I18N_MESSAGES.AUTH_TOKEN_INVALID, {
        code: APP_ERROR_CODES.AUTH_TOKEN_INVALID,
      });
    }
    return toAuthUser(user);
  }

  /** Public sign-up (only routed when AUTH_REGISTRATION_ENABLED); the user then logs in. */
  @Transactional()
  async register(dto: RegisterDto): Promise<AuthUser> {
    if (await this.users.findByEmail(dto.email)) throw emailTaken();
    const passwordHash = await Bun.password.hash(dto.password);
    try {
      const user = await this.users.create({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        isActive: true,
      });
      return toAuthUser(user);
    } catch (error) {
      // Another request registered the same email between the check and the insert.
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  /** One rotation, in one transaction with the presented token locked (plan L3). */
  @Transactional()
  private async rotate(refreshToken: string, client: ClientInfo): Promise<RotationOutcome> {
    const presented = await this.tokens.findByHashForUpdate(sha256Hex(refreshToken));
    if (!presented) return { kind: 'invalid' };

    if (presented.revokedAt !== null) {
      // Revoked without a successor (logout, logout-all, deactivation): simply no longer valid.
      if (presented.replacedById === null) return { kind: 'invalid' };
      // Already rotated, yet presented again: a copy is in someone else's hands.
      await this.tokens.revokeFamily(presented.familyId);
      return { kind: 'reused', userId: presented.userId, familyId: presented.familyId };
    }

    const now = nowInstant();
    if (Temporal.Instant.compare(presented.expiresAt, now) <= 0) return { kind: 'invalid' };

    const user = await this.users.findById(presented.userId);
    if (!user?.isActive) {
      await this.tokens.revokeFamily(presented.familyId);
      return { kind: 'invalid' };
    }

    const { session, tokenId } = await this.issue(user, presented, now, client);
    await this.tokens.markRotated(presented.id, tokenId);
    return { kind: 'rotated', session };
  }

  /** Stores a new refresh token of the family and signs an access token with the current role. */
  private async issue(
    user: User,
    family: Family,
    now: Temporal.Instant,
    client: ClientInfo,
  ): Promise<{ session: IssuedSession; tokenId: string }> {
    const authUser = toAuthUser(user);
    const refreshToken = generateOpaqueToken();
    const expiresAt = earliest(
      now.add({ seconds: this.settings.REFRESH_TOKEN_TTL_SECONDS }),
      family.familyStartedAt.add({ seconds: this.settings.REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS }),
    );

    const stored = await this.tokens.insert({
      userId: user.id,
      familyId: family.familyId,
      familyStartedAt: family.familyStartedAt,
      tokenHash: sha256Hex(refreshToken),
      expiresAt,
      userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
      ip: getClientIp() ?? null,
    });
    const accessToken = await signAccessToken({ userId: user.id, role: authUser.role });

    return {
      session: {
        user: authUser,
        accessToken,
        refreshToken,
        refreshMaxAge: secondsUntil(now, expiresAt),
      },
      tokenId: stored.id,
    };
  }
}

export const authService = new AuthService();
