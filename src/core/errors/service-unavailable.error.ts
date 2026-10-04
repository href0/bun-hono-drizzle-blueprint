import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ServiceUnavailableError extends ApiError {
  readonly statusCode = 503;
  readonly errorType = ERROR_TYPES.SERVICE_UNAVAILABLE;
  protected readonly defaultCode = APP_ERROR_CODES.SERVICE_UNAVAILABLE;

  constructor(message = 'Service Unavailable', options?: ApiErrorOptions) {
    super(message, options);
  }
}
