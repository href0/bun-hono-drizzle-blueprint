import { ApiError, type ErrorDetail } from './api-error';

export class ForbiddenError extends ApiError {
  readonly statusCode = 403;
  readonly errorType = 'FORBIDDEN';
  readonly errorCode = 'ERR_FORBIDDEN';

  constructor(message: string = 'Forbidden', details: ErrorDetail[] = [], origin: string = 'APP') {
    super(message, details, origin);
  }
}
