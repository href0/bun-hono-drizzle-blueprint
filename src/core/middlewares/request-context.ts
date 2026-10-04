import type { MiddlewareHandler } from 'hono';
import { appConfig, SUPPORTED_LOCALES } from '../../config';
import { resolveLocale } from '../../utils/locale.util';
import { resolveRequestId } from '../../utils/request-id.util';
import { runWithRequestContext } from '../context/request-context';

export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * First middleware of the pipeline: resolves the request ID and the response language, then runs
 * the rest of the request (handlers, error and not-found handlers) inside a fresh request context.
 */
export const requestContextMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = resolveRequestId(c.req.header(REQUEST_ID_HEADER));
    const locale = resolveLocale(
      c.req.header('Accept-Language'),
      SUPPORTED_LOCALES,
      appConfig.DEFAULT_LOCALE,
    );

    c.header(REQUEST_ID_HEADER, requestId);
    c.header('Content-Language', locale);
    c.header('Vary', 'Accept-Language', { append: true });

    await runWithRequestContext({ requestId, locale, actor: 'anonymous' }, () => next());
  };
};
