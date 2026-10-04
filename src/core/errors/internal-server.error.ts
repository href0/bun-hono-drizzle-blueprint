import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

/**
 * Broken invariant inside the application (e.g. INSERT … RETURNING produced no row).
 * The message is logged for diagnosis but never sent to the client.
 */
export class InternalServerError extends ApiError {
  readonly statusCode = 500;
  readonly errorType = ERROR_TYPES.INTERNAL_SERVER_ERROR;
  protected readonly defaultCode = APP_ERROR_CODES.INTERNAL;

  constructor(message = 'Internal Server Error', options?: ApiErrorOptions) {
    super(message, options);
  }
}
