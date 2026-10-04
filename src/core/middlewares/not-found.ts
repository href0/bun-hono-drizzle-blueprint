import type { NotFoundHandler } from 'hono';
import { getRequestContext } from '../context/request-context';

export const notFoundHandler: NotFoundHandler = (c) => {
  const requestId = getRequestContext()?.requestId ?? 'unknown';

  return c.json(
    {
      success: false,
      status_code: 404,
      message: `Route not found: ${c.req.method} ${c.req.path}`,
      data: null,
      error: {
        type: 'NOT_FOUND',
        code: 'ERR_ROUTE_NOT_FOUND',
        origin: 'APP',
      },
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
    404,
  );
};
