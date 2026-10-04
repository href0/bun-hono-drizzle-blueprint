import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class NotFoundError extends ApiError {
  readonly statusCode = 404;
  readonly errorType = ERROR_TYPES.NOT_FOUND;
  protected readonly defaultCode = APP_ERROR_CODES.NOT_FOUND;

  constructor(message: MessageInput = I18N_MESSAGES.NOT_FOUND, options?: ApiErrorOptions) {
    super(message, options);
  }
}
