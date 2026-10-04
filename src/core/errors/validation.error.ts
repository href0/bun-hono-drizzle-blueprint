import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ValidationError extends ApiError {
  readonly statusCode = 400;
  readonly errorType = ERROR_TYPES.VALIDATION_ERROR;
  protected readonly defaultCode = APP_ERROR_CODES.INVALID_INPUT;

  constructor(message = 'Validation Failed', options?: ApiErrorOptions) {
    super(message, options);
  }
}
