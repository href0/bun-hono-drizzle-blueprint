import { ApiError, type ErrorDetail } from './api-error';

export class ExternalServiceError extends ApiError {
  readonly statusCode: number;
  readonly errorType = 'EXTERNAL_SERVICE_ERROR';
  readonly errorCode: string;

  constructor(
    message: string = 'External Service Error',
    details: ErrorDetail[] = [],
    origin: string = 'EXTERNAL',
    statusCode: number = 502,
  ) {
    super(message, details, origin);
    this.statusCode = statusCode;
    this.errorCode = `ERR_EXT_${origin.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  }
}
