import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class PayloadTooLargeError extends ApiError {
  readonly statusCode = 413;
  readonly errorType = ERROR_TYPES.PAYLOAD_TOO_LARGE;
  protected readonly defaultCode = APP_ERROR_CODES.PAYLOAD_TOO_LARGE;

  constructor(message = 'Payload Too Large', options?: ApiErrorOptions) {
    super(message, options);
  }
}
