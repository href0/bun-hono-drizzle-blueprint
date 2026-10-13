import { nowInstant } from '../../utils/datetime.util';
import { ExternalServiceError } from '../errors/external.error';

/** What a vendor's login endpoint returns, already parsed by the adapter. */
export interface IssuedAccessToken {
  accessToken: string;
  /** Lifetime announced by the vendor (`expires_in`). */
  expiresInSeconds: number;
}

export interface AccessTokenCacheOptions {
  /** Logs in at the vendor. Never runs twice at the same time (single-flight). */
  login: () => Promise<IssuedAccessToken>;
  /** Renew this long before the vendor's expiry, so a token never expires in flight. Default 60. */
  refreshMarginSeconds?: number;
  /** Epoch milliseconds; injectable for tests. */
  now?: () => number;
}

const DEFAULT_REFRESH_MARGIN_SECONDS = 60;

/**
 * Vendor access token of a login-based integration, kept in memory until `expires_in − margin`.
 * Concurrent callers share one login: ten requests arriving with an empty cache log in once.
 * A failed login is not cached — every waiter gets the error, the next call tries again.
 *
 * Per process: N app instances hold N tokens (one login each). Vendors that allow only one live
 * token per client need a shared cache instead (see docs/standards/integrations.md).
 */
export class AccessTokenCache {
  private readonly login: () => Promise<IssuedAccessToken>;
  private readonly marginMs: number;
  private readonly now: () => number;
  private cached?: { token: string; refreshAtMs: number };
  private pending?: Promise<string>;

  constructor(options: AccessTokenCacheOptions) {
    this.login = options.login;
    this.marginMs = (options.refreshMarginSeconds ?? DEFAULT_REFRESH_MARGIN_SECONDS) * 1000;
    this.now = options.now ?? ((): number => nowInstant().epochMilliseconds);
  }

  /** A valid token: the cached one, or the result of the single login in flight. */
  async getToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.refreshAtMs) return this.cached.token;
    this.pending ??= this.renew().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  /** Forgets `token` (the vendor rejected it). A newer token, already renewed, is kept. */
  invalidate(token: string): void {
    if (this.cached?.token === token) this.cached = undefined;
  }

  /**
   * Runs `call` with a token. When the vendor answers 401 (token revoked or expired early), logs
   * in again and retries once; any other failure, or a second 401, is thrown as is.
   */
  async withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.getToken();
    try {
      return await call(token);
    } catch (error) {
      if (!(error instanceof ExternalServiceError) || error.vendorStatus !== 401) throw error;
      this.invalidate(token);
      return call(await this.getToken());
    }
  }

  private async renew(): Promise<string> {
    const { accessToken, expiresInSeconds } = await this.login();
    const lifetimeMs = expiresInSeconds * 1000;
    // A short-lived token keeps at least half its lifetime instead of never being reused. An
    // expiry of 0, negative or NaN yields a refresh time that is never in the future (NaN never
    // compares as later), so such a token is used once and the next call logs in again.
    const marginMs = Math.min(this.marginMs, lifetimeMs / 2);
    this.cached = { token: accessToken, refreshAtMs: this.now() + lifetimeMs - marginMs };
    return accessToken;
  }
}
