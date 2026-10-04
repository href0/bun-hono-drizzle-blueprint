import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiError } from '../errors/api-error';
import { logger } from '../logger/logger';

export const globalErrorHandler: ErrorHandler = (err, c) => {
  const requestId = (c.get('requestId') as string) || c.req.header('x-request-id') || 'unknown';

  if (err instanceof ApiError) {
    logger.warn(
      {
        type: err.errorType,
        code: err.errorCode,
        message: err.message,
        details: err.details,
        requestId,
      },
      'Client error handled',
    );

    return c.json(
      {
        success: false,
        status_code: err.statusCode,
        message: err.message,
        data: null,
        error: {
          type: err.errorType,
          code: err.errorCode,
          origin: err.origin,
          ...(err.details.length > 0 ? { details: err.details } : {}),
        },
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
      err.statusCode as ContentfulStatusCode,
    );
  }

  // Unhandled / Internal Server Errors
  logger.error({ err, requestId }, 'Unhandled internal server error');

  return c.json(
    {
      success: false,
      status_code: 500,
      message: 'Internal Server Error',
      data: null,
      error: {
        type: 'INTERNAL_SERVER_ERROR',
        code: 'ERR_INTERNAL_SERVER_ERROR',
        origin: 'APP',
      },
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
    500,
  );
};
