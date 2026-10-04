import { ApiError, type ErrorDetail } from './api-error';

export class ValidationError extends ApiError {
  readonly statusCode = 400;
  readonly errorType = 'VALIDATION_ERROR';
  readonly errorCode = 'ERR_INVALID_INPUT';

  constructor(
    message: string = 'Validation Failed',
    details: ErrorDetail[] = [],
    origin: string = 'APP',
  ) {
    super(message, details, origin);
  }
}
