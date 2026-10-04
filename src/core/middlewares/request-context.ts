import type { MiddlewareHandler } from 'hono';
import { resolveRequestId } from '../../utils/request-id.util';
import { runWithRequestContext } from '../context/request-context';

export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * First middleware of the pipeline: resolves the request ID and runs the rest of the request
 * (handlers, error and not-found handlers) inside a fresh request context.
 */
export const requestContextMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = resolveRequestId(c.req.header(REQUEST_ID_HEADER));
    c.header(REQUEST_ID_HEADER, requestId);

    await runWithRequestContext({ requestId, actor: 'anonymous' }, () => next());
  };
};
