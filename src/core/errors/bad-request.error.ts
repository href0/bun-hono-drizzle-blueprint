import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

export class BadRequestError extends ApiError {
  readonly statusCode = 400;
  readonly errorType = ERROR_TYPES.BAD_REQUEST;
  protected readonly defaultCode = APP_ERROR_CODES.BAD_REQUEST;

  constructor(message: MessageInput = I18N_MESSAGES.BAD_REQUEST, options?: ApiErrorOptions) {
    super(message, options);
  }
}
