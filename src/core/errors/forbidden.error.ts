import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ForbiddenError extends ApiError {
  readonly statusCode = 403;
  readonly errorType = ERROR_TYPES.FORBIDDEN;
  protected readonly defaultCode = APP_ERROR_CODES.FORBIDDEN;

  constructor(message = 'Forbidden', options?: ApiErrorOptions) {
    super(message, options);
  }
}
