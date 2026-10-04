import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class PayloadTooLargeError extends ApiError {
  readonly statusCode = 413;
  readonly errorType = ERROR_TYPES.PAYLOAD_TOO_LARGE;
  protected readonly defaultCode = APP_ERROR_CODES.PAYLOAD_TOO_LARGE;

  constructor(message: MessageInput = I18N_MESSAGES.PAYLOAD_TOO_LARGE, options?: ApiErrorOptions) {
    super(message, options);
  }
}
