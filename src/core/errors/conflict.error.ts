import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ConflictError extends ApiError {
  readonly statusCode = 409;
  readonly errorType = ERROR_TYPES.CONFLICT;
  protected readonly defaultCode = APP_ERROR_CODES.CONFLICT;

  constructor(message = 'Resource Conflict', options?: ApiErrorOptions) {
    super(message, options);
  }
}
