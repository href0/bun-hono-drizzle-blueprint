import type { Context, ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getRequestContext } from '../context/request-context';
import { ApiError } from '../errors/api-error';
import { InternalServerError } from '../errors/internal-server.error';
import { TooManyRequestsError } from '../errors/too-many-requests.error';
import { logger } from '../logger/logger';
import { buildErrorBody } from '../response/error-response';

/** Serializes an `ApiError` into the standard error envelope (shared with the 404 handler). */
export const sendError = (c: Context, error: ApiError): Response => {
  if (error instanceof TooManyRequestsError && error.retryAfterSeconds !== undefined) {
    c.header('Retry-After', String(Math.ceil(error.retryAfterSeconds)));
  }

  const requestId = getRequestContext()?.requestId ?? 'unknown';
  return c.json(buildErrorBody(error, requestId), error.statusCode as ContentfulStatusCode);
};

export const globalErrorHandler: ErrorHandler = (err, c) => {
  const apiError = err instanceof ApiError ? err : new InternalServerError();

  if (apiError.statusCode >= 500) {
    logger.error({ err, type: apiError.errorType, code: apiError.errorCode }, 'Request failed');
  } else {
    logger.warn(
      {
        type: apiError.errorType,
        code: apiError.errorCode,
        message: apiError.message,
        details: apiError.details,
      },
      'Client error handled',
    );
  }

  return sendError(c, apiError);
};
