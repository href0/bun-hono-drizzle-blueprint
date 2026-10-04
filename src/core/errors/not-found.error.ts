import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class NotFoundError extends ApiError {
  readonly statusCode = 404;
  readonly errorType = ERROR_TYPES.NOT_FOUND;
  protected readonly defaultCode = APP_ERROR_CODES.NOT_FOUND;

  constructor(message = 'Resource Not Found', options?: ApiErrorOptions) {
    super(message, options);
  }
}
