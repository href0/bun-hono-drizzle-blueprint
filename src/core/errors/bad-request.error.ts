import { ApiError, type ErrorDetail } from './api-error';

export class BadRequestError extends ApiError {
  readonly statusCode = 400;
  readonly errorType = 'BAD_REQUEST';
  readonly errorCode = 'ERR_BAD_REQUEST';

  constructor(
    message: string = 'Bad Request',
    details: ErrorDetail[] = [],
    origin: string = 'APP',
  ) {
    super(message, details, origin);
  }
}
