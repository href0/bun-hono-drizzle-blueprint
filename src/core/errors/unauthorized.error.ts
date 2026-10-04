import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class UnauthorizedError extends ApiError {
  readonly statusCode = 401;
  readonly errorType = ERROR_TYPES.UNAUTHORIZED;
  protected readonly defaultCode = APP_ERROR_CODES.UNAUTHORIZED;

  constructor(message = 'Unauthorized', options?: ApiErrorOptions) {
    super(message, options);
  }
}
