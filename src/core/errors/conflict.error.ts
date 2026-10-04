import { ApiError, type ErrorDetail } from './api-error';

export class ConflictError extends ApiError {
  readonly statusCode = 409;
  readonly errorType = 'CONFLICT';
  readonly errorCode = 'ERR_CONFLICT';

  constructor(
    message: string = 'Resource Conflict',
    details: ErrorDetail[] = [],
    origin: string = 'APP',
  ) {
    super(message, details, origin);
  }
}
