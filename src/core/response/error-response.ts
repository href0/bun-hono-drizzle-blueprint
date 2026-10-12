import type { Locale } from '../../config';
import { toSnakeCase } from '../../utils/case-converter.util';
import { ApiError, type ErrorDetail } from '../errors/api-error';
import { ExternalServiceError } from '../errors/external.error';
import { InternalServerError } from '../errors/internal-server.error';
import { I18N_MESSAGES } from '../i18n/messages';
import { translate } from '../i18n/translate';
import { nowIsoUtc } from '../../utils/datetime.util';

/** `user.fullName` → `user.full_name`: field names follow the snake_case wire contract. */
const toWireField = (field: string): string => field.split('.').map(toSnakeCase).join('.');

const toWireDetail = (
  detail: ErrorDetail,
  locale: Locale,
): { field?: string; message: string } => ({
  ...(detail.field === undefined
    ? {}
    : { field: detail.verbatimField ? detail.field : toWireField(detail.field) }),
  message: translate(detail.message, locale),
});

/**
 * The single error envelope of the API, with the message in the request's language.
 * Internal errors keep their own message out of the response; the error handler logs it instead.
 */
export const buildErrorBody = (
  error: ApiError,
  requestId: string,
  locale: Locale,
): Record<string, unknown> => {
  const isInternal = error instanceof InternalServerError;

  return {
    success: false,
    status_code: error.statusCode,
    message: translate(
      isInternal ? I18N_MESSAGES.INTERNAL_SERVER_ERROR : error.userMessage,
      locale,
    ),
    error: {
      type: error.errorType,
      code: error.errorCode,
      origin: error.origin,
      ...(error instanceof ExternalServiceError ? { institution: error.institution } : {}),
      ...(!isInternal && error.details.length > 0
        ? { details: error.details.map((detail) => toWireDetail(detail, locale)) }
        : {}),
    },
    request_id: requestId,
    timestamp: nowIsoUtc(),
  };
};
