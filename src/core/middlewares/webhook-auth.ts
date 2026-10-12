import type { MiddlewareHandler } from 'hono';
import { nowInstant } from '../../utils/datetime.util';
import {
  getAuthenticatedWebhook,
  getClientIp,
  setAuthenticatedWebhook,
  type AuthenticatedWebhook,
} from '../context/request-context';
import { APP_ERROR_CODES, UnauthorizedError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { logger } from '../logger';
import { UNKNOWN_CLIENT_IP } from './client-ip';

/** What a vendor verifier sees: the raw body bytes exactly as received, and the headers. */
export interface WebhookRequest {
  body: Uint8Array;
  header: (name: string) => string | undefined;
  /** Unix epoch milliseconds, for vendors that sign a timestamp. */
  nowMs: number;
}

/**
 * A vendor whose webhooks this API accepts (plan D23). Declared by the vendor's adapter in
 * `src/integrations/<vendor>/<vendor>.webhook.ts` and registered once in `createApp()`.
 */
export interface WebhookVendor {
  /** URL segment and actor: `<API_BASE_PATH>/webhooks/<vendor>`, `webhook:<vendor>` (kebab-case). */
  vendor: string;
  /** The header that carries the vendor's signature (documented in OpenAPI). */
  signatureHeader: string;
  /**
   * Whether the request really comes from the vendor, per the vendor's documented scheme
   * (usually an HMAC of the raw body, compared in constant time). Bad input → `false`, never throws.
   */
  verify: (request: WebhookRequest) => boolean;
}

const signatureInvalid = (): UnauthorizedError =>
  new UnauthorizedError(I18N_MESSAGES.WEBHOOK_SIGNATURE_INVALID, {
    code: APP_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
  });

/** One audit line per webhook request, accepted or not — never the body or signature values. */
const audit = (
  entry: { vendor: string | undefined; reason: string | undefined; statusCode: number },
  request: { method: string; path: string },
  started: number,
): void => {
  const line = {
    audit: 'webhook',
    outcome: entry.reason === undefined ? 'accepted' : 'rejected',
    reason: entry.reason,
    vendor: entry.vendor,
    method: request.method,
    path: request.path,
    clientIp: getClientIp() ?? UNKNOWN_CLIENT_IP,
    statusCode: entry.statusCode,
    durationMs: Math.round(performance.now() - started),
  };
  if (entry.reason === undefined) logger.info(line, 'Webhook request');
  else logger.warn(line, 'Webhook request rejected');
};

/**
 * Verifies one vendor's webhooks, mounted on `<API_BASE_PATH>/webhooks/<vendor>/*`. Reads the raw
 * body once (Hono caches it, so `validate()` still reads the payload), asks the vendor's `verify()`,
 * then records the actor `webhook:<vendor>`; a bad or missing signature → 401
 * `ERR_WEBHOOK_SIGNATURE_INVALID`. The vendor owns the contract, so nothing here assumes a scheme.
 */
export const webhookAuth = (
  { vendor, verify }: WebhookVendor,
  nowMs: () => number = (): number => nowInstant().epochMilliseconds,
): MiddlewareHandler => {
  return async (c, next) => {
    const started = performance.now();
    const request = { method: c.req.method, path: c.req.path };
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (!verify({ body, header: (name) => c.req.header(name), nowMs: nowMs() })) {
      audit({ vendor, reason: 'signature_invalid', statusCode: 401 }, request, started);
      throw signatureInvalid();
    }
    setAuthenticatedWebhook({ vendor });
    // createApp() has an error handler, so handler errors are already the response here.
    try {
      await next();
    } finally {
      audit({ vendor, reason: undefined, statusCode: c.res.status }, request, started);
    }
  };
};

/**
 * Fail-closed guard for the whole `<API_BASE_PATH>/webhooks/*` prefix, mounted after every
 * vendor's `webhookAuth()`: a route there whose vendor has no verifier (or an unknown vendor path)
 * answers 401 instead of being public — the prefix lives outside `/v1`, beyond `authenticate()`.
 */
export const requireVerifiedWebhook = (): MiddlewareHandler => {
  return async (c, next) => {
    if (!getAuthenticatedWebhook()) {
      audit(
        { vendor: undefined, reason: 'no_verifier', statusCode: 401 },
        { method: c.req.method, path: c.req.path },
        performance.now(),
      );
      throw signatureInvalid();
    }
    await next();
  };
};

/** The vendor verified by `webhookAuth()`; 401 on a route that is not behind it. */
export const currentWebhook = (): AuthenticatedWebhook => {
  const webhook = getAuthenticatedWebhook();
  if (!webhook) {
    throw new UnauthorizedError();
  }
  return webhook;
};
