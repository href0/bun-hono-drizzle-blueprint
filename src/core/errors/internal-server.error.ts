import { I18N_MESSAGES } from '../i18n/messages';
import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES } from './error-codes';

/**
 * Broken invariant inside the application (e.g. INSERT … RETURNING produced no row).
 * The message is logged for diagnosis but never sent to the client.
 */
export class InternalServerError extends ApiError {
  readonly statusCode = 500;
  readonly errorType = ERROR_TYPES.INTERNAL_SERVER_ERROR;
  protected readonly defaultCode = APP_ERROR_CODES.INTERNAL;

  constructor(
    message: MessageInput = I18N_MESSAGES.INTERNAL_SERVER_ERROR,
    options?: ApiErrorOptions,
  ) {
    super(message, options);
  }
}
