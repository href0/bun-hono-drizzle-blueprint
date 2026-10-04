import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ConflictError extends ApiError {
  readonly statusCode = 409;
  readonly errorType = ERROR_TYPES.CONFLICT;
  protected readonly defaultCode = APP_ERROR_CODES.CONFLICT;

  constructor(message: MessageInput = I18N_MESSAGES.CONFLICT, options?: ApiErrorOptions) {
    super(message, options);
  }
}
