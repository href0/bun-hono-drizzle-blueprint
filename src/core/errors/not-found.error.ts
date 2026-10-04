import { ApiError, type ErrorDetail } from './api-error';

export class NotFoundError extends ApiError {
  readonly statusCode = 404;
  readonly errorType = 'NOT_FOUND';
  readonly errorCode = 'ERR_NOT_FOUND';

  constructor(
    message: string = 'Resource Not Found',
    details: ErrorDetail[] = [],
    origin: string = 'APP',
  ) {
    super(message, details, origin);
  }
}
