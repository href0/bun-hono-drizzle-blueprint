import { toSnakeCase } from '../../utils/case-converter.util';
import { ApiError, type ErrorDetail } from '../errors/api-error';
import { InternalServerError } from '../errors/internal-server.error';

const INTERNAL_MESSAGE = 'Internal Server Error';

/** `user.fullName` → `user.full_name`: field names follow the snake_case wire contract. */
const toWireField = (field: string): string => field.split('.').map(toSnakeCase).join('.');

const toWireDetail = (detail: ErrorDetail): ErrorDetail =>
  detail.field === undefined ? detail : { ...detail, field: toWireField(detail.field) };

/**
 * The single error envelope of the API. Internal errors keep their message out of the response;
 * it is logged by the error handler instead.
 */
export const buildErrorBody = (error: ApiError, requestId: string): Record<string, unknown> => {
  const isInternal = error instanceof InternalServerError;

  return {
    success: false,
    status_code: error.statusCode,
    message: isInternal ? INTERNAL_MESSAGE : error.message,
    error: {
      type: error.errorType,
      code: error.errorCode,
      origin: error.origin,
      ...(!isInternal && error.details.length > 0
        ? { details: error.details.map(toWireDetail) }
        : {}),
    },
    request_id: requestId,
    timestamp: new Date().toISOString(),
  };
};
