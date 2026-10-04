import type { MiddlewareHandler } from 'hono';
import { appConfig, httpConfig, SUPPORTED_LOCALES } from '../../config';
import { resolveLocale } from '../../utils/locale.util';
import { resolveRequestId } from '../../utils/request-id.util';
import { runWithRequestContext } from '../context/request-context';
import { resolveClientIp } from './client-ip';

export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * First middleware of the pipeline: resolves the request ID, the response language and the trusted
 * client IP, then runs the rest of the request (handlers, error and not-found handlers) inside a
 * fresh request context.
 */
export interface RequestContextOptions {
  /** Reverse proxies trusted to append to `X-Forwarded-For` (default `TRUST_PROXY_HOPS`). */
  trustProxyHops?: number;
}

export const requestContextMiddleware = ({
  trustProxyHops = httpConfig.TRUST_PROXY_HOPS,
}: RequestContextOptions = {}): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = resolveRequestId(c.req.header(REQUEST_ID_HEADER));
    const locale = resolveLocale(
      c.req.header('Accept-Language'),
      SUPPORTED_LOCALES,
      appConfig.DEFAULT_LOCALE,
    );

    const clientIp = resolveClientIp(c, trustProxyHops);

    c.header(REQUEST_ID_HEADER, requestId);
    c.header('Content-Language', locale);
    c.header('Vary', 'Accept-Language', { append: true });

    await runWithRequestContext({ requestId, locale, clientIp, actor: 'anonymous' }, () => next());
  };
};
