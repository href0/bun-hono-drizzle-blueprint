import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class ValidationError extends ApiError {
  readonly statusCode = 400;
  readonly errorType = ERROR_TYPES.VALIDATION_ERROR;
  protected readonly defaultCode = APP_ERROR_CODES.INVALID_INPUT;

  constructor(message: MessageInput = I18N_MESSAGES.VALIDATION_FAILED, options?: ApiErrorOptions) {
    super(message, options);
  }
}
