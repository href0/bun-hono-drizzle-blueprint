import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ServiceUnavailableError extends ApiError {
  readonly statusCode = 503;
  readonly errorType = ERROR_TYPES.SERVICE_UNAVAILABLE;
  protected readonly defaultCode = APP_ERROR_CODES.SERVICE_UNAVAILABLE;

  constructor(
    message: MessageInput = I18N_MESSAGES.SERVICE_UNAVAILABLE,
    options?: ApiErrorOptions,
  ) {
    super(message, options);
  }
}
