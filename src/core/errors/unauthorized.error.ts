import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class UnauthorizedError extends ApiError {
  readonly statusCode = 401;
  readonly errorType = ERROR_TYPES.UNAUTHORIZED;
  protected readonly defaultCode = APP_ERROR_CODES.UNAUTHORIZED;

  constructor(message: MessageInput = I18N_MESSAGES.UNAUTHORIZED, options?: ApiErrorOptions) {
    super(message, options);
  }
}
