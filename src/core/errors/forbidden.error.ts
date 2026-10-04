import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ForbiddenError extends ApiError {
  readonly statusCode = 403;
  readonly errorType = ERROR_TYPES.FORBIDDEN;
  protected readonly defaultCode = APP_ERROR_CODES.FORBIDDEN;

  constructor(message: MessageInput = I18N_MESSAGES.FORBIDDEN, options?: ApiErrorOptions) {
    super(message, options);
  }
}
