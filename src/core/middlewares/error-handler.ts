import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getLocale, getRequestContext } from '../context/request-context';
import { ApiError } from '../errors/api-error';
import { BadRequestError } from '../errors/bad-request.error';
import { ForbiddenError } from '../errors/forbidden.error';
import { InternalServerError } from '../errors/internal-server.error';
import { NotFoundError } from '../errors/not-found.error';
import { PayloadTooLargeError } from '../errors/payload-too-large.error';
import { ServiceUnavailableError } from '../errors/service-unavailable.error';
import { TooManyRequestsError } from '../errors/too-many-requests.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { logger } from '../logger/logger';
import { CONTRACT_CHECKS, errorViolation, reportViolation } from '../openapi/contract-guard';
import { buildErrorBody } from '../response/error-response';

/**
 * Hono's own middlewares (csrf, body-limit, jwt, …) throw `HTTPException`. Map it onto the
 * error contract so it keeps its status instead of becoming a 500. Empty messages fall back to
 * the class default; custom responses attached to the exception are intentionally dropped.
 */
const fromHttpException = (exception: HTTPException): ApiError => {
  const message = exception.message || undefined;
  switch (exception.status) {
    case 401:
      return new UnauthorizedError(message);
    case 403:
      return new ForbiddenError(message);
    case 404:
      return new NotFoundError(message);
    case 413:
      return new PayloadTooLargeError(message);
    case 429:
      return new TooManyRequestsError(message);
    case 503:
      return new ServiceUnavailableError(message);
    default:
      return exception.status >= 500
        ? new InternalServerError(message)
        : new BadRequestError(message);
  }
};

/** Normalizes anything thrown during a request into an `ApiError`. */
const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  if (err instanceof HTTPException) return fromHttpException(err);
  return new InternalServerError();
};

/** Serializes an `ApiError` into the standard error envelope (shared with the 404 handler). */
export const sendError = (c: Context, error: ApiError): Response => {
  if (error instanceof TooManyRequestsError && error.retryAfterSeconds !== undefined) {
    c.header('Retry-After', String(Math.ceil(error.retryAfterSeconds)));
  }

  const requestId = getRequestContext()?.requestId ?? 'unknown';
  return c.json(
    buildErrorBody(error, requestId, getLocale()),
    error.statusCode as ContentfulStatusCode,
  );
};

export const globalErrorHandler: ErrorHandler = (err, c) => {
  const apiError = toApiError(err);

  // NODE_ENV=test: an error the application raised must carry a code its route documents.
  const violation =
    CONTRACT_CHECKS && err instanceof ApiError
      ? errorViolation(apiError.statusCode, apiError.errorCode, apiError.errorType)
      : undefined;
  if (violation !== undefined) {
    reportViolation(violation);
    return sendError(c, new InternalServerError(violation));
  }

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
