import { ApiError, type ErrorDetail } from './api-error';

export class UnauthorizedError extends ApiError {
  readonly statusCode = 401;
  readonly errorType = 'UNAUTHORIZED';
  readonly errorCode = 'ERR_UNAUTHORIZED';

  constructor(
    message: string = 'Unauthorized',
    details: ErrorDetail[] = [],
    origin: string = 'APP',
  ) {
    super(message, details, origin);
  }
}
