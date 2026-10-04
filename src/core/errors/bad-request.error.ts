import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class BadRequestError extends ApiError {
  readonly statusCode = 400;
  readonly errorType = ERROR_TYPES.BAD_REQUEST;
  protected readonly defaultCode = APP_ERROR_CODES.BAD_REQUEST;

  constructor(message = 'Bad Request', options?: ApiErrorOptions) {
    super(message, options);
  }
}
