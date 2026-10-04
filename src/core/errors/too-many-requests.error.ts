import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export interface TooManyRequestsErrorOptions extends ApiErrorOptions {
  /** Sent as the `Retry-After` response header when provided. */
  retryAfterSeconds?: number;
}

export class TooManyRequestsError extends ApiError {
  readonly statusCode = 429;
  readonly errorType = ERROR_TYPES.TOO_MANY_REQUESTS;
  protected readonly defaultCode = APP_ERROR_CODES.RATE_LIMITED;
  readonly retryAfterSeconds?: number;

  constructor(
    message: MessageInput = I18N_MESSAGES.TOO_MANY_REQUESTS,
    options: TooManyRequestsErrorOptions = {},
  ) {
    super(message, options);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
