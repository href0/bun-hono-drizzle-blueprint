import type { MiddlewareHandler } from 'hono';
import { partnerConfig } from '../../config';
import { nowInstant } from '../../utils/datetime.util';
import { matchesAnyIpRule } from '../../utils/ip-match.util';
import { verifyV1 } from '../../utils/partner-signature.util';
import { matchRoutePattern } from '../../utils/route-match.util';
import type { SecretCipher } from '../../utils/secret-cipher.util';
import { CACHE_KEYS, cacheService, type CacheService } from '../cache';
import {
  getAuthenticatedPartner,
  getClientIp,
  setAuthenticatedPartner,
  type AuthenticatedPartner,
} from '../context/request-context';
import {
  ApiError,
  APP_ERROR_CODES,
  ForbiddenError,
  InternalServerError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { logger } from '../logger';
import { hashPartnerApiKey, partnerSecretCipher } from '../security/partner-credentials';
import { UNKNOWN_CLIENT_IP } from './client-ip';

/** Request headers of signing spec v1 (partner integration guide). */
export const PARTNER_HEADERS = {
  KEY: 'x-partner-key',
  TIMESTAMP: 'x-partner-timestamp',
  NONCE: 'x-partner-nonce',
  SIGNATURE: 'x-partner-signature',
} as const;

const API_KEY_PATTERN = /^[\x21-\x7e]{1,256}$/;
/** Unix epoch milliseconds. */
const TIMESTAMP_PATTERN = /^\d{1,16}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/** What the gateway needs to know about a credential (never the API key itself). */
export interface PartnerGatewayCredential {
  partnerCode: string;
  /** `secret-cipher.util.ts` payload of the HMAC secret. */
  encryptedSecret: string;
  /** IP addresses / CIDR blocks; empty = any address. */
  ipWhitelist: readonly string[];
  /** Route patterns relative to the mount path (`matchRoutePattern`). */
  allowedRoutes: readonly string[];
  rateLimitRpm: number;
  isActive: boolean;
}

/** The live credential whose API key has this SHA-256 hex, or `null`. */
export type PartnerCredentialLookup = (
  apiKeyHash: string,
) => Promise<PartnerGatewayCredential | null>;

export interface PartnerAuthOptions {
  /** Where the middleware is mounted (`<API_BASE_PATH>/v1/partner`); allowed routes are relative to it. */
  basePath: string;
  lookup: PartnerCredentialLookup;
  /** Allowed distance between `x-partner-timestamp` and the server clock, either way. */
  toleranceMs?: number;
  cipher?: SecretCipher;
  cache?: CacheService;
  nowMs?: () => number;
}

/** Why a request was refused — the audit log's `reason`, never sent to the client. */
export type PartnerRejectionReason =
  | 'headers_missing'
  | 'timestamp_out_of_window'
  | 'invalid_key'
  | 'inactive'
  | 'ip_forbidden'
  | 'route_forbidden'
  | 'secret_unreadable'
  | 'signature_invalid'
  | 'nonce_reused'
  | 'rate_limited';

class PartnerRejection extends Error {
  constructor(
    readonly reason: PartnerRejectionReason,
    readonly error: ApiError,
  ) {
    super(reason);
  }
}

const unauthorized = (
  reason: PartnerRejectionReason,
  message: (typeof I18N_MESSAGES)[keyof typeof I18N_MESSAGES],
  code: (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES],
): PartnerRejection => new PartnerRejection(reason, new UnauthorizedError(message, { code }));

/**
 * Authenticates partner requests signed per spec v1 (HMAC-SHA256, `partner-signature.util.ts`).
 * Checks, cheapest first, each with its own refusal:
 *
 * 1. the four `x-partner-*` headers are present and well-formed → 401 `ERR_PARTNER_HEADERS_MISSING`
 * 2. the timestamp is within `toleranceMs` of the server clock → 401 `ERR_PARTNER_REPLAY_REJECTED`
 * 3. the API key (by its SHA-256) belongs to a live, active credential → 401 `ERR_PARTNER_INVALID_KEY`
 * 4. the client IP is in the whitelist (empty = any) → 403 `ERR_PARTNER_IP_FORBIDDEN`
 * 5. the route is allowed for the partner → 403 `ERR_PARTNER_ROUTE_FORBIDDEN`
 * 6. the signature over method, path, query and the raw body (read once; handlers can still read
 *    it) is valid → 401 `ERR_PARTNER_SIGNATURE_INVALID`
 * 7. the nonce was not used before (kept twice the tolerance) → 401 `ERR_PARTNER_REPLAY_REJECTED`
 * 8. the partner is under its `rate_limit_rpm` (per minute) → 429 `ERR_RATE_LIMITED`
 *
 * Then the actor is `partner:<code>` (`currentPartner()` in handlers). Steps 7–8 use Redis and
 * fail open — Redis down means no replay or rate protection beyond the timestamp window, logged
 * as `warn` by CacheService — so the gateway stays available. Every request ends with one audit
 * log line (`audit: 'partner'`), allowed or rejected, without key, nonce or signature values.
 */
export const partnerAuth = ({
  basePath,
  lookup,
  toleranceMs = partnerConfig.PARTNER_HMAC_TOLERANCE_MS,
  cipher = partnerSecretCipher,
  cache = cacheService,
  nowMs = (): number => nowInstant().epochMilliseconds,
}: PartnerAuthOptions): MiddlewareHandler => {
  const nonceTtlSeconds = Math.max(Math.ceil((2 * toleranceMs) / 1000), 1);

  return async (c, next) => {
    const started = performance.now();
    const clientIp = getClientIp() ?? UNKNOWN_CLIENT_IP;
    let partnerCode: string | undefined;
    let reason: PartnerRejectionReason | undefined;
    let statusCode = 500;

    try {
      const apiKey = c.req.header(PARTNER_HEADERS.KEY) ?? '';
      const timestamp = c.req.header(PARTNER_HEADERS.TIMESTAMP) ?? '';
      const nonce = c.req.header(PARTNER_HEADERS.NONCE) ?? '';
      const signature = c.req.header(PARTNER_HEADERS.SIGNATURE) ?? '';
      if (
        !API_KEY_PATTERN.test(apiKey) ||
        !TIMESTAMP_PATTERN.test(timestamp) ||
        !NONCE_PATTERN.test(nonce) ||
        !SIGNATURE_PATTERN.test(signature)
      ) {
        throw unauthorized(
          'headers_missing',
          I18N_MESSAGES.PARTNER_HEADERS_MISSING,
          APP_ERROR_CODES.PARTNER_HEADERS_MISSING,
        );
      }

      if (Math.abs(nowMs() - Number(timestamp)) > toleranceMs) {
        throw unauthorized(
          'timestamp_out_of_window',
          I18N_MESSAGES.PARTNER_REPLAY_REJECTED,
          APP_ERROR_CODES.PARTNER_REPLAY_REJECTED,
        );
      }

      const credential = await lookup(hashPartnerApiKey(apiKey));
      if (!credential) {
        throw unauthorized(
          'invalid_key',
          I18N_MESSAGES.PARTNER_INVALID_KEY,
          APP_ERROR_CODES.PARTNER_INVALID_KEY,
        );
      }
      partnerCode = credential.partnerCode;
      // An inactive partner gets the same answer as an unknown key.
      if (!credential.isActive) {
        throw unauthorized(
          'inactive',
          I18N_MESSAGES.PARTNER_INVALID_KEY,
          APP_ERROR_CODES.PARTNER_INVALID_KEY,
        );
      }

      if (
        credential.ipWhitelist.length > 0 &&
        !matchesAnyIpRule(clientIp, credential.ipWhitelist)
      ) {
        throw new PartnerRejection(
          'ip_forbidden',
          new ForbiddenError(I18N_MESSAGES.PARTNER_IP_FORBIDDEN, {
            code: APP_ERROR_CODES.PARTNER_IP_FORBIDDEN,
          }),
        );
      }

      const routePath = c.req.path.startsWith(basePath) ? c.req.path.slice(basePath.length) : '';
      if (
        !credential.allowedRoutes.some((pattern) => matchRoutePattern(pattern, routePath || '/'))
      ) {
        throw new PartnerRejection(
          'route_forbidden',
          new ForbiddenError(I18N_MESSAGES.PARTNER_ROUTE_FORBIDDEN, {
            code: APP_ERROR_CODES.PARTNER_ROUTE_FORBIDDEN,
          }),
        );
      }

      let secret: string;
      try {
        secret = cipher.decrypt(credential.encryptedSecret);
      } catch (error) {
        // A key missing from PARTNER_SECRET_KEYS or a corrupted row: our fault, not the partner's.
        throw new PartnerRejection(
          'secret_unreadable',
          new InternalServerError(
            'Partner secret cannot be decrypted (check PARTNER_SECRET_KEYS)',
            {
              details: [{ field: 'partner', message: error instanceof Error ? error.message : '' }],
            },
          ),
        );
      }
      // The raw bytes as sent; Hono caches them, so validate() / c.req.json() still work after.
      const body = new Uint8Array(await c.req.arrayBuffer());
      const url = new URL(c.req.url);
      const signed = verifyV1(
        secret,
        { timestamp, nonce, method: c.req.method, path: url.pathname, query: url.search, body },
        signature,
      );
      if (!signed) {
        throw unauthorized(
          'signature_invalid',
          I18N_MESSAGES.PARTNER_SIGNATURE_INVALID,
          APP_ERROR_CODES.PARTNER_SIGNATURE_INVALID,
        );
      }

      // After the signature: an unsigned request cannot burn a partner's nonces.
      if (
        !(await cache.setIfAbsent(CACHE_KEYS.partnerNonce(partnerCode, nonce), 1, nonceTtlSeconds))
      ) {
        throw unauthorized(
          'nonce_reused',
          I18N_MESSAGES.PARTNER_REPLAY_REJECTED,
          APP_ERROR_CODES.PARTNER_REPLAY_REJECTED,
        );
      }

      const counter = await cache.increment(
        CACHE_KEYS.rateLimit('partner', partnerCode),
        RATE_LIMIT_WINDOW_SECONDS,
      );
      if (counter) {
        const resetSeconds =
          counter.ttlSeconds > 0 ? counter.ttlSeconds : RATE_LIMIT_WINDOW_SECONDS;
        c.header('RateLimit-Limit', String(credential.rateLimitRpm));
        c.header(
          'RateLimit-Remaining',
          String(Math.max(credential.rateLimitRpm - counter.count, 0)),
        );
        c.header('RateLimit-Reset', String(resetSeconds));
        if (counter.count > credential.rateLimitRpm) {
          throw new PartnerRejection(
            'rate_limited',
            new TooManyRequestsError(undefined, { retryAfterSeconds: resetSeconds }),
          );
        }
      }

      setAuthenticatedPartner({ code: partnerCode });
      await next();
      statusCode = c.res.status;
    } catch (error) {
      if (error instanceof PartnerRejection) {
        reason = error.reason;
        statusCode = error.error.statusCode;
        throw error.error;
      }
      statusCode = error instanceof ApiError ? error.statusCode : 500;
      throw error;
    } finally {
      const entry = {
        audit: 'partner',
        outcome: reason === undefined ? 'allowed' : 'rejected',
        reason,
        partnerCode,
        method: c.req.method,
        path: c.req.path,
        clientIp,
        statusCode,
        durationMs: Math.round(performance.now() - started),
      };
      if (reason === undefined) logger.info(entry, 'Partner request');
      else logger.warn(entry, 'Partner request rejected');
    }
  };
};

/** The partner verified by `partnerAuth()`; 401 on a route that is not behind it. */
export const currentPartner = (): AuthenticatedPartner => {
  const partner = getAuthenticatedPartner();
  if (!partner) {
    throw new UnauthorizedError();
  }
  return partner;
};
